/**
 * Workflow Engine：一次 run 的执行器。
 * - 每个 workflowType 有固定任务链（与 ai-prompts/<type>/main.md 的步骤一一对应）
 * - 每个任务写入 workflow_tasks，全程持久化，失败可追溯
 * - 未配置 API Key 时走演示模式：任务依次标记 running→completed（不调模型），产出占位输出
 *
 * V4 生产化（规格 §9/§10/§12）：
 * - chatResilient：超时/重试/Provider Fallback，usage 留痕（provider/model/retry/cost）
 * - 全链失败 → run.status=failed + needsManual=true（人工介入，不是静默失败）
 * - 质量 Gate：produce 输出走 runQualityGate，不通过 → status=needs_review
 * - 幂等重试：retryWorkflowRun 复用原 run（batchId/模板不变），writeback 跳过已写回产物
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflowRuns, workflowTasks } from "@/lib/db/schema";
import { AI_PROMPTS_DIR } from "@/lib/ai/prompt-registry";
import { chatResilient, isAiConfigured, AiResilienceError, estimateCost } from "@/lib/ai/providers";
import { isLiveMode } from "@/lib/services/live-mode";
import { promptTemplates } from "@/lib/db/schema";
import { workflowRepository, orchestratorRepository, topicRepository, githubRepository } from "@/lib/repositories";
import { writeBackRunOutputs } from "@/lib/workflows/writeback";
import { runQualityGate } from "@/lib/workflows/quality-gate";
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

/** V4：幂等重试——复用原 run（batchId/模板不变），重新执行任务链。
 * 已成功写回产物的 run 重试时跳过 writeback，防止重复创建 Derived Topic / Content Asset。 */
export async function retryWorkflowRun(runId: string): Promise<WorkflowRun | null> {
  const run = await workflowRepository.getRun(runId);
  if (!run) return null;
  if (run.status === "running" || run.status === "queued") return run;
  if (run.status === "completed" && !run.needsManual) return run;

  const inputPayload = (run.inputPayload ?? {}) as Record<string, unknown>;
  const runOutput = (run.output ?? {}) as { writebackDone?: boolean };
  const alreadyWrittenBack = Boolean(runOutput.writebackDone);

  await workflowRepository.updateRun(runId, {
    status: "running",
    needsManual: false,
    retryCount: run.retryCount + 1,
    error: null,
    startedAt: new Date(),
    completedAt: null,
  });

  void executeRun(runId, {
    workflowType: run.workflowType,
    templateId: run.templateId ?? undefined,
    topicId: run.topicId ?? undefined,
    batchId: run.batchId ?? undefined,
    sourcePacketId: run.sourcePacketId ?? undefined,
    inputPayload,
    skipWriteback: alreadyWrittenBack,
  });
  return run;
}

/** B-3 §9：Prompt Version 从 prompt_templates 表读取（不绕开版本系统）；无记录回落 main */
async function resolvePromptVersion(workflowType: string): Promise<string> {
  try {
    const rows = await db.select({ v: promptTemplates.currentVersion }).from(promptTemplates).where(eq(promptTemplates.workflowType, workflowType)).orderBy(desc(promptTemplates.updatedAt)).limit(1);
    return rows[0]?.v ?? "main";
  } catch {
    return "main";
  }
}

/** B-3：把真实数据装配进 run 输入（模型不能无米下锅）。
 * - 有 topicId：注入 Topic 标题/描述/类型/来源
 * - github_weekly：注入本周 GitHub 快照 items（真实仓库数据）
 * - ai_weekly：注入 Trend Radar 顶部候选（真实趋势信号）
 * 禁止编造：只注入数据库里真实存在的数据。 */
