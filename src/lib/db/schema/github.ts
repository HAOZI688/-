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
