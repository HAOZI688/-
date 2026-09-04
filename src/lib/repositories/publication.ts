import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { publications, type Publication } from "@/lib/db/schema";
import { topics } from "@/lib/db/schema";

/**
 * Publication Repository（规格 §80）：发布计划与登记，绝不自动发布。
 */
export const publicationRepository = {
  async list() {
    return db
      .select({ pub: publications, topic: topics })
      .from(publications)
      .innerJoin(topics, eq(publications.topicId, topics.id))
      .orderBy(desc(publications.updatedAt));
  },

  async listAll() {
    return db.select().from(publications).orderBy(desc(publications.updatedAt));
  },

  async getById(id: string) {
    const rows = await db.select().from(publications).where(eq(publications.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async listByStatus(status: Publication["status"]) {
    return db.select().from(publications).where(eq(publications.status, status)).orderBy(desc(publications.scheduledDate));
  },

  async listByTopic(topicId: string) {
    return db.select().from(publications).where(eq(publications.topicId, topicId)).orderBy(desc(publications.updatedAt));
  },

  async create(input: typeof publications.$inferInsert) {
    const rows = await db.insert(publications).values(input).returning();
    return rows[0];
  },

  async update(id: string, patch: Partial<Omit<Publication, "id" | "createdAt">>) {
    const rows = await db
      .update(publications)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(publications.id, id))
      .returning();
    return rows[0] ?? null;
  },

  async updateStatus(id: string, status: Publication["status"]) {
    return this.update(id, { status });
  },
};
