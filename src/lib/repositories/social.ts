import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialAccounts } from "@/lib/db/schema";

/**
 * Social Account Repository（规格 §80）：平台账号主档。
 * 小豆芽数据以 Account 为粒度回流（规格 §41）。
 */
export const socialAccountRepository = {
  async list() {
    return db.select().from(socialAccounts).orderBy(desc(socialAccounts.createdAt));
  },

  async listByPlatform(platform: "wechat" | "douyin" | "xiaohongshu" | "bilibili" | "wechat_video" | "kuaishou" | "other") {
    return db.select().from(socialAccounts).where(eq(socialAccounts.platform, platform)).orderBy(desc(socialAccounts.createdAt));
  },

  async getById(id: string) {
    const rows = await db.select().from(socialAccounts).where(eq(socialAccounts.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async create(input: typeof socialAccounts.$inferInsert) {
    const rows = await db.insert(socialAccounts).values(input).returning();
    return rows[0];
  },

  async update(id: string, patch: Partial<Omit<typeof socialAccounts.$inferSelect, "id" | "createdAt">>) {
    const rows = await db
      .update(socialAccounts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(socialAccounts.id, id))
      .returning();
    return rows[0] ?? null;
  },
};
