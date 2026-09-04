import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { topics } from "./topics";
import { workflowRuns } from "./workflows";

/* ===== V3 Trend Radar（规格 V3 §10-§16） ===== */

/** 趋势生命周期状态 */
export const trendStatus = pgEnum("trend_status", [
  "emerging",
  "rising",
  "stable",
  "declining",
  "archived",
]);

/** 覆盖状态：内容生产对趋势的覆盖程度 */
export const trendCoverageStatus = pgEnum("trend_coverage_status", [
  "uncovered",
  "partial",
  "covered",
  "saturated",
]);

/**
 * Trend（趋势聚合实体）：把 AI Weekly / GitHub / Topic Bank / 内容表现 / 社交数据
 * 聚合为可运营的趋势簇。回答：这是什么趋势、哪里发现、持续多久、强度多少、覆盖如何。
 */
export const trends = pgTable(
  "trends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 业务唯一键：归一化后的趋势名（如 agent-governance） */
    trendKey: varchar("trend_key", { length: 120 }).notNull().unique(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 80 }).default("general"),
    status: trendStatus("status").notNull().default("emerging"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** 综合趋势分 0-10（trend_scoring_config 权重） */
    currentScore: numeric("current_score", { precision: 4, scale: 1 }),
    /** 速度分 -10..10（上升为正） */
    velocityScore: numeric("velocity_score", { precision: 4, scale: 1 }),
    b2bRelevance: integer("b2b_relevance"),
    /** 来源多样性 0-10 */
    sourceDiversity: numeric("source_diversity", { precision: 4, scale: 1 }),
    coverageStatus: trendCoverageStatus("coverage_status").notNull().default("uncovered"),
    /** 信号级明细（recurrence/velocity/diversity/significance/b2b/content_perf/conversion/knowledge_gap） */
    scoreBreakdown: jsonb("score_breakdown").default({}),
    /** 使用的评分配置版本（config_version 可复盘） */
    configVersion: varchar("config_version", { length: 32 }).default("1.0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trends_status_idx").on(t.status),
    index("trends_score_idx").on(t.currentScore),
    index("trends_last_seen_idx").on(t.lastSeenAt),
  ],
);

/** 趋势来源证据：一条趋势由哪些来源事件支撑 */
export const trendSources = pgTable(
  "trend_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trendId: uuid("trend_id")
      .notNull()
      .references(() => trends.id, { onDelete: "cascade" }),
    /** ai_weekly / github_weekly / knowledge / manual / content_performance / social_data / user_question */
    sourceType: varchar("source_type", { length: 40 }).notNull(),
    sourceTopicId: uuid("source_topic_id").references(() => topics.id, { onDelete: "set null" }),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, { onDelete: "set null" }),
    /** 来源权重（signal 贡献） */
    weight: numeric("weight", { precision: 4, scale: 2 }),
    /** 证据文本：抓到的标题/片段 */
    evidence: text("evidence"),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trend_sources_trend_idx").on(t.trendId),
    index("trend_sources_topic_idx").on(t.sourceTopicId),
  ],
);

/** 趋势 × Topic 关系（source=来源 / covered=已覆盖 / suggested=建议生产 / derived=衍生） */
export const trendTopics = pgTable(
  "trend_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trendId: uuid("trend_id")
      .notNull()
      .references(() => trends.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    relation: varchar("relation", { length: 20 }).notNull().default("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trend_topics_trend_idx").on(t.trendId),
    index("trend_topics_topic_idx").on(t.topicId),
  ],
);

/** 趋势时间线快照：每次计算落一条，支撑 velocity / 走势图 */
export const trendSnapshots = pgTable(
  "trend_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trendId: uuid("trend_id")
      .notNull()
      .references(() => trends.id, { onDelete: "cascade" }),
    snapshotDate: timestamp("snapshot_date", { withTimezone: true }).notNull().defaultNow(),
    currentScore: numeric("current_score", { precision: 4, scale: 1 }),
    velocityScore: numeric("velocity_score", { precision: 4, scale: 1 }),
    sourceCount: integer("source_count").notNull().default(0),
    coveredTopicCount: integer("covered_topic_count").notNull().default(0),
    signals: jsonb("signals").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trend_snapshots_trend_idx").on(t.trendId),
    index("trend_snapshots_date_idx").on(t.snapshotDate),
  ],
);

/**
 * Trend Scoring Config（规格 V3 §13）：权重可配置，不写死在 UI。
 * 信号：Recurrence / Velocity / Source Diversity / Technical Significance / B2B / Content Perf / Conversion / Knowledge Gap。
 */
export const trendScoringConfig = pgTable(
  "trend_scoring_config",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull().default("default"),
    recurrenceWeight: integer("recurrence_weight").notNull().default(15),
    velocityWeight: integer("velocity_weight").notNull().default(15),
    sourceDiversityWeight: integer("source_diversity_weight").notNull().default(10),
    technicalSignificanceWeight: integer("technical_significance_weight").notNull().default(15),
    b2bWeight: integer("b2b_weight").notNull().default(15),
    contentPerformanceWeight: integer("content_performance_weight").notNull().default(10),
    conversionWeight: integer("conversion_weight").notNull().default(10),
    knowledgeGapWeight: integer("knowledge_gap_weight").notNull().default(10),
    /** 技术显著性关键词（命中提分），JSON 数组 */
    techKeywords: text("tech_keywords").default('["agent","ai","llm","model","mcp","rpa","automation"]'),
    active: integer("active").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export type Trend = typeof trends.$inferSelect;
export type TrendSource = typeof trendSources.$inferSelect;
export type TrendTopic = typeof trendTopics.$inferSelect;
export type TrendSnapshot = typeof trendSnapshots.$inferSelect;
export type TrendScoringConfig = typeof trendScoringConfig.$inferSelect;
