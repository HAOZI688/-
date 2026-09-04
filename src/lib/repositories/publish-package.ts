/**
 * Publish Package Repository（V4 规格 §13-§17）：一次可发布内容的完整打包。
 */
import { db } from "@/lib/db";
import { publishPackages, brandAssets } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const publishPackageRepository = {
  async create(input: typeof publishPackages.$inferInsert) {
    const rows = await db.insert(publishPackages).values(input).returning();
    return rows[0];
  },

  async getById(id: string) {
    const rows = await db.select().from(publishPackages).where(eq(publishPackages.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async list(limit = 50) {
    return db.select().from(publishPackages).orderBy(desc(publishPackages.createdAt)).limit(limit);
  },

  async listByStatus(status: string, limit = 50) {
    return db.select().from(publishPackages).where(eq(publishPackages.status, status)).orderBy(desc(publishPackages.createdAt)).limit(limit);
  },

  async update(id: string, patch: Partial<Omit<typeof publishPackages.$inferSelect, "id" | "createdAt">>) {
    const rows = await db.update(publishPackages).set({ ...patch, updatedAt: new Date() }).where(eq(publishPackages.id, id)).returning();
    return rows[0] ?? null;
  },

  /* ===== Brand / Visual Assets（V4 规格 §18：上传/预览/版本/启用停用/锁定/引用） ===== */

  async listBrandAssets(limit = 100) {
    return db.select().from(brandAssets).orderBy(desc(brandAssets.createdAt)).limit(limit);
  },

  async getBrandAsset(id: string) {
    const rows = await db.select().from(brandAssets).where(eq(brandAssets.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async createBrandAsset(input: typeof brandAssets.$inferInsert) {
    const rows = await db.insert(brandAssets).values(input).returning();
    return rows[0];
  },

  async updateBrandAsset(id: string, patch: Partial<Omit<typeof brandAssets.$inferSelect, "id" | "createdAt">>) {
    const rows = await db.update(brandAssets).set({ ...patch, updatedAt: new Date() }).where(eq(brandAssets.id, id)).returning();
    return rows[0] ?? null;
  },
};
