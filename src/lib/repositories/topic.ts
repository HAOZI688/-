import { asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tags,
  topicRelations,
  topicScoringConfig,
  topicTags,
  topics,
  type NewTopic,
  type Topic,
  type TopicRelation,
} from "@/lib/db/schema";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v);

/**
 * Topic Repository（规格 §80）：Topic 第一核心实体。
 * 血缘不再只靠 parent_topic_id：topic_relations 支持多来源（parent/source/derived/related）。
 */
export const topicRepository = {
  async list() {
    return db.select().from(topics).orderBy(asc(topics.priority), desc(topics.updatedAt));
  },

  async listByStatus(status: Topic["status"]) {
    return db.select().from(topics).where(eq(topics.status, status)).orderBy(desc(topics.updatedAt));
  },

  async getById(id: string) {
    // 兼容 UUID 与业务 ID（如 2026W36-001）两种查询
    const rows = await (isUuid(id)
      ? db.select().from(topics).where(eq(topics.id, id)).limit(1)
      : db.select().from(topics).where(eq(topics.topicId, id)).limit(1));
    return rows[0] ?? null;
  },

  async getByTopicId(topicId: string) {
    const rows = await db.select().from(topics).where(eq(topics.topicId, topicId)).limit(1);
    return rows[0] ?? null;
  },

  async create(input: NewTopic) {
    const rows = await db.insert(topics).values(input).returning();
    return rows[0];
  },

  async update(id: string, patch: Partial<Omit<Topic, "id" | "createdAt">>) {
    const rows = await db
      .update(topics)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(topics.id, id))
      .returning();
    return rows[0] ?? null;
  },

  async updateStatus(id: string, status: Topic["status"]) {
    return this.update(id, { status });
  },

  /** 五维评分 + 总分（规格 §6/§12）。topicScore numeric 列以字符串存储 */
  async updateScores(
    id: string,
    scores: {
      b2bRelevance: number;
      trafficPotential: number;
      conversionPotential: number;
      timeliness: number;
      contentValue: number;
      topicScore: string;
    },
  ) {
    return this.update(id, { ...scores });
  },

  /** 血缘：parentTopicId 兼容 + topic_relations 多来源（规格 §7） */
  async getLineage(topic: Topic) {
    const [parent, legacySources, derived, relations] = await Promise.all([
      topic.parentTopicId ? db.select().from(topics).where(eq(topics.id, topic.parentTopicId)).limit(1) : Promise.resolve([]),
      topic.sourceTopicIds?.length ? db.select().from(topics).where(inArray(topics.id, topic.sourceTopicIds)) : Promise.resolve([]),
      db.select().from(topics).where(eq(topics.parentTopicId, topic.id)).limit(20),
      db
        .select()
        .from(topicRelations)
        .where(or(eq(topicRelations.sourceTopicId, topic.id), eq(topicRelations.targetTopicId, topic.id)))
        .limit(100),
    ]);
    return {
      parent: parent[0] ?? null,
      sources: legacySources as Topic[],
      derived: derived as Topic[],
      relations: relations as TopicRelation[],
    };
  },

  async listRelations(topicId: string) {
    return db
      .select()
      .from(topicRelations)
      .where(or(eq(topicRelations.sourceTopicId, topicId), eq(topicRelations.targetTopicId, topicId)))
      .limit(100);
  },

  async addRelation(sourceTopicId: string, targetTopicId: string, relationType: TopicRelation["relationType"]) {
    const rows = await db
      .insert(topicRelations)
      .values({ sourceTopicId, targetTopicId, relationType })
      .onConflictDoNothing()
      .returning();
    return rows[0] ?? null;
  },

  async getDerivedTopics(topicId: string) {
    return db.select().from(topics).where(eq(topics.parentTopicId, topicId)).orderBy(desc(topics.updatedAt)).limit(20);
  },

  /* ===== Tags（规格 §8） ===== */

  async ensureTag(name: string) {
    const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
    const existing = await db.select().from(tags).where(eq(tags.slug, slug)).limit(1);
    if (existing[0]) return existing[0];
    const rows = await db.insert(tags).values({ name: name.trim(), slug }).returning();
    return rows[0];
  },

  async attachTag(topicId: string, tagId: string) {
    await db.insert(topicTags).values({ topicId, tagId }).onConflictDoNothing();
  },

  async getTags(topicId: string) {
    return db
      .select({ tag: tags })
      .from(topicTags)
      .innerJoin(tags, eq(topicTags.tagId, tags.id))
      .where(eq(topicTags.topicId, topicId));
  },

  /* ===== 评分配置（规格 §12，权重不写死） ===== */

  async getScoringConfig() {
    const rows = await db.select().from(topicScoringConfig).where(eq(topicScoringConfig.active, 1)).limit(1);
    return rows[0] ?? null;
  },

  async setScoringConfig(input: { b2bWeight: number; trafficWeight: number; conversionWeight: number; timelinessWeight: number; contentValueWeight: number }) {
    const active = await this.getScoringConfig();
    if (active) {
      const rows = await db
        .update(topicScoringConfig)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(topicScoringConfig.id, active.id))
        .returning();
      return rows[0];
    }
    const rows = await db.insert(topicScoringConfig).values(input).returning();
    return rows[0];
  },
};
