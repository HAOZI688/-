/**
 * Workflow Engine：一次 run 的执行器。
 * - 每个 workflowType 有固定任务链（与 ai-prompts/<type>/main.md 的步骤一一对应）
 * - 每个任务写入 workflow_tasks，全程持久化，失败可追溯
 * - 未配置 API Key 时走演示模式：任务依次标记 running→completed（不调模型），产出占位输出
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflowRuns, workflowTasks } from "@/lib/db/schema";
import { AI_PROMPTS_DIR } from "@/lib/ai/prompt-registry";
import { chat, isAiConfigured } from "@/lib/ai/providers";
import { workflowRepository, orchestratorRepository } from "@/lib/repositories";
import { writeBackRunOutputs } from "@/lib/workflows/writeback";
import type { WorkflowRun } from "@/lib/db/schema";

export type WorkflowType = "orchestrator" | "ai_weekly" | "github_weekly" | "evergreen" | "wechat_deep_dive";

/** 各工作流的任务链：key 与 prompt 文件中的步骤名一致 */
export const WORKFLOW_STEPS: Record<WorkflowType, { key: string; label: string }[]> = {
  orchestrator: [
    { key: "dedupe", label: "查重" },
    { key: "cluster", label: "聚类" },
    { key: "route", label: "评分与路由" },
  ],
  ai_weekly: [
    { key: "fetch", label: "抓取候选事件池" },
    { key: "verify", label: "数字核验" },
    { key: "score", label: "评分筛选" },
    { key: "produce", label: "生成口播与提纲" },
  ],
  github_weekly: [
    { key: "snapshot", label: "抓取快照" },
    { key: "value_filter", label: "价值过滤" },
    { key: "promote", label: "提升为 Topic" },
  ],
  evergreen: [
    { key: "research", label: "概念拆解" },
    { key: "produce", label: "内容生产" },
    { key: "bank", label: "知识库沉淀" },
  ],
  wechat_deep_dive: [
    { key: "define_role", label: "确定内容角色" },
    { key: "outline", label: "12 段提纲" },
    { key: "draft", label: "成稿" },
  ],
};

async function loadPrompt(workflowType: string): Promise<string> {
  const file = path.join(process.cwd(), AI_PROMPTS_DIR, workflowType, "main.md");
  try {
    return await readFile(file, "utf-8");
  } catch {
    return ""; // prompt 缺失不阻断流程（演示模式可用）
  }
}

export interface RunWorkflowOptions {
  workflowType: WorkflowType;
  templateId?: string;
  topicId?: string;
  batchId?: string;
  sourcePacketId?: string;
  inputPayload?: Record<string, unknown>;
  /** 演示模式强制开启：即使配了 key 也不调模型（用于 UI 演示） */
  forceDemo?: boolean;
}

/** 创建并执行一次 workflow run（同步返回创建后的 run，执行在后台进行） */
export async function startWorkflowRun(opts: RunWorkflowOptions): Promise<WorkflowRun> {
  const [run] = await db
    .insert(workflowRuns)
    .values({
      workflowType: opts.workflowType,
      templateId: opts.templateId,
      topicId: opts.topicId,
      batchId: opts.batchId,
      sourcePacketId: opts.sourcePacketId,
      inputPayload: (opts.inputPayload ?? {}) as Record<string, never>,
      status: "queued",
      startedAt: new Date(),
    })
    .returning();

  // 后台执行（不 await，前端立即返回）
  void executeRun(run.id, opts);
  return run;
}

