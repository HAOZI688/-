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
import { workflowRunStatus, workflowType } from "./enums";
import { sourcePackets } from "./sources";
import { topics } from "./topics";

/**
 * Workflow 模板：4 个子工作流 + Orchestrator。
 * Prompt 不写死在页面组件，模板引用 /ai-prompts 目录的提示词文件。
 */
export const workflowTemplates = pgTable("workflow_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  workflowType: workflowType("workflow_type").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  /** 引用的提示词文件路径，如 ai-prompts/ai-weekly/main.md */
  promptFile: text("prompt_file"),
  config: jsonb("config").default({}),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Workflow Run：一次执行记录（需求五）。
 */
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowType: workflowType("workflow_type").notNull(),
    templateId: uuid("template_id").references(() => workflowTemplates.id),
    topicId: uuid("topic_id").references(() => topics.id),
    /** 批次 ID，如 2026W36-AI-WEEKLY */
    batchId: varchar("batch_id", { length: 64 }),
    inputPayload: jsonb("input_payload").default({}),
    sourcePacketId: uuid("source_packet_id").references(() => sourcePackets.id),
    status: workflowRunStatus("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** V4：模型全部失败进入人工介入态（needs_manual） */
    needsManual: boolean("needs_manual").notNull().default(false),
    /** V4：重试次数（幂等 retry，不重复创建 writeback 产物） */
    retryCount: integer("retry_count").notNull().default(0),
    output: jsonb("output").default({}),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("workflow_runs_type_idx").on(t.workflowType),
    index("workflow_runs_status_idx").on(t.status),
    index("workflow_runs_batch_idx").on(t.batchId),
    index("workflow_runs_topic_idx").on(t.topicId),
  ],
);

/**
 * Workflow Task：Run 内的子任务（fetch → verify → score → produce）。
 */
export const workflowTasks = pgTable(
  "workflow_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    taskKey: varchar("task_key", { length: 64 }).notNull(),
    label: varchar("label", { length: 120 }),
    status: workflowRunStatus("status").notNull().default("queued"),
    /** V4：重试次数（task 级幂等重试） */
    retryCount: integer("retry_count").notNull().default(0),
    input: jsonb("input").default({}),
    output: jsonb("output").default({}),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("workflow_tasks_run_idx").on(t.runId)],
);

/**
 * Workflow Output：Run 产生的输出（脚本、提纲、衍生 Topic 引用等）。
 */
export const workflowOutputs = pgTable("workflow_outputs", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  outputType: varchar("output_type", { length: 64 }).notNull(),
  label: varchar("label", { length: 200 }),
  content: text("content"),
  refTopicId: uuid("ref_topic_id").references(() => topics.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type WorkflowTask = typeof workflowTasks.$inferSelect;
export type WorkflowOutput = typeof workflowOutputs.$inferSelect;
