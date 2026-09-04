import { asc, desc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeRelations, knowledgeTopics, topics } from "@/lib/db/schema";

/**
 * Knowledge Repository（规格 §80）：常青知识体系 + 概念血缘（upstream/related/downstream）。
 */
export const knowledgeRepository = {
  async listWithTopics() {
    return db
      .select({ k: knowledgeTopics, topic: topics })
      .from(knowledgeTopics)
      .innerJoin(topics, eq(knowledgeTopics.topicId, topics.id))
      .orderBy(desc(knowledgeTopics.updatedAt));
  },

  async list() {
    return db.select().from(knowledgeTopics).orderBy(desc(knowledgeTopics.updatedAt));
  },

  async getByTopic(topicId: string) {
    const rows = await db.select().from(knowledgeTopics).where(eq(knowledgeTopics.topicId, topicId)).limit(1);
    return rows[0] ?? null;
  },

  async getById(id: string) {
    const rows = await db.select().from(knowledgeTopics).where(eq(knowledgeTopics.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async create(input: typeof knowledgeTopics.$inferInsert) {
    const rows = await db.insert(knowledgeTopics).values(input).returning();
    return rows[0];
  },

  async update(id: string, patch: Partial<Omit<typeof knowledgeTopics.$inferSelect, "id" | "createdAt">>) {
    const rows = await db
      .update(knowledgeTopics)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(knowledgeTopics.id, id))
      .returning();
    return rows[0] ?? null;
  },

  /** 概念血缘（规格 §21）：Agent → Tool Use → MCP → Skills … */
  async listRelations(knowledgeTopicId: string) {
    return db
      .select()
      .from(knowledgeRelations)
      .where(
        or(
          eq(knowledgeRelations.sourceKnowledgeTopicId, knowledgeTopicId),
          eq(knowledgeRelations.targetKnowledgeTopicId, knowledgeTopicId),
        ),
      )
      .limit(100);
  },

  async listAllRelations() {
    return db.select().from(knowledgeRelations).orderBy(asc(knowledgeRelations.createdAt)).limit(500);
  },

  async addRelation(sourceId: string, targetId: string, relationType: "upstream" | "related" | "downstream") {
    const rows = await db
      .insert(knowledgeRelations)
      .values({ sourceKnowledgeTopicId: sourceId, targetKnowledgeTopicId: targetId, relationType })
      .onConflictDoNothing()
      .returning();
    return rows[0] ?? null;
  },
};