async function executeRun(runId: string, opts: RunWorkflowOptions) {
  const steps = WORKFLOW_STEPS[opts.workflowType];
  const demo = opts.forceDemo || !isAiConfigured();

  await db.update(workflowRuns).set({ status: "running", startedAt: new Date() }).where(eq(workflowRuns.id, runId));

  // V2：输入快照落库（WorkflowInput 表）
  await orchestratorRepository.createWorkflowInput(runId, opts.workflowType, "main", {
    topicId: opts.topicId ?? null,
    batchId: opts.batchId ?? null,
    sourcePacketId: opts.sourcePacketId ?? null,
    payload: opts.inputPayload ?? {},
    promptFile: `ai-prompts/${opts.workflowType}/main.md`,
  });

  try {
    const prompt = await loadPrompt(opts.workflowType);
    const results: Record<string, unknown> = {};

    for (const step of steps) {
      const [task] = await db
        .insert(workflowTasks)
        .values({
          runId,
          taskKey: step.key,
          label: step.label,
          status: "running",
          input: { demo, promptChars: prompt.length },
          startedAt: new Date(),
        })
        .returning();

      const stepStart = Date.now();
      try {
        let output: Record<string, unknown>;
        if (demo) {
          output = {
            demo: true,
            note: `演示模式：${step.label}（未配置 API Key，跳过模型调用）`,
            payload: opts.inputPayload ?? {},
          };
        } else {
          const res = await chat(
            [
              { role: "system", content: `你是内容运营平台的工作流执行器。请严格遵循以下工作流提示词执行步骤「${step.label}」，并输出 JSON。\n\n${prompt}` },
              { role: "user", content: `步骤：${step.key}\n输入：${JSON.stringify(opts.inputPayload ?? {})}` },
            ],
            { maxTokens: 4000 },
          );
          output = { provider: res.provider, model: res.model, text: res.text.slice(0, 8000) };
          // V2：AI 用量留痕（规格 §58）
          if (res.usage) {
            await workflowRepository.logAiUsage({
              workflowRunId: runId,
              inputTokens: res.usage.inputTokens,
              outputTokens: res.usage.outputTokens,
              latency: Date.now() - stepStart,
            });
          }
        }
        results[step.key] = output;
        await db.update(workflowTasks).set({ status: "completed", output, completedAt: new Date() }).where(eq(workflowTasks.id, task.id));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await db.update(workflowTasks).set({ status: "failed", error: msg, completedAt: new Date() }).where(eq(workflowTasks.id, task.id));
        throw e;
      }
    }

    await db
      .update(workflowRuns)
      .set({ status: "completed", output: { steps: results, demo }, completedAt: new Date() })
      .where(eq(workflowRuns.id, runId));

    // V2：输出写回（Derived Topic / Content Asset）+ 依赖 DAG 推进
    const completedRun = await workflowRepository.getRun(runId);
    if (completedRun) {
      const writeback = await writeBackRunOutputs(runId, {
        workflowType: opts.workflowType,
        topicId: completedRun.topicId,
        demo: Boolean(completedRun.output && typeof completedRun.output === "object" && (completedRun.output as { demo?: boolean }).demo),
      });
      // V3：产出内容资产 → 通知进入审核队列（content_needs_review）
      if (writeback.contentAssets > 0) {
        const { notificationService } = await import("@/lib/services/notification");
        await notificationService.notify({
          type: "content_needs_review",
          title: `${writeback.contentAssets} 条内容待审核`,
          message: `${opts.workflowType} 工作流产出了新内容资产，进入 Review Workbench 审核。`,
          link: "/review",
          entityType: "workflow_runs",
          entityId: runId,
          severity: "info",
        });
      }
      await advanceDependenciesOf(runId);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db
      .update(workflowRuns)
      .set({ status: "failed", error: msg, completedAt: new Date() })
      .where(eq(workflowRuns.id, runId));
    // V3：失败通知（workflow_failed）+ 依赖 DAG 推进
    try {
      const { notificationService } = await import("@/lib/services/notification");
      await notificationService.notify({
        type: "workflow_failed",
        title: `工作流运行失败（${opts.workflowType}）`,
        message: msg.slice(0, 200),
        link: "/production",
        entityType: "workflow_runs",
        entityId: runId,
        severity: "error",
      });
    } catch {
      /* 通知失败不阻断推进 */
    }
    await advanceDependenciesOf(runId);
  }
}

/** V2：run 结束后通知 Orchestrator 推进依赖（动态 import 避免循环依赖） */
async function advanceDependenciesOf(runId: string) {
  try {
    const { orchestratorService } = await import("@/lib/services/orchestrator");
    await orchestratorService.advanceDependencies(runId);
  } catch (e) {
    console.error(`advanceDependencies(${runId}) failed:`, e instanceof Error ? e.message : e);
  }
}
