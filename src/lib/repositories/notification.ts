import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, type Notification } from "@/lib/db/schema";

/**
 * Notification Repository（V3）：通知中心（基础通知，不做复杂推送）。
 */
export const notificationRepository = {
  async create(input: Partial<Omit<Notification, "id" | "createdAt">> & { type: string; title: string }) {
    const rows = await db.insert(notifications).values(input as typeof notifications.$inferInsert).returning();
    return rows[0];
  },

  async list(limit = 100) {
    return db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
  },

  async listUnread(limit = 50) {
    return db.select().from(notifications).where(eq(notifications.read, 0)).orderBy(desc(notifications.createdAt)).limit(limit);
  },

  async countUnread() {
    const rows = await db.select({ count: db.$count(notifications) }).from(notifications).where(eq(notifications.read, 0));
    return rows[0]?.count ?? 0;
  },

  async markRead(id: string) {
    const rows = await db
      .update(notifications)
      .set({ read: 1, readAt: new Date() })
      .where(eq(notifications.id, id))
      .returning();
    return rows[0] ?? null;
  },

  async markAllRead() {
    return db.update(notifications).set({ read: 1, readAt: new Date() }).where(eq(notifications.read, 0));
  },

  /** 同 type+entity 去重创建：已存在未读则不重复 */
  async createDeduped(input: Partial<Omit<Notification, "id" | "createdAt">> & { type: string; title: string; entityType?: string; entityId?: string }) {
    const existing = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, input.type))
      .limit(20);
    const hit = existing.find(
      (n) =>
        n.read === 0 &&
        (input.entityType ? n.entityType === input.entityType : true) &&
        (input.entityId ? n.entityId === input.entityId : true) &&
        n.title === input.title,
    );
    if (hit) return { notification: hit, created: false };
    const rows = await db.insert(notifications).values(input as typeof notifications.$inferInsert).returning();
    return { notification: rows[0], created: true };
  },
};
