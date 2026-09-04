import { boolean, index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { platform, socialAccountStatus } from "./enums";

/**
 * Social Account（规格 §32）：平台账号主档。
 * Publication 绑定 Account；小豆芽数据以 Account 为粒度回流。
 */
export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: platform("platform").notNull(),
    accountName: varchar("account_name", { length: 200 }).notNull(),
    externalAccountId: varchar("external_account_id", { length: 200 }),
    avatarUrl: text("avatar_url"),
    status: socialAccountStatus("status").notNull().default("active"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("social_accounts_platform_idx").on(t.platform)],
);

/**
 * Visual Template（规格 §30）：内容尺寸与视觉约束。
 * GitHub Weekly 1122×1402（4:5）、公众号封面 2.35:1、短视频 9:16。
 */
export const visualTemplates = pgTable("visual_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  aspectRatio: varchar("aspect_ratio", { length: 20 }),
  layoutConfig: text("layout_config"),
  brandAssetIds: text("brand_asset_ids").array().default([]),
  active: boolean("active").notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type VisualTemplate = typeof visualTemplates.$inferSelect;
