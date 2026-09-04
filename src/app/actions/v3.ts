"use server";

import { revalidatePath } from "next/cache";
import { orchestratorService } from "@/lib/services/orchestrator";
import { trendRadarService } from "@/lib/services/trend-radar";
import { trendScoringService } from "@/lib/services/trend-scoring";
import { attributionService } from "@/lib/services/attribution";
import { accountGrowthBaselineService } from "@/lib/services/account-growth-baseline";
import { connectorSyncService } from "@/lib/services/connector-sync";
import { readCsvFile } from "@/lib/connectors/csv";
import { notificationService } from "@/lib/services/notification";
import { topicPerformanceV2Service } from "@/lib/services/topic-performance-v2";
import {
  auditRepository,
  connectorRepository,
  orchestratorRepository,
  socialAccountRepository,
  topicRepository,
  trendRepository,
  workflowRepository,
} from "@/lib/repositories";

/**
 * V3 Server Actions（Weekly Plan V2 / Production / Trend Radar / Attribution /
 * Notifications / Connector File Import / Topic Performance V2）。
 * 契约：form action 返回 void（数据读库渲染，不依赖返回值）。
 */

/* ===== Weekly Plan V2（/weekly-plan） ===== */

/** 通过单个选题（pending → approved） */
export async function approvePlanItemAction(itemId: string) {
  const item = await orchestratorRepository.getPlanItem(itemId);
  if (!item) throw new Error("计划项不存在");
  if (item.status !== "pending") throw new Error(`状态 ${item.status} 不可通过`);
  await orchestratorRepository.updatePlanItem(itemId, { status: "approved" });
  await auditRepository.log({
    action: "system",
    entityType: "weekly_plan_item",
    entityId: itemId,
    before: { status: item.status },
    after: { status: "approved" },
    notes: `用户通过选题 ${item.topicId}`,
    actor: "user",
  });
  revalidatePath("/weekly-plan");
  revalidatePath("/dashboard");
}

/** 一键通过全部待确认项 */
export async function approveAllPlanItemsAction(planId: string) {
  const items = await orchestratorRepository.getPlanItems(planId);
  const pending = items.filter((i) => i.status === "pending").map((i) => i.id);
  if (pending.length) await orchestratorRepository.updatePlanItems(pending, { status: "approved" });
  await auditRepository.log({
    action: "system",
    entityType: "weekly_plan",
    entityId: planId,
    before: { pending: pending.length },
    after: { pending: 0 },
    notes: `一键通过 ${pending.length} 个选题`,
    actor: "user",
  });
  revalidatePath("/weekly-plan");
  revalidatePath("/dashboard");
}

/** 暂停选题（approved/pending → paused） */
export async function pausePlanItemAction(itemId: string) {
  const item = await orchestratorRepository.getPlanItem(itemId);
  if (!item) throw new Error("计划项不存在");
  if (!["pending", "approved"].includes(item.status)) throw new Error(`状态 ${item.status} 不可暂停`);
  await orchestratorRepository.updatePlanItem(itemId, { status: "paused" });
  await auditRepository.log({
    action: "system",
    entityType: "weekly_plan_item",
    entityId: itemId,
    before: { status: item.status },
    after: { status: "paused" },
    notes: `用户暂停选题 ${item.topicId}`,
    actor: "user",
  });
  revalidatePath("/weekly-plan");
  revalidatePath("/dashboard");
}

/** 恢复暂停的选题（paused → approved） */
export async function resumePlanItemAction(itemId: string) {
  const item = await orchestratorRepository.getPlanItem(itemId);
  if (!item) throw new Error("计划项不存在");
  if (item.status !== "paused") throw new Error(`状态 ${item.status} 不可恢复`);
  await orchestratorRepository.updatePlanItem(itemId, { status: "approved" });
  await auditRepository.log({
    action: "system",
    entityType: "weekly_plan_item",
    entityId: itemId,
    before: { status: "paused" },
    after: { status: "approved" },
    notes: `用户恢复选题 ${item.topicId}`,
    actor: "user",
  });
  revalidatePath("/weekly-plan");
  revalidatePath("/dashboard");
}

