import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { topics } from "./topics";

/** 标签（规格 §8）：趋势标签独立成表，支撑「哪个标签表现最好」分析 */
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    /** 归一化小写形式，用于查重 */
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("tags_slug_idx").on(t.slug)],
);

/** Topic × Tag 多对多 */
export const topicTags = pgTable(
  "topic_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("topic_tags_topic_idx").on(t.topicId),
    index("topic_tags_tag_idx").on(t.tagId),
  ],
);

export type Tag = typeof tags.$inferSelect;
export type TopicTag = typeof topicTags.$inferSelect;
