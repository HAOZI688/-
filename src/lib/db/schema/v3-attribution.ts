import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { externalPosts } from "./connectors";
import { publications } from "./publishing";
import { socialAccounts } from "./social";
import { topics } from "./topics";

/* ===== V3 Follower Attribution（规格 V3 §17-§20） ===== */

/** 归因类型：platform 直接数据 → direct；否则按置信度分级 */
export const attributionType = pgEnum("attribution_type", [
  "direct",
  "high_confidence",
  "probable",
  "assisted",
  "unattributed",
]);

/** 一次归因计算 run（账号 × 时间段，可复盘） */
export const attributionRuns = pgTable(
  "attribution_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    /** 算法版本（规则模型迭代） */
    modelVersion: varchar("model_version", { length: 32 }).notNull().default("v1"),
    /** 使用的归因模型配置版本（config_version 可复盘） */
    configVersion: varchar("config_version", { length: 32 }).default("1.0"),
    status: varchar("status", { length: 20 }).notNull().default("queued"),
    /** observed - expected = incremental */
    observedGrowth: integer("observed_growth").notNull().default(0),
    expectedGrowth: integer("expected_growth").notNull().default(0),
    incrementalGrowth: integer("incremental_growth").notNull().default(0),
    unattributed: integer("unattributed").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("attribution_runs_account_idx").on(t.socialAccountId),
    index("attribution_runs_period_idx").on(t.periodStart),
  ],
);

/** 归因结果：incremental growth 按贡献概率分配到作品/Topic */
export const attributionResults = pgTable(
  "attribution_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => attributionRuns.id, { onDelete: "cascade" }),
    publicationId: uuid("publication_id").references(() => publications.id, { onDelete: "set null" }),
    externalPostId: uuid("external_post_id").references(() => externalPosts.id, { onDelete: "set null" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    attributedFollowers: numeric("attributed_followers", { precision: 6, scale: 1 }),
    attributionScore: numeric("attribution_score", { precision: 4, scale: 3 }),
    attributionType: attributionType("attribution_type").notNull().default("assisted"),
    /** 证据明细：时间窗口 / 播放分位 / 互动 / 主页访问 / 同期作品数 */
    evidence: jsonb("evidence").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("attribution_results_run_idx").on(t.runId),
    index("attribution_results_topic_idx").on(t.topicId),
  ],
);

/** 账号自然增长基线：过去 28 天滚动日均增长（排除异常日） */
export const accountGrowthBaselines = pgTable(
  "account_growth_baselines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    avgDailyGrowth: numeric("avg_daily_growth", { precision: 6, scale: 2 }),
    medianDailyGrowth: numeric("median_daily_growth", { precision: 6, scale: 2 }),
    stdDev: numeric("std_dev", { precision: 6, scale: 2 }),
    /** 排除的异常增长天数 */
    anomalyDays: integer("anomaly_days").notNull().default(0),
    sampleDays: integer("sample_days").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("growth_baselines_account_period_idx").on(t.socialAccountId, t.periodStart, t.periodEnd),
  ],
);

export type AttributionRun = typeof attributionRuns.$inferSelect;
export type AttributionResult = typeof attributionResults.$inferSelect;
export type AccountGrowthBaseline = typeof accountGrowthBaselines.$inferSelect;
