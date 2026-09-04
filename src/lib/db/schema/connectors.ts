import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { connectorStatus, connectorType, mappingStatus, matchStatus } from "./enums";
import { socialAccounts } from "./social";
import { publications } from "./publishing";

/**
 * Data Connector（规格 §34）：小豆芽 / CSV / 手动。
 * V1 实现 File Import Mode；预留 API Mode（未来只替换实现）。
 */
export const dataConnectors = pgTable(
  "data_connectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    connectorType: connectorType("connector_type").notNull().default("csv_import"),
    status: connectorStatus("status").notNull().default("active"),
    config: jsonb("config").default({}),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("data_connectors_type_idx").on(t.connectorType)],
);

/** Connector × Social Account 映射（规格 §35） */
export const connectorAccounts = pgTable(
  "connector_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectorId: uuid("connector_id")
      .notNull()
      .references(() => dataConnectors.id, { onDelete: "cascade" }),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    externalAccountId: varchar("external_account_id", { length: 200 }),
    externalAccountName: varchar("external_account_name", { length: 200 }),
    mappingStatus: mappingStatus("mapping_status").notNull().default("unmapped"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("connector_accounts_connector_idx").on(t.connectorId)],
);

/**
 * External Post（规格 §36）：小豆芽回传的平台作品。
 * 必须与 Publication 建立映射（match_status + match_confidence）。
 */
export const externalPosts = pgTable(
  "external_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicationId: uuid("publication_id").references(() => publications.id, { onDelete: "set null" }),
    connectorId: uuid("connector_id").references(() => dataConnectors.id, { onDelete: "set null" }),
    socialAccountId: uuid("social_account_id").references(() => socialAccounts.id, { onDelete: "set null" }),
    externalPostId: varchar("external_post_id", { length: 200 }).notNull(),
    platform: varchar("platform", { length: 50 }).notNull(),
    title: varchar("title", { length: 500 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    externalUrl: text("external_url"),
    matchStatus: matchStatus("match_status").notNull().default("unmatched"),
    matchConfidence: varchar("match_confidence", { length: 10 }),
    rawData: jsonb("raw_data").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("external_posts_pub_idx").on(t.publicationId),
    index("external_posts_connector_idx").on(t.connectorId),
  ],
);

/** 数据导入批次（规格 §38）：CSV/XLSX 导入全流程留痕 */
export const dataImportBatches = pgTable("data_import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectorId: uuid("connector_id").references(() => dataConnectors.id, { onDelete: "set null" }),
  fileName: varchar("file_name", { length: 300 }).notNull(),
  fileType: varchar("file_type", { length: 20 }).notNull().default("csv"),
  status: varchar("status", { length: 30 }).notNull().default("uploaded"),
  totalRows: text("total_rows"),
  successRows: text("success_rows"),
  failedRows: text("failed_rows"),
  errorLog: text("error_log"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/** 数据同步任务（规格 §42） */
export const dataSyncJobs = pgTable("data_sync_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectorId: uuid("connector_id").references(() => dataConnectors.id, { onDelete: "set null" }),
  syncType: varchar("sync_type", { length: 30 }).notNull().default("post"),
  status: varchar("status", { length: 30 }).notNull().default("queued"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  recordsRead: text("records_read"),
  recordsCreated: text("records_created"),
  recordsUpdated: text("records_updated"),
  recordsFailed: text("records_failed"),
  errorLog: text("error_log"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type DataConnector = typeof dataConnectors.$inferSelect;
export type ConnectorAccount = typeof connectorAccounts.$inferSelect;
export type ExternalPost = typeof externalPosts.$inferSelect;
export type DataImportBatch = typeof dataImportBatches.$inferSelect;
export type DataSyncJob = typeof dataSyncJobs.$inferSelect;
