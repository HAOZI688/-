import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accountMetricSnapshots,
  contentMetrics,
  metricDefinitions,
  metricMappings,
  postMetricSnapshots,
  topicPerformanceScores,
  topicPerformances,
} from "@/lib/db/schema";
import { topics } from "@/lib/db/schema";

/**
 * Metrics Repository（规格 §80）：指标定义/映射/快照/Topic Performance。
 * T+1/T+3/T+7/T+30 快照分析基础（规格 §40）。
 */
export const metricsRepository = {
  /* ===== 内容指标（旧 content_metrics 兼容） ===== */
  async getMetricsByTopic(topicId: string) {
    return db.select().from(contentMetrics).where(eq(contentMetrics.topicId, topicId)).orderBy(desc(contentMetrics.metricDate));
  },

  async listAllMetrics(limit = 200) {
    return db
      .select({ m: contentMetrics, topic: topics })
      .from(contentMetrics)
      .innerJoin(topics, eq(contentMetrics.topicId, topics.id))
      .orderBy(desc(contentMetrics.metricDate))
      .limit(limit);
  },

  async upsertContentMetrics(input: typeof contentMetrics.$inferInsert) {
    const rows = await db.insert(contentMetrics).values(input).onConflictDoNothing().returning();
    return rows[0] ?? null;
  },

  /* ===== Metric Definitions / Mappings（规格 §39） ===== */
  async listMetricDefinitions() {
    return db.select().from(metricDefinitions).orderBy(desc(metricDefinitions.createdAt));
  },

  async getMetricDefinition(key: string) {
    const rows = await db.select().from(metricDefinitions).where(eq(metricDefinitions.key, key)).limit(1);
    return rows[0] ?? null;
  },

  async ensureMetricDefinition(input: typeof metricDefinitions.$inferInsert) {
    const existing = await this.getMetricDefinition(input.key);
    if (existing) return existing;
    const rows = await db.insert(metricDefinitions).values(input).returning();
    return rows[0];
  },

  async listMappings(connectorId?: string) {
    return connectorId
      ? db.select().from(metricMappings).where(eq(metricMappings.connectorId, connectorId)).orderBy(desc(metricMappings.createdAt))
      : db.select().from(metricMappings).orderBy(desc(metricMappings.createdAt));
  },

  async createMapping(input: typeof metricMappings.$inferInsert) {
    const rows = await db.insert(metricMappings).values(input).returning();
    return rows[0];
  },

  /* ===== Post Metric Snapshots（规格 §40，T+N 时间序列） ===== */
  async createPostSnapshot(input: typeof postMetricSnapshots.$inferInsert) {
    const rows = await db.insert(postMetricSnapshots).values(input).returning();
    return rows[0];
  },

  /**
   * B-1：幂等快照——键 = external_post_id + captured_at + data_source。
   * 同一 CSV 日期重复导入 → updated（不产生 duplicate created）。
   */
  async upsertPostSnapshot(input: typeof postMetricSnapshots.$inferInsert): Promise<{ row: typeof postMetricSnapshots.$inferSelect; status: "created" | "updated" }> {
    const existing = await db
      .select()
      .from(postMetricSnapshots)
      .where(
        and(
          eq(postMetricSnapshots.externalPostId, input.externalPostId as string),
          eq(postMetricSnapshots.capturedAt, input.capturedAt as Date),
          eq(postMetricSnapshots.dataSource, input.dataSource ?? "xiaodouya_import"),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const rows = await db
        .update(postMetricSnapshots)
        .set({ ...input, id: undefined, createdAt: undefined } as never)
        .where(eq(postMetricSnapshots.id, existing[0].id))
        .returning();
      return { row: rows[0], status: "updated" };
    }
    const rows = await db.insert(postMetricSnapshots).values(input).returning();
    return { row: rows[0], status: "created" };
  },

  async createPostSnapshots(inputs: typeof postMetricSnapshots.$inferInsert[]) {
    if (!inputs.length) return [];
    return db.insert(postMetricSnapshots).values(inputs).returning();
  },

  async listPostSnapshots(externalPostId?: string) {
    return externalPostId
      ? db.select().from(postMetricSnapshots).where(eq(postMetricSnapshots.externalPostId, externalPostId)).orderBy(asc(postMetricSnapshots.capturedAt))
      : db.select().from(postMetricSnapshots).orderBy(desc(postMetricSnapshots.capturedAt)).limit(500);
  },

  async getLatestPostSnapshot(externalPostId: string) {
    const rows = await db
      .select()
      .from(postMetricSnapshots)
      .where(eq(postMetricSnapshots.externalPostId, externalPostId))
      .orderBy(desc(postMetricSnapshots.capturedAt))
      .limit(1);
    return rows[0] ?? null;
  },

  /* ===== Account Metric Snapshots（规格 §41） ===== */
  async createAccountSnapshot(input: typeof accountMetricSnapshots.$inferInsert) {
    const rows = await db.insert(accountMetricSnapshots).values(input).returning();
    return rows[0];
  },

  /**
   * B-1：幂等快照——键 = social_account_id + captured_at + data_source。
   * 同一 CSV 日期重复导入 → updated（不产生 duplicate created）。
   */
  async upsertAccountSnapshot(input: typeof accountMetricSnapshots.$inferInsert): Promise<{ row: typeof accountMetricSnapshots.$inferSelect; status: "created" | "updated" }> {
    const existing = await db
      .select()
      .from(accountMetricSnapshots)
      .where(
        and(
          eq(accountMetricSnapshots.socialAccountId, input.socialAccountId as string),
          eq(accountMetricSnapshots.capturedAt, input.capturedAt as Date),
          eq(accountMetricSnapshots.dataSource, input.dataSource ?? "xiaodouya_import"),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const rows = await db
        .update(accountMetricSnapshots)
        .set({ ...input, id: undefined, createdAt: undefined } as never)
        .where(eq(accountMetricSnapshots.id, existing[0].id))
        .returning();
      return { row: rows[0], status: "updated" };
    }
    const rows = await db.insert(accountMetricSnapshots).values(input).returning();
    return { row: rows[0], status: "created" };
  },

  async listAccountSnapshots(socialAccountId?: string) {
    return socialAccountId
      ? db.select().from(accountMetricSnapshots).where(eq(accountMetricSnapshots.socialAccountId, socialAccountId)).orderBy(asc(accountMetricSnapshots.capturedAt))
      : db.select().from(accountMetricSnapshots).orderBy(desc(accountMetricSnapshots.capturedAt)).limit(500);
  },

  /** 账号最新快照（Metric Freshness 判定源） */
  async getLatestAccountSnapshot(socialAccountId: string) {
    const rows = await db
      .select()
      .from(accountMetricSnapshots)
      .where(eq(accountMetricSnapshots.socialAccountId, socialAccountId))
      .orderBy(desc(accountMetricSnapshots.capturedAt))
      .limit(1);
    return rows[0] ?? null;
  },

  /* ===== Topic Performance（规格 §45，反馈闭环） ===== */
  async listTopicPerformances(period?: string) {
    return period
      ? db.select().from(topicPerformances).where(eq(topicPerformances.period, period)).orderBy(desc(topicPerformances.performanceScore))
      : db.select().from(topicPerformances).orderBy(desc(topicPerformances.createdAt)).limit(200);
  },

  async getTopicPerformance(topicId: string, period: string) {
    const rows = await db
      .select()
      .from(topicPerformances)
      .where(and(eq(topicPerformances.topicId, topicId), eq(topicPerformances.period, period)))
      .limit(1);
    return rows[0] ?? null;
  },

  async upsertTopicPerformance(input: Omit<typeof topicPerformances.$inferInsert, "id" | "createdAt">) {
    const existing = await this.getTopicPerformance(input.topicId, input.period);
    if (existing) {
      const rows = await db
        .update(topicPerformances)
        .set({ ...input, id: undefined, createdAt: undefined } as never)
        .where(eq(topicPerformances.id, existing.id))
        .returning();
      return rows[0];
    }
    const rows = await db.insert(topicPerformances).values(input).returning();
    return rows[0];
  },

  /* ===== Topic Performance V2（V3：全维度评分明细，V1 表保持冻结） ===== */
  async upsertTopicPerformanceScore(input: Omit<typeof topicPerformanceScores.$inferInsert, "id" | "createdAt">) {
    const existing = await db
      .select()
      .from(topicPerformanceScores)
      .where(and(eq(topicPerformanceScores.topicId, input.topicId), eq(topicPerformanceScores.period, input.period)))
      .limit(1);
    if (existing[0]) {
      const rows = await db
        .update(topicPerformanceScores)
        .set({ ...input, id: undefined, createdAt: undefined } as never)
        .where(eq(topicPerformanceScores.id, existing[0].id))
        .returning();
      return rows[0];
    }
    const rows = await db.insert(topicPerformanceScores).values(input).returning();
    return rows[0];
  },

  async listTopicPerformanceScores(period?: string, limit = 200) {
    return period
      ? db.select().from(topicPerformanceScores).where(eq(topicPerformanceScores.period, period)).orderBy(desc(topicPerformanceScores.performanceScore)).limit(limit)
      : db.select().from(topicPerformanceScores).orderBy(desc(topicPerformanceScores.createdAt)).limit(limit);
  },

  async getTopicPerformanceScore(topicId: string, period: string) {
    const rows = await db
      .select()
      .from(topicPerformanceScores)
      .where(and(eq(topicPerformanceScores.topicId, topicId), eq(topicPerformanceScores.period, period)))
      .limit(1);
    return rows[0] ?? null;
  },
};