async function buildRunInput(opts: RunWorkflowOptions): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = { ...(opts.inputPayload ?? {}) };
  try {
    if (opts.topicId) {
      const topic = await topicRepository.getById(opts.topicId);
      if (topic) {
        input.topic = { topicId: topic.topicId, title: topic.title, description: topic.description ?? "", type: topic.topicType, status: topic.status };
        // evergreen/wechat：明确要求产出完整内容（知识类内容允许领域知识，事实数字需谨慎——gate 会拦编造）
        if (opts.workflowType === "evergreen" || opts.workflowType === "wechat_deep_dive") {
          input.instruction = `围绕 Topic「${topic.title}」完成本步骤：${opts.workflowType === "evergreen" ? "概念拆解（定义/原理/误区/实战步骤）" : "深度成稿（正文完整可发布，全文只保留一个主要 CTA）"}。把成稿内容写入 contentAssets[0].content（完整正文，不是摘要），title 写入 contentAssets[0].title。知识解释可用你的领域知识；具体数字/日期不确定时用定性描述，禁止编造。`;
        }
      }
    }
    if (opts.workflowType === "github_weekly") {
      const snapshots = await githubRepository.listSnapshots();
      const latest = snapshots[0];
      if (latest) {
        const items = (await githubRepository.getItems(latest.id)).slice(0, 12);
        input.githubSnapshot = { snapshotId: latest.snapshotId, week: latest.week, basis: latest.selectionBasis, items: items.map((i) => ({ rank: i.rank, repository: i.repository, weeklyGrowth: i.weeklyGrowth, totalStars: i.totalStars, url: i.repoUrl, verified: i.verificationStatus, selected: i.selected })) };
      }
    }
    if (opts.workflowType === "ai_weekly") {
      const { trendRepository } = await import("@/lib/repositories");
      const trends = await trendRepository.listTrends({ limit: 5 });
      input.trendCandidates = trends.map((t: { trendKey: string; title: string; currentScore?: string | null; baseScore?: string | null; status?: string | null }) => ({ trendKey: t.trendKey, title: t.title, score: t.currentScore ?? t.baseScore, status: t.status }));
    }
  } catch (e) {
    console.error("buildRunInput failed:", e instanceof Error ? e.message : e);
  }
  return input;
}

