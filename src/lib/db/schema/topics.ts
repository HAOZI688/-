import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  historyDedupeStatus,
  priority,
  topicStatus,
  topicType,
} from "./enums";

/**
 * 系统最核心数据实体：一个 Topic 衍生多种 Content Asset。
 * 与 content_assets 严格分开。
 */
export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 业务 ID，如 2026W36-001 */
    topicId: varchar("topic_id", { length: 32 }).notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    /** 血缘：父 Topic（自引用回调需显式返回类型以打破 TS 循环推断） */
    parentTopicId: uuid("parent_topic_id").references((): AnyPgColumn => topics.id),
    /** 血缘：来源 Topics（一个 Topic 由多个 Topic 演变而来） */
    sourceTopicIds: uuid("source_topic_ids").array().default([]),
    topicType: topicType("topic_type").notNull().default("trend"),
    trendTags: text("trend_tags").array().default([]),
    /** 1-10 五维评分 */
    b2bRelevance: integer("b2b_relevance"),
    trafficPotential: integer("traffic_potential"),
    conversionPotential: integer("conversion_potential"),
    timeliness: integer("timeliness"),
    contentValue: integer("content_value"),
    /** 加权总分 0-10（规格 §6：五维评分 → 总分），保留一位小数 */
    topicScore: numeric("topic_score", { precision: 4, scale: 1 }),
    priority: priority("priority").notNull().default("P3"),
    status: topicStatus("status").notNull().default("draft"),
    primaryCta: text("primary_cta"),
    businessRelevance: text("business_relevance"),
    historyDedupeStatus: historyDedupeStatus("history_dedupe_status")
      .notNull()
      .default("not_checked"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("topics_status_idx").on(t.status),
    index("topics_priority_idx").on(t.priority),
    index("topics_type_idx").on(t.topicType),
    index("topics_parent_idx").on(t.parentTopicId),
  ],
);

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
