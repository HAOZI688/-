import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiModels,
  aiUsageLogs,
  promptTemplates,
  promptVersions,
  workflowOutputs,
  workflowRuns,
  workflowTasks,
  workflowTemplates,
  type WorkflowRun,
} from "@/lib/db/schema";
import { topics } from "@/lib/db/schema";

/**
 * Workflow Repository（规格 §80）：模板 / Run / Task / Output / Prompt / AI 模型与用量。
 */
export const workflowRepository = {
  /* ===== Templates ===== */
  async listTemplates() {
    return db.select().from(workflowTemplates).orderBy(asc(workflowTemplates.workflowType));
  },

  async getTemplate(workflowType: "orchestrator" | "ai_weekly" | "github_weekly" | "evergreen" | "wechat_deep_dive") {
    const rows = await db.select().from(workflowTemplates).where(eq(workflowTemplates.workflowType, workflowType)).limit(1);
    return rows[0] ?? null;
  },

  /* ===== Runs ===== */
  async createRun(input: typeof workflowRuns.$inferInsert) {
    const rows = await db.insert(workflowRuns).values(input).returning();
    return rows[0];
  },

  async getRun(id: string) {
    const rows = await db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async listRuns(limit = 100) {
    return db.select().from(workflowRuns).orderBy(desc(workflowRuns.createdAt)).limit(limit);
  },

  async listRunsWithTopic(limit = 100) {
    return db
      .select({ run: workflowRuns, topic: topics })
      .from(workflowRuns)
      .leftJoin(topics, eq(workflowRuns.topicId, topics.id))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(limit);
  },

  async getRunsByTopic(topicId: string) {
    return db.select().from(workflowRuns).where(eq(workflowRuns.topicId, topicId)).orderBy(desc(workflowRuns.createdAt));
  },

  async updateRun(id: string, patch: Partial<Omit<WorkflowRun, "id" | "createdAt">>) {
    const rows = await db.update(workflowRuns).set(patch).where(eq(workflowRuns.id, id)).returning();
    return rows[0] ?? null;
  },

  async updateRunStatus(id: string, status: WorkflowRun["status"], extra?: Partial<Omit<WorkflowRun, "id" | "createdAt">>) {
    return this.updateRun(id, { status, ...extra });
  },

  /** 取消排队中的 run（V3 Error Recovery）：标记 failed + user_cancelled（engine 将 DAG 视作终态） */
  async cancelQueuedRun(id: string) {
    const run = await this.getRun(id);
    if (!run) return null;
    if (run.status !== "queued" && run.status !== "running") return run;
    return this.updateRun(id, { status: "failed", error: "用户取消（queued 未开始）", completedAt: new Date() });
  },

  /* ===== Tasks ===== */
  async getRunTasks(runId: string) {
    return db.select().from(workflowTasks).where(eq(workflowTasks.runId, runId)).orderBy(asc(workflowTasks.startedAt));
  },

  async createTask(runId: string, task: Partial<typeof workflowTasks.$inferInsert> & { taskKey: string }) {
    const rows = await db.insert(workflowTasks).values({ ...task, runId }).returning();
    return rows[0];
  },

  async updateTask(runId: string, taskKey: string, patch: Partial<Omit<typeof workflowTasks.$inferSelect, "id" | "runId">>) {
    const rows = await db
      .update(workflowTasks)
      .set(patch)
      .where(and(eq(workflowTasks.runId, runId), eq(workflowTasks.taskKey, taskKey)))
      .returning();
    return rows[0] ?? null;
  },

  /* ===== Outputs ===== */
  async listOutputs(runId: string) {
    return db.select().from(workflowOutputs).where(eq(workflowOutputs.runId, runId)).orderBy(asc(workflowOutputs.createdAt));
  },

  async createOutput(runId: string, output: Partial<typeof workflowOutputs.$inferInsert> & { outputType: string }) {
    const rows = await db.insert(workflowOutputs).values({ ...output, runId }).returning();
    return rows[0];
  },

  /* ===== Prompts（规格 §56，版本化管理） ===== */
  async listPromptTemplates() {
    return db.select().from(promptTemplates).orderBy(asc(promptTemplates.workflowType));
  },

  async getPromptTemplate(workflowType: string) {
    const rows = await db.select().from(promptTemplates).where(eq(promptTemplates.workflowType, workflowType)).limit(1);
    return rows[0] ?? null;
  },

  async createPromptTemplate(input: typeof promptTemplates.$inferInsert) {
    const rows = await db.insert(promptTemplates).values(input).returning();
    return rows[0];
  },

  async listPromptVersions(templateId: string) {
    return db.select().from(promptVersions).where(eq(promptVersions.promptTemplateId, templateId)).orderBy(desc(promptVersions.createdAt));
  },

  async createPromptVersion(templateId: string, version: string, content: string) {
    const rows = await db
      .insert(promptVersions)
      .values({ promptTemplateId: templateId, version, content, status: "draft" })
      .returning();
    return rows[0];
  },

  /* ===== AI Models / Usage（规格 §57/§58） ===== */
  async listAiModels() {
    return db.select().from(aiModels).orderBy(desc(aiModels.active), asc(aiModels.provider));
  },

  async createAiModel(input: typeof aiModels.$inferInsert) {
    const rows = await db.insert(aiModels).values(input).returning();
    return rows[0];
  },

  async listAiUsageLogs(limit = 200) {
    return db.select().from(aiUsageLogs).orderBy(desc(aiUsageLogs.createdAt)).limit(limit);
  },

  async logAiUsage(input: Partial<typeof aiUsageLogs.$inferInsert> & { workflowRunId?: string | null }) {
    const rows = await db.insert(aiUsageLogs).values(input as typeof aiUsageLogs.$inferInsert).returning();
    return rows[0];
  },
};