/** 编辑选题（优先级 / 内容角色 / 路由） */
export async function editPlanItemAction(itemId: string, patch: { priority?: string; contentRole?: string; workflowType?: string }) {
  const item = await orchestratorRepository.getPlanItem(itemId);
  if (!item) throw new Error("计划项不存在");
  if (!["pending", "approved", "paused"].includes(item.status)) throw new Error(`状态 ${item.status} 不可编辑`);
  await orchestratorRepository.updatePlanItem(itemId, {
    ...(patch.priority ? { priority: patch.priority } : {}),
    ...(patch.contentRole ? { contentRole: patch.contentRole as never } : {}),
    ...(patch.workflowType ? { workflowType: patch.workflowType as never } : {}),
  });
  await auditRepository.log({
    action: "system",
    entityType: "weekly_plan_item",
    entityId: itemId,
    before: { status: item.status },
    after: patch,
    notes: `用户编辑选题 ${item.topicId}`,
    actor: "user",
  });
  revalidatePath("/weekly-plan");
  revalidatePath("/dashboard");
}

/** 编辑选题（表单版，docs §6.3 契约）：<form action={editPlanItemFormAction.bind(null, itemId)}> */
export async function editPlanItemFormAction(itemId: string, formData: FormData) {
  const patch: { priority?: string; contentRole?: string; workflowType?: string } = {};
  const priority = formData.get("priority");
  const contentRole = formData.get("contentRole");
  const workflowType = formData.get("workflowType");
  if (typeof priority === "string" && priority) patch.priority = priority;
  if (typeof contentRole === "string" && contentRole) patch.contentRole = contentRole;
  if (typeof workflowType === "string" && workflowType) patch.workflowType = workflowType;
  if (!Object.keys(patch).length) return;
  await editPlanItemAction(itemId, patch);
}

/* ===== Production（/production） ===== */

/** 重试失败的 run：V4 幂等重试——复用原 run（同 run_id/batchId，不重复创建 writeback 产物） */
export async function retryRunAction(runId: string) {
  const run = await workflowRepository.getRun(runId);
  if (!run) throw new Error("Run 不存在");
  const { retryWorkflowRun } = await import("@/lib/workflows/engine");
  await retryWorkflowRun(runId);
  // 关联的计划项保持原绑定（runId 不变），仅确保状态回 running
  const items = await orchestratorRepository.getItemsByRunId(runId);
  for (const it of items) {
    await orchestratorRepository.updatePlanItem(it.id, { status: "running", runId });
  }
  await auditRepository.log({
    action: "system",
    entityType: "workflow_runs",
    entityId: runId,
    before: { status: run.status, retryCount: run.retryCount },
    after: { status: "running", retryCount: run.retryCount + 1 },
    notes: `用户幂等重试 run ${runId.slice(0, 8)}（第 ${run.retryCount + 1} 次）`,
    actor: "user",
  });
  revalidatePath("/production");
  revalidatePath("/workflows/runs");
  revalidatePath("/dashboard");
}

/** 取消排队中的 run（queued/running → failed + 用户取消） */
export async function cancelQueuedRunAction(runId: string) {
  await workflowRepository.cancelQueuedRun(runId);
  const items = await orchestratorRepository.getItemsByRunId(runId);
  for (const it of items) {
    await orchestratorRepository.updatePlanItem(it.id, { status: "failed", runId: null });
  }
  revalidatePath("/production");
  revalidatePath("/workflows/runs");
}

/* ===== Trend Radar（/trend-radar） ===== */

/** 全量扫描：聚合来源 → 评分 → 落库 + 快照 */
export async function runTrendRadarAction() {
  const result = await trendRadarService.run(30);
  await auditRepository.log({
    action: "system",
    entityType: "trends",
    entityId: "radar",
    before: null,
    after: { created: result.created, updated: result.updated, total: result.trends.length },
    notes: `Trend Radar 扫描：${result.created} 新建 / ${result.updated} 更新`,
    actor: "ai:trend_radar",
  });
  revalidatePath("/trend-radar");
  revalidatePath("/dashboard");
}