async function executeRun(runId: string, opts: RunWorkflowOptions & { skipWriteback?: boolean }) {
  const steps = WORKFLOW_STEPS[opts.workflowType];
  const live = isLiveMode();
  const configured = isAiConfigured();
  // B-3 §5：Live Mode 下未配置 Provider → blocked（needs_manual），禁止产出演示假正文后 completed
  if (live && !configured && !opts.forceDemo) {
    const msg = "AI_PROVIDER_NOT_CONFIGURED（Live Mode）：未配置任何 AI Provider，禁止演示假产出。配置 API Key 后重试。";
    await db.update(workflowRuns).set({ status: "failed", needsManual: true, error: msg, completedAt: new Date() }).where(eq(workflowRuns.id, runId));
    try {
      const { notificationService } = await import("@/lib/services/notification");
      await notificationService.notify({
        type: "workflow_failed",
        title: `AI Provider 未配置，需要人工介入（${opts.workflowType}）`,
        message: msg,
        link: "/production",
        entityType: "workflow_runs",
        entityId: runId,
        severity: "error",
      });
    } catch { /* 通知失败不阻断 */ }
    await advanceDependenciesOf(runId);
    return;
  }
  const demo = opts.forceDemo || !configured;

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
    const promptVersion = await resolvePromptVersion(opts.workflowType);
    const results: Record<string, unknown> = {};
    let quality: { pass: boolean; reasons: string[] } | null = null;
    // B-3 §3：单 run 成本上限（AI_MAX_COST_PER_RUN，USD；估算值累计，超限中止转 needs_manual）
    const maxCostPerRun = Number(process.env.AI_MAX_COST_PER_RUN ?? 0); // 0 = 不限
    let runCost = 0;

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
          const res = await chatResilient(
            [
              { role: "system", content: `你是内容运营平台的工作流执行器。严格遵循以下工作流提示词执行步骤「${step.label}」。\n\n硬性输出契约：\n1. 最终输出必须是提示词「输出格式」中定义的 JSON，字段名严格为 derivedTopics / contentAssets / outputs（缺失的字段用空数组 []），不得发明其他字段结构。\n2. 禁止编造任何数据：planId/topicId/UUID/时间戳/星数/增长数等只能来自输入，没有就留空。\n3. 禁止输出示例值、占位文本或模拟执行说明。\n4. 只输出 JSON 本身（可包裹在 markdown 代码块中），不要附加解释。\n\n${prompt}` },
              { role: "user", content: `步骤：${step.key}\n真实输入数据（只允许使用以下数据，缺失就用空数组，禁止编造）：${JSON.stringify(await buildRunInput(opts))}` },
            ],
            { maxTokens: Number(process.env.AI_MAX_TOKENS ?? 8000) },
          );
          output = { provider: res.provider, model: res.model, providerStatus: res.providerStatus, retryCount: res.retryCount, text: res.text.slice(0, 8000) };
          const inputTokens = res.usage?.inputTokens ?? 0;
          const outputTokens = res.usage?.outputTokens ?? 0;
          // B-3 §8：usage 全字段留痕（total/fallback_used/estimated——无 usage 返回时标记 estimated，禁止伪造精确值）
          await workflowRepository.logAiUsage({
            workflowRunId: runId,
            provider: res.provider,
            model: res.model,
            retryCount: res.retryCount,
            promptVersion,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            fallbackUsed: res.providerStatus === "fallback_success",
            estimated: !res.usage,
            cost: String(res.costUsd),
            latency: Date.now() - stepStart,
          });
          runCost += res.costUsd || estimateCost(res.model, inputTokens, outputTokens);
          if (maxCostPerRun > 0 && runCost > maxCostPerRun) {
            throw new Error(`AI_COST_LIMIT_EXCEEDED：本次 run 成本 $${runCost.toFixed(4)} 超过 AI_MAX_COST_PER_RUN $${maxCostPerRun}，中止后续步骤。`);
          }
        }
        results[step.key] = output;
        await db.update(workflowTasks).set({ status: "completed", output, completedAt: new Date() }).where(eq(workflowTasks.id, task.id));

        // V4：质量 Gate——内容生产步骤（produce/draft）+ 每个工作流的最后一步（拦截编造结构）
        const isLastStep = step === steps[steps.length - 1];
        if (!demo && (step.key === "produce" || step.key === "draft" || isLastStep)) {
          quality = await runQualityGate({
            workflowType: opts.workflowType,
            text: output.text as string,
            sourcePacketId: opts.sourcePacketId ?? null,
            topicId: opts.topicId ?? null,
          });
          if (!quality.pass) {
            results.quality = quality;
            await db.update(workflowTasks).set({ output: { ...output, quality } }).where(eq(workflowTasks.id, task.id));
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await db.update(workflowTasks).set({ status: "failed", error: msg, completedAt: new Date() }).where(eq(workflowTasks.id, task.id));
        throw e;
      }
    }

    // 质量 Gate 不通过 → needs_review（内容仍保留，人工审核决定去留）
    const finalStatus = quality && !quality.pass ? "needs_review" : "completed";
    await db
      .update(workflowRuns)
      .set({ status: finalStatus, output: { steps: results, demo, writebackDone: true }, completedAt: new Date() })
      .where(eq(workflowRuns.id, runId));

    // V2：输出写回（Derived Topic / Content Asset）+ 依赖 DAG 推进
    if (!opts.skipWriteback) {
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
      }
    }
    await advanceDependenciesOf(runId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const needsManual = e instanceof AiResilienceError || /AI_PROVIDER_NOT_CONFIGURED|AI_COST_LIMIT_EXCEEDED|timeout|ETIMEDOUT|ECONNREFUSED/i.test(msg);
    await db
      .update(workflowRuns)
      .set({ status: "failed", needsManual, error: msg.slice(0, 500), completedAt: new Date() })
      .where(eq(workflowRuns.id, runId));
    // V3/V4：失败通知（workflow_failed，全模型失败标记需人工介入）+ 依赖 DAG 推进
    try {
      const { notificationService } = await import("@/lib/services/notification");
      await notificationService.notify({
        type: "workflow_failed",
        title: needsManual ? `AI 调用失败，需要人工介入（${opts.workflowType}）` : `工作流运行失败（${opts.workflowType}）`,
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
