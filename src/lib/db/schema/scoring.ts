import { integer, pgTable, text, timestamp, uuid, varchar, numeric } from "drizzle-orm/pg-core";

/**
 * Topic Scoring Config（规格 §12）：评分权重可配置，不写死在 UI。
 * 默认：B2B 25% / Traffic 20% / Conversion 20% / Timeliness 15% / Content Value 20%。
 */
export const topicScoringConfig = pgTable("topic_scoring_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull().default("default"),
  /** 权重百分比，合计应=100 */
  b2bWeight: integer("b2b_weight").notNull().default(25),
  trafficWeight: integer("traffic_weight").notNull().default(20),
  conversionWeight: integer("conversion_weight").notNull().default(20),
  timelinessWeight: integer("timeliness_weight").notNull().default(15),
  contentValueWeight: integer("content_value_weight").notNull().default(20),
  /** 类型化权重覆盖（JSON：{"scenario": {"b2b": 30, ...}}），可空 */
  typeOverrides: text("type_overrides"),
  active: integer("active").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TopicScoringConfig = typeof topicScoringConfig.$inferSelect;
