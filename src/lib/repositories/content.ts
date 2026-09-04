import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  brandAssets,
  contentAssets,
  contentVersions,
  visualTemplates,
  type ContentAsset,
} from "@/lib/db/schema";
import { topics } from "@/lib/db/schema";

/**
 * Content Repository（规格 §80）：Content Asset 与 Topic 严格分离。
 * 所有正式修改必须落 content_versions（规格 §26）。
 */
export const contentRepository = {
  async getAssetsByTopic(topicId: string) {
    return db.select().from(contentAssets).where(eq(contentAssets.topicId, topicId)).orderBy(desc(contentAssets.updatedAt));
  },

  async getAssetById(id: string) {
    const rows = await db.select().from(contentAssets).where(eq(contentAssets.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async listAllAssets(limit = 200) {
    return db
      .select({ asset: contentAssets, topic: topics })
      .from(contentAssets)
      .innerJoin(topics, eq(contentAssets.topicId, topics.id))
      .orderBy(desc(contentAssets.updatedAt))
      .limit(limit);
  },

  async createAsset(input: typeof contentAssets.$inferInsert) {
    const rows = await db.insert(contentAssets).values(input).returning();
    return rows[0];
  },

  async updateAsset(id: string, patch: Partial<Omit<ContentAsset, "id" | "createdAt">>) {
    const rows = await db
      .update(contentAssets)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(contentAssets.id, id))
      .returning();
    return rows[0] ?? null;
  },

  /** 版本化：修改前先存档当前内容（规格 §26） */
  async createVersion(assetId: string, version: number, content: string, changeSummary?: string, createdBy?: string) {
    const rows = await db
      .insert(contentVersions)
      .values({ contentAssetId: assetId, version, content, changeSummary, createdBy })
      .returning();
    return rows[0];
  },

  async listVersions(assetId: string) {
    return db.select().from(contentVersions).where(eq(contentVersions.contentAssetId, assetId)).orderBy(desc(contentVersions.version));
  },

  /* ===== Brand Assets / Visual Templates（规格 §29/§30） ===== */

  async listBrandAssets() {
    return db.select().from(brandAssets).orderBy(desc(brandAssets.updatedAt));
  },

  async createBrandAsset(input: typeof brandAssets.$inferInsert) {
    const rows = await db.insert(brandAssets).values(input).returning();
    return rows[0];
  },

  async listVisualTemplates() {
    return db.select().from(visualTemplates).orderBy(desc(visualTemplates.updatedAt));
  },

  async createVisualTemplate(input: typeof visualTemplates.$inferInsert) {
    const rows = await db.insert(visualTemplates).values(input).returning();
    return rows[0];
  },
};