/** 单趋势重算（Error Recovery：按已有来源重评分 + 落快照） */
export async function recalcTrendAction(trendId: string) {
  const { trend, scored } = await trendRadarService.recalcTrend(trendId);
  await auditRepository.log({
    action: "system",
    entityType: "trends",
    entityId: trendId,
    before: null,
    after: { score: scored.currentScore, status: scored.status, configVersion: scored.configVersion },
    notes: `重算趋势「${trend?.title?.slice(0, 40) ?? trendId}」`,
    actor: "user",
  });
  revalidatePath(`/trend-radar/${trendId}`);
  revalidatePath("/trend-radar");
}

/** 趋势 → Topic（进 Topic Approval Gate，不自动生产） */
export async function createTopicFromTrendAction(trendId: string) {
  const trend = await trendRepository.getTrend(trendId);
  if (!trend) throw new Error("趋势不存在");

  // 业务 ID：2026W{week}-{seq}（与 canonical route 一致，不用 UUID）
  const all = await topicRepository.list();
  const maxSeq = all.reduce((max, t) => {
    const m = /(\d+)$/.exec(t.topicId);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  const now = new Date();
  const weekPrefix = `${now.getFullYear()}W${String(Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 604800000)).padStart(2, "0")}`;

  const topic = await topicRepository.create({
    topicId: `${weekPrefix}-${String(maxSeq + 1).padStart(3, "0")}`,
    title: trend.title.slice(0, 300),
    description: trend.description ?? `由趋势雷达创建：${trend.title}`,
    topicType: "trend",
    trendTags: [trend.title.slice(0, 40)],
    b2bRelevance: trend.b2bRelevance ?? null,
    status: "draft",
    priority: "P3",
  });
  await trendRepository.addTopic(trendId, topic.id, "suggested");
  await auditRepository.log({
    action: "topic_create",
    entityType: "topic",
    entityId: topic.id,
    before: null,
    after: { topicId: topic.topicId, fromTrend: trend.title },
    notes: `趋势「${trend.title.slice(0, 40)}」→ Topic（待审批）`,
    actor: "user",
  });
  await notificationService.notify({
    type: "trend_p0_detected",
    title: `趋势转 Topic：${trend.title.slice(0, 30)}`,
    message: `新 Topic ${topic.topicId} 已进入审批队列（draft），审批通过后可生产。`,
    link: `/topics/${topic.topicId}`,
    entityType: "topics",
    entityId: topic.id,
    severity: "info",
  });
  revalidatePath("/trend-radar");
  revalidatePath("/trend-radar/" + trendId);
  revalidatePath("/topics");
}

/** 读取评分配置（页面展示可配置权重） */
export async function getTrendScoringConfigAction() {
  return trendScoringService.getConfigVersion();
}

/* ===== Attribution（/analytics/attribution） ===== */

/** 全部账号：先算 28 天基线，再对上一自然周（周一~周日）跑归因 run。form action 契约返回 void。 */
export async function runAttributionAction() {
  const accounts = await socialAccountRepository.list();
  for (const acc of accounts) {
    // 上一自然周（周一 00:00 ~ 周日 23:59:59）
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dow - 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday.getTime() + 7 * 86400000 - 1);
    try {
      await accountGrowthBaselineService.computeBaseline(acc.id);
      await attributionService.compute({ socialAccountId: acc.id, periodStart: monday, periodEnd: sunday });
    } catch {
      // 单账号失败不阻断整体（页面读库渲染，异常账号保持原状）
    }
  }
  revalidatePath("/analytics/attribution");
  revalidatePath("/analytics");
  revalidatePath("/dashboard");
}

/* ===== Notifications（/notifications） ===== */

export async function markNotificationReadAction(id: string) {
  await notificationService.markRead(id);
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  await notificationService.markAllRead();
  revalidatePath("/notifications");
}

/** 周期扫掠（publication 待确认 / metrics stale / P0 趋势） */
export async function sweepNotificationsAction() {
  await notificationService.sweep();
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

/* ===== Connector File Import（/connectors/xiaodouya） ===== */

/** 账号 CSV 导入（幂等 upsert + 快照 + 失败通知；V4：编码检测 + 重复文件检测 + 历史导入） */
export async function importAccountsCsvAction(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "未选择文件" };
  const { text, encoding, hash } = await readCsvFile(file);
  const historicalImport = formData.get("historicalImport") === "on";
  const result = await connectorSyncService.importAccountsCsv(text, file.name, { historicalImport, fileHash: hash, encoding });
  revalidatePath("/connectors/xiaodouya");
  revalidatePath("/analytics/attribution");
  return { ok: true as const, result };
}

/** 作品 CSV 导入（复用 V1 全流程 + 幂等 + 未匹配通知；V4：编码检测 + 重复文件检测 + 历史导入） */
export async function importPostsCsvAction(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "未选择文件" };
  const { text, encoding, hash } = await readCsvFile(file);
  const historicalImport = formData.get("historicalImport") === "on";
  const result = await connectorSyncService.importPostsCsv(text, file.name, { historicalImport, fileHash: hash, encoding });
  revalidatePath("/connectors/xiaodouya");
  revalidatePath("/connectors/xiaodouya/mappings");
  return { ok: true as const, result };
}

