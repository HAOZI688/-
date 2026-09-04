import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  bigint,
} from "drizzle-orm/pg-core";
import { platform, publicationStatus } from "./enums";
import { contentAssets } from "./content";
import { socialAccounts } from "./social";
import { topics } from "./topics";

/**
 * 发布管理：V1 不自动发布，只做计划与登记（规格 §31）。
 */
export const publications = pgTable(
  "publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => contentAssets.id),
    socialAccountId: uuid("social_account_id").references(() => socialAccounts.id, { onDelete: "set null" }),
    platform: platform("platform").notNull(),
    scheduledDate: date("scheduled_date"),
    publishedDate: timestamp("published_date", { withTimezone: true }),
    publishedUrl: text("published_url"),
    status: publicationStatus("status").notNull().default("planned"),
    /** V4：历史导入生成的占位 Publication（无真实发布动作） */
    historicalImport: integer("historical_import").notNull().default(0),
    dataSource: varchar("data_source", { length: 30 }).notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("publications_topic_idx").on(t.topicId)],
);

/**
 * 内容指标：所有数据必须绑定 Topic_ID（需求十三）。
 */
export const contentMetrics = pgTable(
  "content_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    platform: platform("platform"),
    metricDate: date("metric_date"),
    impressions: bigint("impressions", { mode: "number" }).notNull().default(0),
    views: bigint("views", { mode: "number" }).notNull().default(0),
    reads: bigint("reads", { mode: "number" }).notNull().default(0),
    completionRate: numeric("completion_rate"),
    fiveSecondRetention: numeric("five_second_retention"),
    saveCount: integer("save_count").notNull().default(0),
    shareCount: integer("share_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    profileVisits: integer("profile_visits").notNull().default(0),
    ctaClicks: integer("cta_clicks").notNull().default(0),
    dmCount: integer("dm_count").notNull().default(0),
    registrations: integer("registrations").notNull().default(0),
    materialDownloads: integer("material_downloads").notNull().default(0),
    demoRequests: integer("demo_requests").notNull().default(0),
    consultations: integer("consultations").notNull().default(0),
    salesLeads: integer("sales_leads").notNull().default(0),
    deals: integer("deals").notNull().default(0),
    revenue: numeric("revenue"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("content_metrics_topic_idx").on(t.topicId),
    index("content_metrics_date_idx").on(t.metricDate),
  ],
);

export type Publication = typeof publications.$inferSelect;
export type ContentMetric = typeof contentMetrics.$inferSelect;
