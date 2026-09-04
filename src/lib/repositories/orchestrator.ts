import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  weeklyPlanItems,
  weeklyPlans,
  workflowDependencies,
  workflowInputs,
  type WeeklyPlan,
  type WeeklyPlanItem,
} from "@/lib/db/schema";

/**
 * Orchestrator Repository（V2 增量）：周计划 / 计划项 / 依赖 DAG / run 输入。
 * V1 的 43 张核心表不动，只管理 V2 新增的 4 张表。
 */
export const orchestratorRepository = {
  /* ===== Workflow Dependencies（类型级 DAG） ===== */

  async listDependencies() {
    return db
      .select()
      .from(workflowDependencies)
      .where(eq(workflowDependencies.active, 1))
      .orderBy(asc(workflowDependencies.parentWorkflowType));
  },

  /** 某工作流类型的全部上游类型 */
  async getParents(childWorkflowType: string) {
    return db
      .select()
      .from(workflowDependencies)
      .where(and(eq(workflowDependencies.childWorkflowType, childWorkflowType as never), eq(workflowDependencies.active, 1)));
  },

  /** 某工作流类型的全部下游类型 */
  async getChildren(parentWorkflowType: string) {
    return db
      .select()
      .from(workflowDependencies)
      .where(and(eq(workflowDependencies.parentWorkflowType, parentWorkflowType as never), eq(workflowDependencies.active, 1)));
  },

  async addDependency(parentWorkflowType: string, childWorkflowType: string) {
    const rows = await db
      .insert(workflowDependencies)
      .values({ parentWorkflowType: parentWorkflowType as never, childWorkflowType: childWorkflowType as never })
      .onConflictDoNothing()
      .returning();
    return rows[0] ?? null;
  },

  /* ===== Weekly Plans ===== */

  async getPlan(weekPrefix: string) {
    const rows = await db.select().from(weeklyPlans).where(eq(weeklyPlans.weekPrefix, weekPrefix)).limit(1);
    return rows[0] ?? null;
  },

  async getPlanById(id: string) {
    const rows = await db.select().from(weeklyPlans).where(eq(weeklyPlans.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async listPlans(limit = 20) {
    return db.select().from(weeklyPlans).orderBy(desc(weeklyPlans.weekPrefix)).limit(limit);
  },

  async createPlan(input: Partial<Omit<WeeklyPlan, "id" | "createdAt" | "updatedAt">> & { weekPrefix: string; status: WeeklyPlan["status"] }) {
    const rows = await db.insert(weeklyPlans).values(input as typeof weeklyPlans.$inferInsert).returning();
    return rows[0];
  },

  async updatePlan(id: string, patch: Partial<Omit<WeeklyPlan, "id" | "createdAt">>) {
    const rows = await db
      .update(weeklyPlans)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(weeklyPlans.id, id))
      .returning();
    return rows[0] ?? null;
  },

  /* ===== Weekly Plan Items ===== */

  async getPlanItems(planId: string) {
    return db
      .select()
      .from(weeklyPlanItems)
      .where(eq(weeklyPlanItems.planId, planId))
      .orderBy(asc(weeklyPlanItems.sortOrder));
  },

  async getPlanItem(id: string) {
    const rows = await db.select().from(weeklyPlanItems).where(eq(weeklyPlanItems.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async getItemsByRunId(runId: string) {
    return db.select().from(weeklyPlanItems).where(eq(weeklyPlanItems.runId, runId));
  },

  async getItemsByStatus(planId: string, status: WeeklyPlanItem["status"]) {
    return db.select().from(weeklyPlanItems).where(and(eq(weeklyPlanItems.planId, planId), eq(weeklyPlanItems.status, status)));
  },

  async getItemsByWorkflowType(planId: string, workflowType: string) {
    return db
      .select()
      .from(weeklyPlanItems)
      .where(and(eq(weeklyPlanItems.planId, planId), eq(weeklyPlanItems.workflowType, workflowType as never)));
  },

  async createPlanItems(items: (Partial<Omit<WeeklyPlanItem, "id" | "createdAt" | "updatedAt">> & {
    planId: string;
    topicId: string;
    workflowType: WeeklyPlanItem["workflowType"];
  })[]) {
    if (!items.length) return [];
    return db.insert(weeklyPlanItems).values(items as typeof weeklyPlanItems.$inferInsert[]).returning();
  },

  async updatePlanItem(id: string, patch: Partial<Omit<WeeklyPlanItem, "id" | "createdAt">>) {
    const rows = await db
      .update(weeklyPlanItems)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(weeklyPlanItems.id, id))
      .returning();
    return rows[0] ?? null;
  },

  async updatePlanItems(ids: string[], patch: Partial<Omit<WeeklyPlanItem, "id" | "createdAt">>) {
    if (!ids.length) return [];
    return db.update(weeklyPlanItems).set({ ...patch, updatedAt: new Date() }).where(inArray(weeklyPlanItems.id, ids)).returning();
  },

  /* ===== Workflow Inputs（run 输入快照） ===== */

  async createWorkflowInput(runId: string, workflowType: string, inputKey: string, payload: Record<string, unknown>) {
    const rows = await db
      .insert(workflowInputs)
      .values({ runId, workflowType: workflowType as never, inputKey, payload: payload as never })
      .returning();
    return rows[0];
  },

  async getRunInputs(runId: string) {
    return db.select().from(workflowInputs).where(eq(workflowInputs.runId, runId)).orderBy(asc(workflowInputs.createdAt));
  },
};
