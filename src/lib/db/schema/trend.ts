import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { topics } from "./topics";

/**
 * 趋势雷达：Orchestrator 维护的候选事件池。
 * 每条事件 = 一个候选（可升格为 Topic）。
 */
export const trendRadarItems = pgTable(
  "trend_radar_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: varchar("batch_id", { length: 64 }),
    title: varchar("title", { length: 300 }).notNull(),
    summary: text("summary"),
    sourceUrl: text("source_url"),
    eventDate: timestamp("event_date", { withTimezone: true }),
    /** 行业影响 / 用户感知 / 技术变化 / 应用价值 / 传播潜力 */
    industryImpact: text("industry_impact"),
    userPerception: text("user_perception"),
    techChange: text("tech_change"),
    applicationValue: text("application_value"),
    spreadPotential: text("spread_potential"),
    /** 入选状态 / 淘汰原因 */
    selected: boolean("selected").notNull().default(false),
    eliminationReason: text("elimination_reason"),
    promotedTopicId: uuid("promoted_topic_id").references(() => topics.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("trend_radar_batch_idx").on(t.batchId)],
);

export type TrendRadarItem = typeof trendRadarItems.$inferSelect;
