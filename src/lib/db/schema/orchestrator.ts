import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { weeklyPlanItemStatus, weeklyPlanStatus, workflowType } from "./enums";
import { topics } from "./topics";
import { workflowRuns } from "./workflows";

/**
 * V2 Orchestrator 增量（不触碰 V1 核心表）：
 * - workflow_dependencies：类型级依赖 DAG（ai_weekly → evergreen，github_weekly → evergreen → wechat_deep_dive）
 * - workflow_inputs：每次 run 的输入快照（与 run.input_payload 冗余，但保留每次写入的独立记录）
 * - weekly_plans：Orchestrator 生成的周计划（draft → confirmed → production → completed）
 * - weekly_plan_items：计划明细（选题 + 路由 + 配额 + 对应 run）
 */

/** 类型级依赖：parent 全部完成后才触发 child（gate=all） */
export const workflowDependencies = pgTable(
  "workflow_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentWorkflowType: workflowType("parent_workflow_type").notNull(),
    childWorkflowType: workflowType("child_workflow_type").notNull(),
    /** 触发条件：all = 同计划下该类型所有 parent 项完成才触发 */
    gate: varchar("gate", { length: 20 }).notNull().default("all"),
    active: integer("active").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("workflow_dependencies_child_idx").on(t.childWorkflowType),
    index("workflow_dependencies_parent_idx").on(t.parentWorkflowType),
  ],
);

/** run 输入快照：Orchestrator 每次写回 WorkflowInput 的落库 */
export const workflowInputs = pgTable(
  "workflow_inputs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    workflowType: workflowType("workflow_type").notNull(),
    inputKey: varchar("input_key", { length: 64 }).notNull(),
    payload: jsonb("payload").default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("workflow_inputs_run_idx").on(t.runId)],
);

/** 周计划（Orchestrator 产出物，week_prefix 唯一） */
export const weeklyPlans = pgTable(
  "weekly_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 如 2026W37 */
    weekPrefix: varchar("week_prefix", { length: 16 }).notNull().unique(),
    status: weeklyPlanStatus("status").notNull().default("draft"),
    /** 本轮产能配额，如 {"ai_weekly":1,"github_weekly":1,"evergreen":1,"wechat_deep_dive":2} */
    quota: jsonb("quota").default({}),
    /** 扫描摘要：候选数 / 评分 Top / 上一周期表现（Topic Feedback） */
    scanSummary: jsonb("scan_summary").default({}),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("weekly_plans_week_idx").on(t.weekPrefix)],
);

/** 周计划明细：一个选题 + 路由 + 状态 + 关联 run */
export const weeklyPlanItems = pgTable(
  "weekly_plan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => weeklyPlans.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    workflowType: workflowType("workflow_type").notNull(),
    priority: varchar("priority", { length: 4 }).notNull().default("P3"),
    topicScore: numeric("topic_score", { precision: 4, scale: 1 }),
    status: weeklyPlanItemStatus("status").notNull().default("pending"),
    runId: uuid("run_id").references(() => workflowRuns.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("weekly_plan_items_plan_idx").on(t.planId),
    index("weekly_plan_items_topic_idx").on(t.topicId),
    index("weekly_plan_items_run_idx").on(t.runId),
  ],
);

export type WorkflowDependency = typeof workflowDependencies.$inferSelect;
export type WorkflowInput = typeof workflowInputs.$inferSelect;
export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type WeeklyPlanItem = typeof weeklyPlanItems.$inferSelect;
