import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { selectionBasis, snapshotType, verificationStatus } from "./enums";

/**
 * GitHub Weekly 快照：建立后不可被未来数据覆盖。
 * Original = 首次抓取；Replay = 基于历史数据重放（不覆盖 Original）。
 */
export const githubSnapshots = pgTable(
  "github_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: varchar("snapshot_id", { length: 32 }).notNull().unique(),
    snapshotType: snapshotType("snapshot_type").notNull().default("original"),
    week: varchar("week", { length: 8 }).notNull(), // 2026W36
    captureTime: timestamp("capture_time", { withTimezone: true })
      .notNull()
      .defaultNow(),
    selectionBasis: selectionBasis("selection_basis")
      .notNull()
      .default("pure_weekly_rank"),
    /** B-4 §3：统计口径（周一 00:00 ~ 周日 23:59）与抓取约束 */
    statisticsPeriodStart: timestamp("statistics_period_start", { withTimezone: true }),
    statisticsPeriodEnd: timestamp("statistics_period_end", { withTimezone: true }),
    /** Original 一旦生成不可覆盖；后续只能 Replay/Review/Correction */
    immutable: boolean("immutable").notNull().default(false),
    captureSource: varchar("capture_source", { length: 40 }).notNull().default("seed"), // github_search/seed/manual
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("github_snapshots_week_idx").on(t.week)],
);

export const githubSnapshotItems = pgTable(
  "github_snapshot_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => githubSnapshots.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    repository: varchar("repository", { length: 200 }).notNull(),
    projectName: varchar("project_name", { length: 200 }),
    weeklyGrowth: varchar("weekly_growth", { length: 50 }),
    /** B-4 §5：周增长口径必须可溯源（github_trending/github_search_created_this_week/manual_verified/not_available） */
    weeklyGrowthSource: varchar("weekly_growth_source", { length: 40 }),
    totalStars: bigint("total_stars", { mode: "number" }),
    repoUrl: text("repo_url"),
    verificationStatus: verificationStatus("verification_status")
      .notNull()
      .default("unverified"),
    selected: boolean("selected").notNull().default(false),
    eliminationReason: text("elimination_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("github_snapshot_items_snapshot_idx").on(t.snapshotId)],
);

export type GithubSnapshot = typeof githubSnapshots.$inferSelect;
export type GithubSnapshotItem = typeof githubSnapshotItems.$inferSelect;
