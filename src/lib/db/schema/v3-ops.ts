import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { topics } from "./topics";

/* ===== V3 Ops：通知中心 / 导入映射模板 / Topic 表现 V2（规格 V3 §27/§7/§22） ===== */

/**
 * 通知中心（规格 V3 §27）：基础通知，不做复杂推送。
 * type 覆盖：weekly_plan_ready / workflow_failed / content_needs_review /
 * publication_needs_confirmation / data_sync_failed / unmatched_external_post /
 * metrics_stale / trend_p0_detected / attribution_completed。
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 40 }).notNull(),
    severity: varchar("severity", { length: 10 }).notNull().default("info"),
    title: varchar("title", { length: 200 }).notNull(),
    message: text("message"),
    /** 跳转链接（/review 等） */
    link: varchar("link", { length: 300 }),
    entityType: varchar("entity_type", { length: 60 }),
    entityId: varchar("entity_id", { length: 64 }),
    read: integer("read").notNull().default(0),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_type_idx").on(t.type),
    index("notifications_read_idx").on(t.read),
    index("notifications_created_idx").on(t.createdAt),
  ],
);

/**
 * Import Mapping Template（规格 V3 §7）：不同版本小豆芽导出的字段映射模板。
 * 导入时 detect columns → match template → suggest mapping → user confirm → import；
 * 无匹配时可保存新模板复用。
 */
export const importMappingTemplates = pgTable(
  "import_mapping_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectorType: varchar("connector_type", { length: 40 }).notNull().default("xiaodouya"),
    /** account / post / account_metrics / post_metrics */
    dataType: varchar("data_type", { length: 30 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    version: varchar("version", { length: 20 }).notNull().default("1.0"),
    /** 列映射：{"作品ID": "external_post_id", "播放量": "views", ...} */
    columnMapping: jsonb("column_mapping").notNull().default({}),
    /** 期望列（检测命中即认为模板匹配） */
    requiredColumns: text("required_columns").default("[]"),
    active: integer("active").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mapping_templates_type_idx").on(t.dataType),
    index("mapping_templates_active_idx").on(t.active),
  ],
);

/**
 * Topic Performance V2（规格 V3 §22）：扩展评分维度（Follower / Trend / Account Growth / Conversion）。
 * V1 topic_performances 保持只增不改（V1 冻结）；本表存放 V2 全维度明细。
 */
export const topicPerformanceScores = pgTable(
  "topic_performance_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    period: varchar("period", { length: 8 }).notNull(),
    trafficScore: numeric("traffic_score", { precision: 4, scale: 1 }),
    engagementScore: numeric("engagement_score", { precision: 4, scale: 1 }),
    followerScore: numeric("follower_score", { precision: 4, scale: 1 }),
    leadScore: numeric("lead_score", { precision: 4, scale: 1 }),
    conversionScore: numeric("conversion_score", { precision: 4, scale: 1 }),
    trendScore: numeric("trend_score", { precision: 4, scale: 1 }),
    performanceScore: numeric("performance_score", { precision: 4, scale: 1 }),
    /** Increase Investment / Continue / Maintain / Traffic Only / Conversion Focus / Refresh / Pause / Saturated */
    recommendation: varchar("recommendation", { length: 40 }),
    /** 如 HIGH_CONVERSION / RISING_TREND / HIGH_FOLLOWER_IMPACT / HIGH_TRAFFIC_LOW_CONVERSION / CONTENT_SATURATION / LOW_PERFORMANCE / KNOWLEDGE_GAP */
    reasonCodes: text("reason_codes").array().default([]),
    dataSource: varchar("data_source", { length: 30 }).notNull().default("xiaodouya_import"),
    metrics: jsonb("metrics").default({}),
    configVersion: varchar("config_version", { length: 32 }).default("1.0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("topic_perf_scores_topic_idx").on(t.topicId),
    index("topic_perf_scores_period_idx").on(t.period),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type ImportMappingTemplate = typeof importMappingTemplates.$inferSelect;
export type TopicPerformanceScore = typeof topicPerformanceScores.$inferSelect;
