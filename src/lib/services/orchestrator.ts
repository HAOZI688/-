import { auditRepository, githubRepository, orchestratorRepository, topicRepository, trendRepository, workflowRepository } from "@/lib/repositories";
import { topicScoreService, type TopicScoreInput } from "@/lib/services/topic-score";
import { topicPerformanceV2Service } from "@/lib/services/topic-performance-v2";
import type { WorkflowType } from "@/lib/workflows/engine";
import type { Topic } from "@/lib/db/schema";
import { startWorkflowRun } from "@/lib/workflows/engine";
import { db } from "@/lib/db";
import { contentAssets, knowledgeTopics } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { notificationService } from "@/lib/services/notification";

/**
 * Orchestrator Service（V2 P0）：
 * 扫描候选 → 评分（含 Topic Feedback）→ 路由 → 周计划落库（draft）
 * → 用户确认（Human Gate 1）→ 开始生产（DAG 第一层）
 * → 依赖推进（advanceDependencies，由 engine 在 run 完成时回调）。
 * 全部真实落库，不做内存态。
 */

export type OrchestratorWorkflowType = "ai_weekly" | "github_weekly" | "evergreen" | "wechat_deep_dive";

/** 默认产能配额（可在 generateWeeklyPlan 覆盖） */
export const DEFAULT_QUOTA: Record<OrchestratorWorkflowType, number> = {
  ai_weekly: 1,
  github_weekly: 1,
  evergreen: 1,
  wechat_deep_dive: 2,
};

export const WORKFLOW_TYPE_LABEL: Record<WorkflowType, string> = {
  orchestrator: "总编排",
  ai_weekly: "AI 周报",
  github_weekly: "GitHub 周榜",
  evergreen: "常青知识",
  wechat_deep_dive: "公众号深度专题",
};

/** 按 Topic 类型/标签路由到子工作流（与 V1 weekly-planning 同一启发式） */
export function pickWorkflowType(topic: {
  topicType: string;
  trendTags?: string[] | null;
}): OrchestratorWorkflowType {
  if (topic.topicType === "technical_project") return "github_weekly";
  if (topic.topicType === "knowledge" || topic.topicType === "evergreen") return "evergreen";
  if (topic.trendTags?.some((t) => /微信|公众号|深度/.test(t))) return "wechat_deep_dive";
  return "ai_weekly";
}

/** Topic Feedback：上一自然周 performanceScore 加成（±1 分，收敛在 0-10） */
export function applyTopicFeedback(baseScore: number, performanceScore: number | null): number {
  if (performanceScore == null) return baseScore;
  const boost = (performanceScore - 5) * 0.2; // 10 分 → +1，0 分 → -1
  return Math.max(0, Math.min(10, Math.round((baseScore + boost) * 10) / 10));
}

/** 由 weekPrefix（2026W37）推出上一自然周（2026W36） */
export function previousWeekOf(weekPrefix: string): string {
  const m = /^(\d{4})W(\d{2})$/.exec(weekPrefix);
  if (!m) return weekPrefix;
  const year = Number(m[1]);
  let week = Number(m[2]) - 1;
  if (week < 1) return `${year - 1}W53`; // 跨年简化（边界周由 Scheduler 校准）
  return `${year}W${String(week).padStart(2, "0")}`;
}

export interface PlanItemInput {
  topicId: string;
  workflowType: OrchestratorWorkflowType;
  priority: string;
  topicScore: string;
  /* V3：解释性评分明细（规格 V3 §24） */
  contentRole?: string | null;
  baseScore?: string | null;
  trendAdjustment?: string | null;
  performanceAdjustment?: string | null;
  conversionAdjustment?: string | null;
  knowledgeGapAdjustment?: string | null;
  finalScore?: string | null;
  reasonCodes?: string[] | null;
}

const clampScore = (v: number) => Math.max(0, Math.min(10, Math.round(v * 10) / 10));

/** V3：由信号推断 Content Role（cognition 默认，转换高分 → conversion，低转化高流量 → traffic） */
function pickContentRole(conversionPotential: number, trafficPotential: number, conversionScore: number | null, trafficScore: number | null): string {
  const conv = conversionScore ?? conversionPotential;
  const traf = trafficScore ?? trafficPotential;
  if (conv >= 7) return "conversion";
  if (conv <= 3 && traf >= 7) return "traffic";
  if (traf >= 7) return "cognition";
  return "scenario";
}

