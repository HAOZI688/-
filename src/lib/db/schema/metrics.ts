import { index, jsonb, numeric, pgTable, text, timestamp, uuid, varchar, integer } from "drizzle-orm/pg-core";
import { externalPosts } from "./connectors";
import { publications } from "./publishing";
import { socialAccounts } from "./social";
import { topics } from "./topics";

/**
 * Metric Definition（规格 §39）：标准指标主档。
 * 小豆芽原始字段 ≠ 系统标准指标：必须通过 metric_mappings 映射。
 */
export const metricDefinitions = pgTable("metric_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 80 }).notNull().unique(),
  label: varchar("label", { length: 120 }).notNull(),
  category: varchar("category", { length: 40 }).notNull(), // content / account / business
  unit: varchar("unit", { length: 20 }).notNull().default("count"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Metric Mapping（规格 §39）：来源字段 → 标准指标 */
export const metricMappings = pgTable(
  "metric_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectorId: uuid("connector_id"),
    sourceField: varchar("source_field", { length: 120 }).notNull(),
    metricKey: varchar("metric_key", { length: 80 })
      .notNull()
      .references(() => metricDefinitions.key, { onDelete: "cascade" }),
    transform: text("transform"), // 如 *1000 / trim 等说明
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("metric_mappings_metric_idx").on(t.metricKey)],
);

/**
 * Post Metric Snapshot（规格 §40）：作品指标时间快照。
 * T+1 / T+3 / T+7 / T+30 分析的基础，禁止只存最终值。
 */
export const postMetricSnapshots = pgTable(
  "post_metric_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalPostId: uuid("external_post_id").references(() => externalPosts.id, { onDelete: "cascade" }),
    publicationId: uuid("publication_id").references(() => publications.id, { onDelete: "set null" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    impressions: integer("impressions").notNull().default(0),
    views: integer("views").notNull().default(0),
    reads: integer("reads").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    completionRate: numeric("completion_rate"),
    fiveSecondRetention: numeric("five_second_retention"),
    profileVisits: integer("profile_visits").notNull().default(0),
    dataSource: varchar("data_source", { length: 30 }).notNull().default("xiaodouya_import"),
    rawMetrics: jsonb("raw_metrics").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("post_metric_snapshots_post_idx").on(t.externalPostId),
    index("post_metric_snapshots_pub_idx").on(t.publicationId),
    index("post_metric_snapshots_time_idx").on(t.capturedAt),
  ],
);

/**
 * Account Metric Snapshot（规格 §41）：账号级指标快照。
 * 支撑「某天发什么 → 账号涨粉变化」分析。
 */
export const accountMetricSnapshots = pgTable(
  "account_metric_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    followers: integer("followers").notNull().default(0),
    newFollowers: integer("new_followers").notNull().default(0),
    profileVisits: integer("profile_visits").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    views: integer("views").notNull().default(0),
    engagements: integer("engagements").notNull().default(0),
    dataSource: varchar("data_source", { length: 30 }).notNull().default("xiaodouya_import"),
    rawMetrics: jsonb("raw_metrics").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("account_metric_snapshots_acc_idx").on(t.socialAccountId),
    index("account_metric_snapshots_time_idx").on(t.capturedAt),
  ],
);

/** Topic Performance（规格 §45）：Topic 表现聚合 + 推荐动作 */
export const topicPerformances = pgTable(
  "topic_performances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    period: varchar("period", { length: 8 }).notNull(), // 2026W36
    trafficScore: numeric("traffic_score"),
    engagementScore: numeric("engagement_score"),
    leadScore: numeric("lead_score"),
    conversionScore: numeric("conversion_score"),
    performanceScore: numeric("performance_score"),
    recommendation: varchar("recommendation", { length: 60 }),
    dataSource: varchar("data_source", { length: 30 }).notNull().default("xiaodouya_import"),
    metrics: jsonb("metrics").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("topic_performances_topic_idx").on(t.topicId),
    index("topic_performances_period_idx").on(t.period),
  ],
);

export type MetricDefinition = typeof metricDefinitions.$inferSelect;
export type MetricMapping = typeof metricMappings.$inferSelect;
export type PostMetricSnapshot = typeof postMetricSnapshots.$inferSelect;
export type AccountMetricSnapshot = typeof accountMetricSnapshots.$inferSelect;
export type TopicPerformance = typeof topicPerformances.$inferSelect;
