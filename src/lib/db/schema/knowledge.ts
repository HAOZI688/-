import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { knowledgeContentStatus, knowledgeStatus } from "./enums";
import { topics } from "./topics";

/**
 * AI Knowledge Topic Bank：常青知识体系。
 * 一个知识 Topic 绑定一个 topics 记录（topic_type=knowledge/evergreen）。
 */
export const knowledgeTopics = pgTable(
  "knowledge_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id")
      .notNull()
      .unique()
      .references(() => topics.id, { onDelete: "cascade" }),
    concept: varchar("concept", { length: 200 }).notNull(),
    category: varchar("category", { length: 100 }),
    knowledgeStatus: knowledgeStatus("knowledge_status")
      .notNull()
      .default("uncovered"),
    contentStatus: knowledgeContentStatus("content_status")
      .notNull()
      .default("to_research"),
    b2bRelevance: integer("b2b_relevance"),
    /** 用户学习成本 1-10 */
    userLearningCost: integer("user_learning_cost"),
    /** 长期价值 1-10 */
    longTermValue: integer("long_term_value"),
    /** 当前热度 1-10 */
    currentHeat: integer("current_heat"),
    upstreamConcepts: text("upstream_concepts").array().default([]),
    relatedConcepts: text("related_concepts").array().default([]),
    downstreamConcepts: text("downstream_concepts").array().default([]),
    existingContent: text("existing_content"),
    nextAction: text("next_action"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export type KnowledgeTopic = typeof knowledgeTopics.$inferSelect;
