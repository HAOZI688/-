import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { githubSnapshotItems, githubSnapshots } from "@/lib/db/schema";

/**
 * GitHub Weekly Repository（规格 §80）：快照不可被未来数据覆盖。
 * Original = 首次抓取；Replay = 历史重放，绝不更新 Original 行。
 */
export const githubRepository = {
  async listSnapshots() {
    return db.select().from(githubSnapshots).orderBy(desc(githubSnapshots.captureTime));
  },

  async getSnapshot(snapshotId: string) {
    const rows = await db.select().from(githubSnapshots).where(eq(githubSnapshots.id, snapshotId)).limit(1);
    return rows[0] ?? null;
  },

  async getSnapshotBySnapshotId(snapshotId: string) {
    const rows = await db.select().from(githubSnapshots).where(eq(githubSnapshots.snapshotId, snapshotId)).limit(1);
    return rows[0] ?? null;
  },

  async getItems(snapshotId: string) {
    return db
      .select()
      .from(githubSnapshotItems)
      .where(eq(githubSnapshotItems.snapshotId, snapshotId))
      .orderBy(asc(githubSnapshotItems.rank));
  },

  async createSnapshot(input: typeof githubSnapshots.$inferInsert) {
    const rows = await db.insert(githubSnapshots).values(input).returning();
    return rows[0];
  },

  async addItems(snapshotId: string, items: (Partial<typeof githubSnapshotItems.$inferInsert> & { rank: number; repository: string })[]) {
    if (!items.length) return [];
    return db
      .insert(githubSnapshotItems)
      .values(items.map((i) => ({ ...i, snapshotId })))
      .returning();
  },

  async setItemSelected(itemId: string, selected: boolean, eliminationReason?: string | null) {
    const rows = await db
      .update(githubSnapshotItems)
      .set({ selected, eliminationReason: eliminationReason ?? null })
      .where(eq(githubSnapshotItems.id, itemId))
      .returning();
    return rows[0] ?? null;
  },

  async verifyItem(itemId: string, verificationStatus: "verified" | "unverified" | "conflict") {
    const rows = await db
      .update(githubSnapshotItems)
      .set({ verificationStatus })
      .where(eq(githubSnapshotItems.id, itemId))
      .returning();
    return rows[0] ?? null;
  },
};
