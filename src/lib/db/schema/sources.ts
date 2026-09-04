import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sourceConsistency, sourceType, verificationStatus } from "./enums";
import { topics } from "./topics";

/**
 * Source 主档（规格 §9）：独立来源表，跨 Topic 复用。
 * 关键区分：event_date（事件实际发生时间）与 disclosure_date（公开披露时间）可能不同。
 */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 300 }).notNull(),
    url: text("url"),
    sourceType: sourceType("source_type").notNull().default("tech_media"),
    publisher: varchar("publisher", { length: 200 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    eventDate: timestamp("event_date", { withTimezone: true }),
    disclosureDate: timestamp("disclosure_date", { withTimezone: true }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sources_url_idx").on(t.url),
    index("sources_type_idx").on(t.sourceType),
  ],
);

/**
 * Source_Packet：一个 Topic 对应一个来源包，包内多条来源条目。
 */
export const sourcePackets = pgTable(
  "source_packets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    /** 包内来源数据整体一致性；冲突时 = conflict */
    consistency: sourceConsistency("consistency")
      .notNull()
      .default("unverified"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("source_packets_topic_idx").on(t.topicId)],
);

/**
 * Source_Packet_Item：包内单条来源，支持逐条核验。
 * 数字类事实必须保留：来源 / 条件 / 比较对象 / 适用范围（规格 §10）。
 */
export const sourcePacketItems = pgTable(
  "source_packet_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourcePacketId: uuid("source_packet_id")
      .notNull()
      .references(() => sourcePackets.id, { onDelete: "cascade" }),
    /** 关联独立来源主档（可空，兼容旧数据） */
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    sourceName: varchar("source_name", { length: 300 }).notNull(),
    sourceUrl: text("source_url"),
    sourceType: sourceType("source_type").notNull().default("tech_media"),
    /** 来源发布时间 */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** 事件发生时间 */
    eventDate: timestamp("event_date", { withTimezone: true }),
    /** 披露时间 */
    disclosureDate: timestamp("disclosure_date", { withTimezone: true }),
    /** 核心事实 */
    coreFacts: text("core_facts"),
    /** 关键数字（JSONB：{"数字": 值, "单位": ...}），须可被数字测试条件校验 */
    keyNumbers: jsonb("key_numbers"),
    /** 数字测试条件：例如"截至 2026-08-31 官网注册用户数" */
    numberTestConditions: text("number_test_conditions"),
    /** 比较对象：如"上季度 / 竞品 X / 行业均值" */
    comparisonObject: text("comparison_object"),
    /** 适用范围：如"仅限企业客户 / 中国区" */
    applicableScope: text("applicable_scope"),
    verificationStatus: verificationStatus("verification_status")
      .notNull()
      .default("unverified"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("source_packet_items_packet_idx").on(t.sourcePacketId)],
);

export type Source = typeof sources.$inferSelect;
export type SourcePacket = typeof sourcePackets.$inferSelect;
export type SourcePacketItem = typeof sourcePacketItems.$inferSelect;
