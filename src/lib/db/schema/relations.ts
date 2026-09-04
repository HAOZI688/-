import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { knowledgeRelationType, topicRelationType } from "./enums";
import { topics } from "./topics";
import { knowledgeTopics } from "./knowledge";

/**
 * Topic Relation（规格 §7）：多来源血缘。
 * 不依赖 parent_topic_id 单指针：parent / source / derived / related 都落在本表。
 * 语义：source_topic_id → target_topic_id（source_topic 是 source）。
 */
export const topicRelations = pgTable(
  "topic_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceTopicId: uuid("source_topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    targetTopicId: uuid("target_topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    relationType: topicRelationType("relation_type").notNull().default("source"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("topic_relations_source_idx").on(t.sourceTopicId),
    index("topic_relations_target_idx").on(t.targetTopicId),
  ],
);

/**
 * Knowledge Relation（规格 §21）：知识概念上下游。
 * 例：Agent → Tool Use → MCP → Skills → Plugins → Governance
 */
export const knowledgeRelations = pgTable(
  "knowledge_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceKnowledgeTopicId: uuid("source_knowledge_topic_id")
      .notNull()
      .references(() => knowledgeTopics.id, { onDelete: "cascade" }),
    targetKnowledgeTopicId: uuid("target_knowledge_topic_id")
      .notNull()
      .references(() => knowledgeTopics.id, { onDelete: "cascade" }),
    relationType: knowledgeRelationType("relation_type").notNull().default("related"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("knowledge_relations_source_idx").on(t.sourceKnowledgeTopicId),
    index("knowledge_relations_target_idx").on(t.targetKnowledgeTopicId),
  ],
);

export type TopicRelation = typeof topicRelations.$inferSelect;
export type KnowledgeRelation = typeof knowledgeRelations.$inferSelect;
