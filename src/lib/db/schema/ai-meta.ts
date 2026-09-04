import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { promptStatus } from "./enums";
import { workflowRuns } from "./workflows";

/**
 * Prompt Template（规格 §56）：提示词不写死在 TS 页面。
 * workflow_templates.prompt_file 引用 ai-prompts 目录文件；本表管理版本元数据。
 */
export const promptTemplates = pgTable("prompt_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  workflowType: varchar("workflow_type", { length: 50 }).notNull(),
  filePath: varchar("file_path", { length: 300 }).notNull(), // ai-prompts/ai-weekly/main.md
  status: promptStatus("status").notNull().default("draft"),
  currentVersion: varchar("current_version", { length: 20 }).notNull().default("1.0"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Prompt 版本（规格 §56）：每个 workflow run 记录使用的版本 */
export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promptTemplateId: uuid("prompt_template_id")
      .notNull()
      .references(() => promptTemplates.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 20 }).notNull(), // V2.0 / V2.1
    content: text("content").notNull(),
    status: promptStatus("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("prompt_versions_template_idx").on(t.promptTemplateId)],
);

/**
 * AI Model（规格 §57）：可注册多个 Provider 的模型。
 * 预留唯元智创等 OpenAI 兼容 Provider。
 */
export const aiModels = pgTable("ai_models", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: varchar("provider", { length: 100 }).notNull(), // openai / anthropic / deepseek / weiyuan
  modelName: varchar("model_name", { length: 200 }).notNull(),
  modelId: varchar("model_id", { length: 200 }).notNull(),
  active: boolean("active").notNull().default(true),
  inputPrice: numeric("input_price"), // 每 1M tokens
  outputPrice: numeric("output_price"),
  capabilities: text("capabilities").array().default([]),
  contextWindow: integer("context_window"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** AI Usage Log（规格 §58）：token / cost / latency，支撑生产成本分析 */
export const aiUsageLogs = pgTable(
  "ai_usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, { onDelete: "set null" }),
    modelId: uuid("model_id").references(() => aiModels.id, { onDelete: "set null" }),
    /** V4：实际使用的 Provider/Model（主备切换后可复盘） */
    provider: varchar("provider", { length: 100 }),
    model: varchar("model", { length: 200 }),
    /** V4：本次调用发生前的重试次数 */
    retryCount: integer("retry_count").notNull().default(0),
    /** V4：使用的 Prompt 版本 */
    promptVersion: varchar("prompt_version", { length: 20 }),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cost: numeric("cost"),
    latency: integer("latency"), // ms
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ai_usage_logs_run_idx").on(t.workflowRunId)],
);

export type PromptTemplate = typeof promptTemplates.$inferSelect;
export type PromptVersion = typeof promptVersions.$inferSelect;
export type AiModel = typeof aiModels.$inferSelect;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;
