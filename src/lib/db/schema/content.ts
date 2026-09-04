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
import {
  assetStatus,
  assetType,
  brandAssetType,
  contentRole,
  platform,
} from "./enums";
import { topics } from "./topics";

/**
 * Content Asset：一个 Topic 衍生多种平台资产。
 * 与 topics 严格分开。
 */
export const contentAssets = pgTable(
  "content_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    assetType: assetType("asset_type").notNull(),
    platform: platform("platform"),
    title: varchar("title", { length: 300 }).notNull(),
    content: text("content"),
    contentRole: contentRole("content_role"),
    cta: text("cta"),
    dataSource: varchar("data_source", { length: 30 }).notNull().default("workflow"),
    status: assetStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("content_assets_topic_idx").on(t.topicId),
    index("content_assets_type_idx").on(t.assetType),
  ],
);

/**
 * Content Version（规格 §26）：所有正式修改必须保留版本。
 */
export const contentVersions = pgTable(
  "content_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentAssetId: uuid("content_asset_id")
      .notNull()
      .references(() => contentAssets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    changeSummary: text("change_summary"),
    createdBy: varchar("created_by", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("content_versions_asset_idx").on(t.contentAssetId)],
);

/**
 * Brand Asset Library：Logo / 模板 / 产品截图等。
 * AI 生成图片时禁止自动重绘正式 Logo，必须从本库获取。
 */
export const brandAssets = pgTable("brand_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  type: brandAssetType("type").notNull(),
  fileUrl: text("file_url"),
  version: integer("version").notNull().default(1),
  usageNotes: text("usage_notes"),
  active: boolean("active").notNull().default(true),
  /** V4：锁定（品牌资产被引用/审核通过后禁止 AI 自动替换） */
  locked: boolean("locked").notNull().default(false),
  dataSource: varchar("data_source", { length: 30 }).notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ContentAsset = typeof contentAssets.$inferSelect;
export type ContentVersion = typeof contentVersions.$inferSelect;
export type BrandAsset = typeof brandAssets.$inferSelect;