/** V3：优先级由最终分驱动（>=8.5 P0 / >=7 P1 / 其余 P2） */
function priorityFromScore(finalScore: number, basePriority: string): string {
  if (finalScore >= 8.5) return "P0";
  if (finalScore >= 7) return "P1";
  if (finalScore >= 5.5) return "P2";
  return basePriority === "P0" || basePriority === "P1" ? "P2" : basePriority;
}

export const orchestratorService = {
  /**
   * 生成周计划（V3 升级）：扫描候选（ready_for_production + P0/P1 + GitHub selected + 趋势建议）
   * → 五维基础分 + Trend 加成 + 历史表现反馈 + 转化调整 + 知识缺口调整 → final_score + reason_codes
   * → 路由 + 配额 → 落 weekly_plans / weekly_plan_items（pending，等用户确认）。
   * 每个 Topic 的评分明细全部落库（V3 §24，不允许只存一个最终数字）。
   */
  async generateWeeklyPlan(weekPrefix: string, quota?: Partial<Record<OrchestratorWorkflowType, number>>) {
    const existing = await orchestratorRepository.getPlan(weekPrefix);
    if (existing) throw new Error(`本周计划已存在（${weekPrefix}，状态 ${existing.status}），先确认或取消`);

    const q = { ...DEFAULT_QUOTA, ...(quota ?? {}) };
    const used: Record<OrchestratorWorkflowType, number> = { ai_weekly: 0, github_weekly: 0, evergreen: 0, wechat_deep_dive: 0 };

    // 1) 候选池：可生产 Topic（含高优 draft）+ GitHub 最新快照 selected 项 + 趋势建议 Topic
    const [readyTopics, githubSnap] = await Promise.all([
      topicRepository.listByStatus("ready_for_production"),
      githubRepositoryLatestSelected(),
    ]);
    const candidates = [
      ...readyTopics,
      ...(githubSnap.items ?? []).map((i) => i.topic).filter((t): t is NonNullable<typeof t> => !!t),
    ];
    const seen = new Set<string>();
    const pool = candidates.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));

    // 2) 信号预加载（避免 N+1）：历史表现 / 趋势关联 / 内容与知识覆盖
    const prevWeek = previousWeekOf(weekPrefix);
    const [performances, trendRows, assetsRows, knowledgeRows] = await Promise.all([
      topicPerformanceV2Service.listAll(prevWeek),
      trendRepository.listTrends({ limit: 100 }),
      pool.length ? db.select().from(contentAssets).where(inArray(contentAssets.topicId, pool.map((t) => t.id))) : Promise.resolve([]),
      pool.length ? db.select().from(knowledgeTopics).where(inArray(knowledgeTopics.topicId, pool.map((t) => t.id))) : Promise.resolve([]),
    ]);
    const perfByTopic = new Map(performances.map((p) => [p.topicId, p]));
    const trendLinks = await Promise.all(pool.map((t) => trendRepository.listTrendIdsByTopic(t.id)));
    const trendByTopic = new Map<string, string[]>();
    pool.forEach((t, i) => trendByTopic.set(t.id, trendLinks[i]));
    const trendScoreById = new Map<string, number>();
    for (const tr of trendRows) trendScoreById.set(tr.id, Number(tr.currentScore ?? 0));
    const assetByTopic = new Map<string, number>();
    for (const a of assetsRows) assetByTopic.set(a.topicId, (assetByTopic.get(a.topicId) ?? 0) + 1);
    const knowledgeByTopic = new Set(knowledgeRows.map((k) => k.topicId));

    const scored: PlanItemInput[] = [];
    const scanNotes: Record<string, unknown>[] = [];
    for (const topic of pool) {
      const input: TopicScoreInput = {
        b2bRelevance: topic.b2bRelevance ?? 5,
        trafficPotential: topic.trafficPotential ?? 5,
        conversionPotential: topic.conversionPotential ?? 5,
        timeliness: topic.timeliness ?? 5,
        contentValue: topic.contentValue ?? 5,
      };
      const scoredResult = await topicScoreService.scoreTopic(topic.id, input, { source: "orchestrator" });
      const base = Number(scoredResult.topicScore);
      const perf = perfByTopic.get(topic.id);
      const perfScore = perf ? Number(perf.performanceScore) : null;
      const convScore = perf ? Number(perf.conversionScore) : null;
      const trafScore = perf ? Number(perf.trafficScore) : null;

      // Trend 加成：关联趋势平均分（±1.5 收敛）
      const linkedTrends = (trendByTopic.get(topic.id) ?? []).map((id) => trendScoreById.get(id) ?? 0);
      const trendScore = linkedTrends.length ? linkedTrends.reduce((a, b) => a + b, 0) / linkedTrends.length : 0;
      const trendAdjustment = linkedTrends.length ? Math.round((trendScore - 5) * 0.3 * 10) / 10 : 0;

      // 历史表现加成（Topic Feedback，±1）
      const performanceAdjustment = perfScore == null ? 0 : Math.round((perfScore - 5) * 0.2 * 10) / 10;

      // 转化调整（±0.75）
      const conversionAdjustment = convScore == null ? 0 : Math.round((convScore - 5) * 0.15 * 10) / 10;

      // 知识缺口调整：无内容资产 + 无知识条目 → +0.5
      const hasAsset = (assetByTopic.get(topic.id) ?? 0) > 0;
      const hasKnowledge = knowledgeByTopic.has(topic.id);
      const knowledgeGapAdjustment = !hasAsset && !hasKnowledge ? 0.5 : 0;

      const finalScore = clampScore(base + trendAdjustment + performanceAdjustment + conversionAdjustment + knowledgeGapAdjustment);

      // reason_codes（每个 code 可解释）
      const reasonCodes: string[] = [];
      if (trendScore >= 7) reasonCodes.push("RISING_TREND");
      if (perfScore != null && perfScore >= 7) reasonCodes.push("HIGH_PERFORMANCE");
      if (convScore != null && convScore >= 7) reasonCodes.push("HIGH_CONVERSION");
      if (trafScore != null && convScore != null && trafScore >= 7 && convScore < 4) reasonCodes.push("HIGH_TRAFFIC_LOW_CONVERSION");
      if (!hasAsset && !hasKnowledge) reasonCodes.push("KNOWLEDGE_GAP");
      if (perfScore != null && perfScore < 3) reasonCodes.push("LOW_PERFORMANCE");
      if (reasonCodes.length === 0) reasonCodes.push("STABLE");

      const wf = pickWorkflowType(topic);
      const contentRole = pickContentRole(topic.conversionPotential ?? 5, topic.trafficPotential ?? 5, convScore, trafScore);
      const priority = priorityFromScore(finalScore, scoredResult.priority);
      scanNotes.push({
        topicId: topic.id,
        title: topic.title.slice(0, 40),
        base,
        trend: trendScore ? Math.round(trendScore * 10) / 10 : null,
        perf: perfScore,
        conv: convScore,
        knowledgeGap: knowledgeGapAdjustment,
        final: finalScore,
        route: wf,
        role: contentRole,
        reasonCodes,
      });
      scored.push({
        topicId: topic.id,
        workflowType: wf,
        priority,
        topicScore: String(finalScore),
        contentRole,
        baseScore: String(base),
        trendAdjustment: String(trendAdjustment),
        performanceAdjustment: String(performanceAdjustment),
        conversionAdjustment: String(conversionAdjustment),
        knowledgeGapAdjustment: String(knowledgeGapAdjustment),
        finalScore: String(finalScore),
        reasonCodes,
      });
    }

    // 3) 按分排序 + 配额截断
    scored.sort((a, b) => Number(b.finalScore ?? b.topicScore) - Number(a.finalScore ?? a.topicScore));
    const items: PlanItemInput[] = [];
    for (const s of scored) {
      if (used[s.workflowType] >= q[s.workflowType]) continue;
      used[s.workflowType] += 1;
      items.push(s);
    }

    // 4) 落库
    const plan = await orchestratorRepository.createPlan({
      weekPrefix,
      status: "draft",
      quota: q,
      scanSummary: {
        candidates: pool.length,
        scored: scanNotes,
        prevWeek,
        feedbackApplied: performances.length,
        trendLinked: [...trendByTopic.values()].filter((v) => v.length).length,
      },
    });
    const planItems = await orchestratorRepository.createPlanItems(
      items.map((it, i) => ({
        planId: plan.id,
        topicId: it.topicId,
        workflowType: it.workflowType,
        priority: it.priority,
        topicScore: it.topicScore,
        contentRole: it.contentRole as never,
        baseScore: it.baseScore ?? undefined,
        trendAdjustment: it.trendAdjustment ?? undefined,
        performanceAdjustment: it.performanceAdjustment ?? undefined,
        conversionAdjustment: it.conversionAdjustment ?? undefined,
        knowledgeGapAdjustment: it.knowledgeGapAdjustment ?? undefined,
        finalScore: it.finalScore ?? undefined,
        reasonCodes: it.reasonCodes ?? undefined,
        status: "pending" as const,
        sortOrder: i,
      })),
    );

    await auditRepository.log({
      action: "system",
      entityType: "weekly_plan",
      entityId: plan.id,
      before: null,
      after: { weekPrefix, itemCount: items.length, used },
      notes: `Orchestrator 生成本周计划 ${weekPrefix}：${items.length} 项（${JSON.stringify(used)}）`,
      actor: "ai:orchestrator",
    });

    await notificationService.notify({
      type: "weekly_plan_ready",
      title: `本周内容计划已生成（${weekPrefix}）`,
      message: `${items.length} 个选题待确认：${items.map((i) => i.topicId).slice(0, 4).join("、")}${items.length > 4 ? "…" : ""}`,
      link: "/weekly-plan",
      entityType: "weekly_plans",
      entityId: plan.id,
      severity: "info",
    });

    return { plan, items: planItems };
  },

  /** Human Gate 1：用户确认选题 → 计划 confirmed，所有 pending 项 approved */
  async confirmPlan(planId: string) {
    const plan = await orchestratorRepository.getPlanById(planId);
    if (!plan) throw new Error("计划不存在");
    if (plan.status !== "draft") throw new Error(`计划状态为 ${plan.status}，只能确认 draft`);

    const items = await orchestratorRepository.getPlanItems(planId);
    const pending = items.filter((i) => i.status === "pending").map((i) => i.id);
    await orchestratorRepository.updatePlan(planId, { status: "confirmed", confirmedAt: new Date() });
    if (pending.length) await orchestratorRepository.updatePlanItems(pending, { status: "approved" });

    await auditRepository.log({
      action: "system",
      entityType: "weekly_plan",
      entityId: planId,
      before: { status: plan.status },
      after: { status: "confirmed" },
      notes: `Human Gate 确认选题（${pending.length} 项）`,
      actor: "user",
    });
    return orchestratorRepository.getPlanById(planId);
  },

  /** 拒绝单个选题 */
  async rejectPlanItem(itemId: string) {
    const item = await orchestratorRepository.getPlanItem(itemId);
    if (!item) throw new Error("计划项不存在");
    if (item.status !== "pending") throw new Error(`状态 ${item.status} 不可拒绝`);
    const updated = await orchestratorRepository.updatePlanItem(itemId, { status: "rejected" });
    await auditRepository.log({
      action: "system",
      entityType: "weekly_plan_item",
      entityId: itemId,
      before: { status: item.status },
      after: { status: "rejected" },
      notes: `用户拒绝选题 ${item.topicId}`,
      actor: "user",
    });
    return updated;
  },

  /**
   * 开始生产（Human Gate 1 通过后）：plan → production，
   * 启动 DAG 根节点（无上游依赖的工作流类型）的 run；下游由 advanceDependencies 触发。
   */
  async startProduction(planId: string) {
    const plan = await orchestratorRepository.getPlanById(planId);
    if (!plan) throw new Error("计划不存在");
    if (plan.status !== "confirmed") throw new Error(`计划状态为 ${plan.status}，需先确认`);

    const items = await orchestratorRepository.getPlanItems(planId);
    const deps = await orchestratorRepository.listDependencies();
    const childTypes = new Set(deps.map((d) => d.childWorkflowType as string));
    const roots = items.filter((i) => !childTypes.has(i.workflowType as string) && i.status === "approved");

    await orchestratorRepository.updatePlan(planId, { status: "production" });
    await auditRepository.log({
      action: "system",
      entityType: "weekly_plan",
      entityId: planId,
      before: { status: "confirmed" },
      after: { status: "production", roots: roots.map((r) => r.workflowType) },
      notes: `开始生产：DAG 根节点 ${roots.length} 项（${roots.map((r) => r.workflowType).join(", ")}）`,
      actor: "user",
    });

    const started = [];
    for (const item of roots) {
      started.push(await this.startItemRun(item.id));
    }
    return { plan: await orchestratorRepository.getPlanById(planId), started };
  },

  /** 启动单个计划项的 run（写 workflow_runs + workflow_inputs + 标记 running） */
  async startItemRun(itemId: string) {
    const item = await orchestratorRepository.getPlanItem(itemId);
    if (!item) throw new Error("计划项不存在");
    const plan = await orchestratorRepository.getPlanById(item.planId);
    if (!plan) throw new Error("所属计划不存在");
    const topic = await topicRepository.getById(item.topicId);
    if (!topic) throw new Error("Topic 不存在");

    const batchId = `${plan.weekPrefix}-${String(item.workflowType).toUpperCase()}`;
    const run = await startWorkflowRun({
      workflowType: item.workflowType as WorkflowType,
      topicId: topic.id,
      batchId,
      inputPayload: {
        planId: plan.id,
        weekPrefix: plan.weekPrefix,
        topicId: topic.id,
        topicTitle: topic.title,
        topicScore: item.topicScore,
      },
    });
    await orchestratorRepository.updatePlanItem(itemId, { status: "running", runId: run.id });
    return { item: await orchestratorRepository.getPlanItem(itemId), run };
  },

  /**
   * 依赖推进（engine 在 run 完成/失败后回调）：
   * 标记该项完成 → 对每个下游类型检查「同计划下所有上游已完成」→ 满足则启动。
   * 全部结束 → 计划 completed。
   */
  async advanceDependencies(runId: string) {
    const items = await orchestratorRepository.getItemsByRunId(runId);
    if (!items.length) return null;
    const item = items[0];
    const plan = await orchestratorRepository.getPlanById(item.planId);
    if (!plan) return null;

    const run = await workflowRepository.getRun(runId);
    const finalStatus = run?.status === "completed" ? "completed" : "failed";
    await orchestratorRepository.updatePlanItem(item.id, { status: finalStatus });

    // 下游推进
    const children = await orchestratorRepository.getChildren(item.workflowType as string);
    for (const dep of children) {
      const childType = dep.childWorkflowType as OrchestratorWorkflowType;
      const allParents = await orchestratorRepository.getParents(childType);
      const parentStatuses = await Promise.all(
        allParents.map(async (p) => {
          const parentItems = await orchestratorRepository.getItemsByWorkflowType(plan.id, p.parentWorkflowType as string);
          const finished = parentItems.filter((i) => i.status === "completed" || i.status === "failed" || i.status === "skipped");
          return finished.length >= parentItems.length;
        }),
      );
      if (parentStatuses.every(Boolean)) {
        const childItems = await orchestratorRepository.getItemsByWorkflowType(plan.id, childType);
        for (const ci of childItems.filter((i) => i.status === "approved" || i.status === "pending")) {
          await this.startItemRun(ci.id);
        }
      }
    }

    // 计划完成检查（V3：paused 为终态）
    const all = await orchestratorRepository.getPlanItems(plan.id);
    if (all.length && all.every((i) => i.status === "completed" || i.status === "failed" || i.status === "skipped" || i.status === "rejected" || i.status === "paused")) {
      await orchestratorRepository.updatePlan(plan.id, { status: "completed", completedAt: new Date() });
    }
    return { plan, item };
  },
};

/** GitHub 最新快照的 selected 项 → 按仓库名匹配 Topic（Orchestrator 扫描输入之一） */
async function githubRepositoryLatestSelected() {
  const snapshots = await githubRepository.listSnapshots();
  if (!snapshots.length) return { items: [] };
  const latest = snapshots[0];
  const items = await githubRepository.getItems(latest.id);
  const selected = items.filter((i) => i.selected);
  if (!selected.length) return { items: [] };

  const allTopics = await topicRepository.list();
  const matched: { topic: Topic | null }[] = [];
  for (const item of selected) {
    const repo = (item.repository ?? "").toLowerCase();
    const topic = allTopics.find(
      (t) => t.title.toLowerCase().includes(repo) || (t.trendTags ?? []).some((tag) => repo.includes(tag.toLowerCase())),
    );
    matched.push({ topic: topic ?? null });
  }
  return { items: matched };
}
