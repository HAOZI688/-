import { index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
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
    /** V4：匹配方式（external_post_id / external_url / platform_time / title_similarity / manual） */
    matchMethod: varchar("match_method", { length: 30 }),
    /** V4：自动匹配命中的 Publication（外键保留 publicationId 兼容 V1） */
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    manualConfirmedBy: varchar("manual_confirmed_by", { length: 120 }),
    /** V4：数据来源标记（seed/manual/xiaodouya_import/historical_import/…） */
    dataSource: varchar("data_source", { length: 30 }).notNull().default("xiaodouya_import"),
    /** V4：历史导入（首次导入历史作品时无 Publication 对应，标记后仍可后绑） */
    historicalImport: integer("historical_import").notNull().default(0),
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
  /** V4：文件内容 SHA-256（重复文件检测，幂等） */
  fileHash: varchar("file_hash", { length: 64 }),
  /** V4：导入数据类型（posts / accounts / post_metrics / account_metrics），支撑失败行重试 */
  dataType: varchar("data_type", { length: 30 }).notNull().default("posts"),
  /** V4：原始表头（失败行重试 / 导出 CSV 时重建表头） */
  fileHeaders: jsonb("file_headers").default([]),
  /** V4：结构化失败行 [{rowIndex, row, error}]，支撑 Retry Failed Rows / Export Failed Rows */
  failedRowData: jsonb("failed_row_data").default([]),
  /** V4：历史导入模式（首次导入历史数据，无 Publication 不算失败） */
  historicalImport: integer("historical_import").notNull().default(0),
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
