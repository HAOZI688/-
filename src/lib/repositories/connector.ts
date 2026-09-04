import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  connectorAccounts,
  dataConnectors,
  dataImportBatches,
  dataSyncJobs,
  externalPosts,
  importMappingTemplates,
  publications,
} from "@/lib/db/schema";

/**
 * Connector Repository（规格 §80）：小豆芽 / CSV / 手动 连接器。
 * V1 File Import 模式；API Mode 未来只替换实现（规格 §34）。
 */
export const connectorRepository = {
  /* ===== Data Connectors ===== */
  async listConnectors() {
    return db.select().from(dataConnectors).orderBy(desc(dataConnectors.createdAt));
  },

  async getConnector(id: string) {
    const rows = await db.select().from(dataConnectors).where(eq(dataConnectors.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async createConnector(input: typeof dataConnectors.$inferInsert) {
    const rows = await db.insert(dataConnectors).values(input).returning();
    return rows[0];
  },

  async updateConnector(id: string, patch: Partial<Omit<typeof dataConnectors.$inferSelect, "id" | "createdAt">>) {
    const rows = await db
      .update(dataConnectors)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(dataConnectors.id, id))
      .returning();
    return rows[0] ?? null;
  },

  /* ===== Connector × Social Account 映射（规格 §35） ===== */
  async listConnectorAccounts(connectorId: string) {
    return db
      .select({ ca: connectorAccounts })
      .from(connectorAccounts)
      .where(eq(connectorAccounts.connectorId, connectorId))
      .orderBy(asc(connectorAccounts.createdAt));
  },

  async getConnectorAccount(connectorId: string, socialAccountId: string) {
    const rows = await db
      .select()
      .from(connectorAccounts)
      .where(and(eq(connectorAccounts.connectorId, connectorId), eq(connectorAccounts.socialAccountId, socialAccountId)))
      .limit(1);
    return rows[0] ?? null;
  },

  async upsertConnectorAccount(connectorId: string, socialAccountId: string, externalAccountId?: string, externalAccountName?: string) {
    const existing = await this.getConnectorAccount(connectorId, socialAccountId);
    if (existing) {
      const rows = await db
        .update(connectorAccounts)
        .set({ externalAccountId, externalAccountName, mappingStatus: externalAccountId ? "mapped" : existing.mappingStatus })
        .where(eq(connectorAccounts.id, existing.id))
        .returning();
      return rows[0];
    }
    const rows = await db
      .insert(connectorAccounts)
      .values({ connectorId, socialAccountId, externalAccountId, externalAccountName, mappingStatus: externalAccountId ? "mapped" : "unmapped" })
      .returning();
    return rows[0];
  },

  /* ===== External Posts（规格 §36） ===== */
  async listExternalPosts(opts?: { connectorId?: string; matchStatus?: string; limit?: number }) {
    const where = [];
    if (opts?.connectorId) where.push(eq(externalPosts.connectorId, opts.connectorId));
    if (opts?.matchStatus) where.push(eq(externalPosts.matchStatus, opts.matchStatus as never));
    const rows = await db
      .select({ post: externalPosts, publication: publications })
      .from(externalPosts)
      .leftJoin(publications, eq(externalPosts.publicationId, publications.id))
      .where(where.length ? and(...(where as [])) : undefined)
      .orderBy(desc(externalPosts.publishedAt))
      .limit(opts?.limit ?? 200);
    return rows;
  },

  /** 待匹配作品（unmatched + suggested），小豆芽工作台展示 + 手动匹配 */
  async listUnmatchedPosts(connectorId?: string, limit = 200) {
    return db
      .select({ post: externalPosts, publication: publications })
      .from(externalPosts)
      .leftJoin(publications, eq(externalPosts.publicationId, publications.id))
      .where(
        and(
          connectorId ? eq(externalPosts.connectorId, connectorId) : undefined,
          or(eq(externalPosts.matchStatus, "unmatched"), eq(externalPosts.matchStatus, "suggested")),
        ),
      )
      .orderBy(desc(externalPosts.publishedAt))
      .limit(limit);
  },

  async getExternalPost(id: string) {
    const rows = await db.select().from(externalPosts).where(eq(externalPosts.id, id)).limit(1);
    return rows[0] ?? null;
  },

  /** 匹配规则：Post ID → URL → 平台+账号+时间+标题相似度 → 人工（规格 §37） */
  async findExternalPost(connectorId: string, externalPostId?: string, externalUrl?: string) {
    if (externalPostId) {
      const rows = await db
        .select()
        .from(externalPosts)
        .where(and(eq(externalPosts.connectorId, connectorId), eq(externalPosts.externalPostId, externalPostId)))
        .limit(1);
      if (rows[0]) return rows[0];
    }
    if (externalUrl) {
      const rows = await db
        .select()
        .from(externalPosts)
        .where(and(eq(externalPosts.connectorId, connectorId), eq(externalPosts.externalUrl, externalUrl)))
        .limit(1);
      return rows[0] ?? null;
    }
    return null;
  },

  async upsertExternalPost(input: typeof externalPosts.$inferInsert): Promise<{ post: typeof externalPosts.$inferSelect; created: boolean }> {
    const existing = await this.findExternalPost(input.connectorId ?? "", input.externalPostId, input.externalUrl ?? undefined);
    if (existing) {
      const rows = await db
        .update(externalPosts)
        .set({ title: input.title ?? existing.title, publishedAt: input.publishedAt ?? existing.publishedAt, updatedAt: new Date() })
        .where(eq(externalPosts.id, existing.id))
        .returning();
      return { post: rows[0], created: false };
    }
    const rows = await db.insert(externalPosts).values(input).returning();
    return { post: rows[0], created: true };
  },

  async updateExternalPostMatch(postId: string, match: { publicationId?: string | null; matchStatus: "conflict" | "unmatched" | "suggested" | "confirmed"; matchConfidence?: string | null }) {
    const rows = await db
      .update(externalPosts)
      .set({ ...match, updatedAt: new Date() })
      .where(eq(externalPosts.id, postId))
      .returning();
    return rows[0] ?? null;
  },

  /** V4：匹配元数据留痕（match_method / matched_at / manual_confirmed_by） */
  async setExternalPostMatchMeta(postId: string, meta: { matchMethod?: string; matchedAt?: Date; manualConfirmedBy?: string }) {
    const rows = await db
      .update(externalPosts)
      .set({ ...meta, updatedAt: new Date() })
      .where(eq(externalPosts.id, postId))
      .returning();
    return rows[0] ?? null;
  },

  /* ===== Import Batches（规格 §38） ===== */
  async createImportBatch(input: typeof dataImportBatches.$inferInsert) {
    const rows = await db.insert(dataImportBatches).values(input).returning();
    return rows[0];
  },

  async updateImportBatch(id: string, patch: Partial<Omit<typeof dataImportBatches.$inferSelect, "id" | "createdAt">>) {
    const rows = await db.update(dataImportBatches).set(patch).where(eq(dataImportBatches.id, id)).returning();
    return rows[0] ?? null;
  },

  async listImportBatches(limit = 50) {
    return db.select().from(dataImportBatches).orderBy(desc(dataImportBatches.createdAt)).limit(limit);
  },

  async getImportBatch(id: string) {
    const rows = await db.select().from(dataImportBatches).where(eq(dataImportBatches.id, id)).limit(1);
    return rows[0] ?? null;
  },

  /** 重复文件检测：同 hash + 同数据类型且已完成/部分成功的批次即视为已导入 */
  async findDuplicateBatch(fileHash: string, dataType: string) {
    const rows = await db
      .select()
      .from(dataImportBatches)
      .where(and(eq(dataImportBatches.fileHash, fileHash), eq(dataImportBatches.dataType, dataType), inArray(dataImportBatches.status, ["completed", "partial"])))
      .orderBy(desc(dataImportBatches.createdAt))
      .limit(1);
    return rows[0] ?? null;
  },

  /* ===== Sync Jobs（规格 §42） ===== */
  async createSyncJob(input: typeof dataSyncJobs.$inferInsert) {
    const rows = await db.insert(dataSyncJobs).values(input).returning();
    return rows[0];
  },

  async updateSyncJob(id: string, patch: Partial<Omit<typeof dataSyncJobs.$inferSelect, "id" | "createdAt">>) {
    const rows = await db.update(dataSyncJobs).set(patch).where(eq(dataSyncJobs.id, id)).returning();
    return rows[0] ?? null;
  },

  async listSyncJobs(limit = 50) {
    return db.select().from(dataSyncJobs).orderBy(desc(dataSyncJobs.createdAt)).limit(limit);
  },

  /* ===== Import Mapping Templates（V3：不同导出版本字段映射复用） ===== */
  async listMappingTemplates(opts?: { dataType?: string; activeOnly?: boolean }) {
    return db
      .select()
      .from(importMappingTemplates)
      .where(and(opts?.dataType ? eq(importMappingTemplates.dataType, opts.dataType) : undefined, opts?.activeOnly ? eq(importMappingTemplates.active, 1) : undefined))
      .orderBy(desc(importMappingTemplates.createdAt));
  },

  async getMappingTemplate(id: string) {
    const rows = await db.select().from(importMappingTemplates).where(eq(importMappingTemplates.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async createMappingTemplate(input: typeof importMappingTemplates.$inferInsert) {
    const rows = await db.insert(importMappingTemplates).values(input).returning();
    return rows[0];
  },

  async updateMappingTemplate(id: string, patch: Partial<Omit<typeof importMappingTemplates.$inferSelect, "id" | "createdAt">>) {
    const rows = await db
      .update(importMappingTemplates)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(importMappingTemplates.id, id))
      .returning();
    return rows[0] ?? null;
  },
};