/** V4：失败行重试（Retry Failed Rows）——按批次重跑失败行 */
export async function retryFailedRowsAction(batchId: string) {
  const result = await connectorSyncService.retryFailedRows(batchId);
  revalidatePath("/connectors/xiaodouya");
  return { ok: true as const, result };
}

/** 保存映射模板（复用导入格式） */
export async function saveMappingTemplateAction(input: { dataType: "account" | "post" | "account_metrics" | "post_metrics"; name: string; columnMapping: Record<string, string>; requiredColumns?: string[] }) {
  const template = await connectorSyncService.saveTemplate(input);
  revalidatePath("/connectors/xiaodouya/mappings");
  return { ok: true as const, templateId: template.id };
}

/** 手动匹配外部作品 ↔ Publication（Error Recovery；V4 记录 manual_confirmed_by / match_method） */
export async function manualMatchPostAction(postId: string, publicationId: string) {
  const post = await connectorRepository.getExternalPost(postId);
  if (!post) throw new Error("外部作品不存在");
  await connectorRepository.updateExternalPostMatch(postId, { publicationId, matchStatus: "confirmed", matchConfidence: "high" });
  await connectorRepository.setExternalPostMatchMeta(postId, { matchMethod: "manual", matchedAt: new Date(), manualConfirmedBy: "user" });
  await auditRepository.log({
    action: "external_post_match",
    entityType: "external_posts",
    entityId: postId,
    before: { matchStatus: post.matchStatus, publicationId: post.publicationId },
    after: { publicationId, matchStatus: "confirmed" },
    notes: "手动匹配外部作品 → Publication",
    actor: "user",
  });
  revalidatePath("/connectors/xiaodouya");
}

/* ===== Topic Performance V2（/analytics/topics） ===== */

/** 计算单个 Topic 全维度表现（V2 表 + V1 兼容回写） */
export async function computeTopicPerformanceAction(topicId: string, period?: string) {
  const result = await topicPerformanceV2Service.computeForTopic(topicId, period);
  revalidatePath("/analytics/topics");
  revalidatePath("/dashboard");
  return result;
}

/** 全部 Topic 补算（上一自然周） */
export async function computeAllTopicPerformanceAction(period?: string) {
  const topics = await topicRepository.list();
  const results: { topicId: string; ok: boolean; score: number | null }[] = [];
  for (const t of topics) {
    try {
      const r = await topicPerformanceV2Service.computeForTopic(t.id, period);
      results.push({ topicId: t.topicId, ok: true, score: r.performanceScore });
    } catch {
      results.push({ topicId: t.topicId, ok: false, score: null });
    }
  }
  revalidatePath("/analytics/topics");
  revalidatePath("/dashboard");
  return results;
}
