import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { topics } from "./topics";
import { contentAssets } from "./content";
import { socialAccounts } from "./social";
import { githubSnapshots } from "./github";

/* ===== V4 Production Readiness：Publish Package / Action Center / 运营元数据 ===== */

/**
 * Publish Package（规格 V4 §13-§17）：一次可发布内容的完整打包。
 * 至少一个类型（GitHub 周榜）完整走通：正文 + 封面/配图 + CTA + 发布说明。
 * status：draft → needs_assets → needs_review → ready → published
 */
export const publishPackages = pgTable(
  "publish_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 包类型：github_weekly / wechat / generic */
    packageType: varchar("package_type", { length: 40 }).notNull().default("generic"),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    contentAssetId: uuid("content_asset_id").references(() => contentAssets.id, { onDelete: "set null" }),
    platform: varchar("platform", { length: 50 }),
    socialAccountId: uuid("social_account_id").references(() => socialAccounts.id, { onDelete: "set null" }),
    /** GitHub 周榜包的原始快照绑定（数据不可脱离 Snapshot） */
    githubSnapshotId: uuid("github_snapshot_id").references(() => githubSnapshots.id, { onDelete: "set null" }),
    title: varchar("title", { length: 300 }),
    body: text("body"),
    primaryCta: text("primary_cta"),
    hashtags: jsonb("hashtags").default([]),
    /** 视觉资产 ID 列表（封面/卡片顺序即数组顺序） */
    visualAssetIds: jsonb("visual_asset_ids").default([]),
    factQaStatus: varchar("fact_qa_status", { length: 20 }).notNull().default("pending"),
    brandQaStatus: varchar("brand_qa_status", { length: 20 }).notNull().default("pending"),
    contentQaStatus: varchar("content_qa_status", { length: 20 }).notNull().default("pending"),
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    recommendedPublishAt: timestamp("recommended_publish_at", { withTimezone: true }),
    publishNotes: text("publish_notes"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("publish_packages_topic_idx").on(t.topicId),
    index("publish_packages_status_idx").on(t.status),
    index("publish_packages_snapshot_idx").on(t.githubSnapshotId),
  ],
);

/**
 * Action Center（规格 V4 §26）：统一「今天需要处理什么」。
 * 来源：weekly_plan / workflow / review / publication / connector / data_quality / trend / notification。
 * 完成对应动作后自动 resolved。
 */
export const actionItems = pgTable(
  "action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 30 }).notNull(),
    priority: varchar("priority", { length: 10 }).notNull().default("P2"),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    targetUrl: varchar("target_url", { length: 300 }),
    /** open / resolved / dismissed */
    status: varchar("status", { length: 20 }).notNull().default("open"),
    /** 来源实体（如 weekly_plan 的 planId / external_post 的 id），用于完成动作自动 resolved */
    entityType: varchar("entity_type", { length: 60 }),
    entityId: varchar("entity_id", { length: 64 }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("action_items_status_idx").on(t.status),
    index("action_items_type_idx").on(t.type),
    index("action_items_entity_idx").on(t.entityType, t.entityId),
  ],
);

/**
 * 内容验收统计（规格 V4 §38）：AI Content Acceptance Rate。
 * 按 workflow + 周期记录：直接通过 / 修改后通过 / 拒绝。
 */
export const contentAcceptanceStats = pgTable(
  "content_acceptance_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowType: varchar("workflow_type", { length: 50 }).notNull(),
    period: varchar("period", { length: 8 }).notNull(), // 2026W36
    generated: integer("generated").notNull().default(0),
    approvedDirectly: integer("approved_directly").notNull().default(0),
    approvedAfterEdit: integer("approved_after_edit").notNull().default(0),
    rejected: integer("rejected").notNull().default(0),
    revisionCount: integer("revision_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("acceptance_stats_wf_idx").on(t.workflowType, t.period),
  ],
);

export type PublishPackage = typeof publishPackages.$inferSelect;
export type ActionItem = typeof actionItems.$inferSelect;
export type ContentAcceptanceStat = typeof contentAcceptanceStats.$inferSelect;

/** 数据来源标记（规格 V4 §20）：每条核心运营数据必须知道来源 */
export type DataSource = "seed" | "manual" | "xiaodouya_import" | "xiaodouya_api" | "workflow" | "user_input" | "historical_import";
