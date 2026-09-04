import Link from "next/link";
import { getDashboardStats, listTopics } from "@/lib/repo";
import {
  orchestratorRepository,
  contentRepository,
  publicationRepository,
  topicRepository,
  workflowRepository,
} from "@/lib/repositories";
import { topicPerformanceV2Service } from "@/lib/services/topic-performance-v2";
import { notificationService } from "@/lib/services/notification";
import { actionItemsService } from "@/lib/services/action-items";
import { computeDataConfidence } from "@/lib/services/data-confidence";
import { appMode, isLiveMode, DATA_SOURCE_LABELS } from "@/lib/services/live-mode";
import { isAiConfigured } from "@/lib/ai/providers";
import { Card, CardContent } from "@/components/ui/card";
import { PriorityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ASSET_STATUS_LABELS,
  ASSET_STATUS_TONES,
  CONTENT_ROLE_LABELS,
  ITEM_STATUS_LABELS,
  ITEM_STATUS_TONES,
  PLATFORM_LABELS,
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_STATUS_TONES,
  REASON_CODE_LABELS,
  TOPIC_STATUS_LABELS,
  TOPIC_STATUS_TONES,
  WORKFLOW_TYPE_LABELS,
} from "@/lib/labels";
import { StatusBadge } from "@/components/shared/status-badge";
import { isoWeekKey, previousCompleteWeek } from "@/lib/utils";
import { format } from "date-fns";
import { generatePlanAction } from "@/app/actions/planning";
import { confirmPlanAction, startProductionAction } from "@/app/actions/review";
import { dismissActionItemAction } from "@/app/actions/action-items";

export const dynamic = "force-dynamic";

const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: "已生成 · 待确认",
  confirmed: "已确认 · 待生产",
  production: "生产中",
  completed: "已完成",
  cancelled: "已取消",
};

const PLAN_STATUS_TONES: Record<string, "orange" | "blue" | "green" | "default"> = {
  draft: "orange",
  confirmed: "blue",
  production: "blue",
  completed: "green",
  cancelled: "default",
};

/** Performance V2 recommendation → 中文（可解释动作，V3 §23） */
const RECOMMENDATION_LABELS: Record<string, string> = {
  Maintain: "维持",
  Pause: "暂停投入",
  Saturated: "内容饱和",
  "Traffic Only": "仅走流量",
  "Increase Investment": "加大投入",
  "Conversion Focus": "转化聚焦",
  Continue: "继续生产",
  Refresh: "刷新知识",
};

/**
 * Dashboard（V4 Live Workbench）：
 * 今天需要处理什么（Action Center，自动聚合 7 类来源）
 * → Current Cycle（本周周期状态）→ Weekly Action Center（动作按钮流）
 * → Workflow Status（DAG 类型 × 状态统计）→ Priority Topic Queue（带 Reason）
 * → Review Queue / Publish Queue → Performance Feedback（上一自然周）。
 * 全部真实落库，不 mock；Topic 链接用业务 ID（/topics/{topicId}）。
 * APP_MODE=live 时 Performance Feedback 排除 seed 数据（规格 §20）。
 */
export default async function DashboardPage() {
  const week = previousCompleteWeek();
  const thisWeek = isoWeekKey(new Date());
  // Action Center 同步（幂等 upsert + 自动 resolve），首屏「今天需要处理什么」
  await actionItemsService.syncActionItems();
  const [stats, topics, plans, assets, pubs, runs, perfRowsAll, unread, actions, confidence] = await Promise.all([
    getDashboardStats(),
    listTopics(),
    orchestratorRepository.listPlans(4),
    contentRepository.listAllAssets(200),
    publicationRepository.list(),
    workflowRepository.listRunsWithTopic(100),
    topicPerformanceV2Service.listAll(week.weekKey),
    notificationService.countUnread(),
    actionItemsService.listOpen(12),
    computeDataConfidence(),
  ]);
  const live = isLiveMode();
  // live 模式排除 seed 数据（规格 §20）
  const perfRows = live ? perfRowsAll.filter((r) => r.dataSource !== "seed") : perfRowsAll;
  const aiReady = isAiConfigured();

  const lastWeekPlan = plans.find((p) => p.weekPrefix === week.weekKey) ?? null;
  const thisWeekPlan = plans.find((p) => p.weekPrefix === thisWeek) ?? null;
  const thisItems = thisWeekPlan ? await orchestratorRepository.getPlanItems(thisWeekPlan.id) : [];
  const pendingItems = thisItems.filter((i) => i.status === "pending");

  // UUID → Topic 业务 ID / 标题（canonical route /topics/{topicId} 不用 UUID）
  const topicByUuid = new Map(topics.map((t) => [t.id, t]));
  const bizId = (uuid: string) => topicByUuid.get(uuid)?.topicId ?? uuid;

  // Workflow Status：按类型 × 状态统计（避免 N+1，一次 listRunsWithTopic 分组）
  const runStats: Record<string, Record<string, number>> = {};
  for (const { run } of runs) {
    runStats[run.workflowType] ??= { queued: 0, running: 0, completed: 0, failed: 0, needs_review: 0 };
    runStats[run.workflowType][run.status] = (runStats[run.workflowType][run.status] ?? 0) + 1;
  }
  const workflowTypes: (keyof typeof WORKFLOW_TYPE_LABELS)[] = ["ai_weekly", "github_weekly", "evergreen", "wechat_deep_dive"];

  const inReviewAssets = assets.filter((a) => a.asset.status === "in_review");
  const confirmPubs = pubs.filter((p) => p.pub.status === "planned" || p.pub.status === "ready");
  const readyPubs = pubs.filter((p) => p.pub.status === "ready");
  const totalReview = pendingItems.length + inReviewAssets.length + confirmPubs.length;

  const countBy = (arr: { status?: string; count: number }[], key: string) =>
    arr.find((r) => r.status === key)?.count ?? 0;
  const p0 = countBy(stats.topicsByPriority, "P0");
  const p1 = countBy(stats.topicsByPriority, "P1");
  const inReview = countBy(stats.topicsByStatus, "review") + countBy(stats.topicsByStatus, "needs_revision");
  const readyToPublish = countBy(stats.topicsByStatus, "ready_to_publish");

  // Priority Topic Queue：按 final_score 降序（V3 评分驱动优先级）
  const queue = [...thisItems].sort(
    (a, b) => Number(b.finalScore ?? b.topicScore) - Number(a.finalScore ?? a.topicScore),
  );

  return (
    <div className="space-y-4 p-4">
      {/* ===== 今天需要处理什么（V4 Action Center 首屏） ===== */}
      <Card className="border-orange-100 bg-orange-50/40">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100/60 px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              今天需要处理什么
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-normal text-orange-700">{actions.length} 项待办</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-normal text-zinc-500">
                {live ? "LIVE 模式（已排除演示数据）" : "开发模式（含演示数据）"}
              </span>
            </div>
            <span className="text-[10px] text-zinc-400">来源：周计划 / 工作流 / 审核 / 发布 / 连接器 / 数据质量（完成动作后自动消除）</span>
          </div>
          {actions.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-zinc-400">今天没有待处理项 —— 系统状态干净。</p>
          ) : (
            <ul className="divide-y divide-orange-100/50">
              {actions.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <PriorityBadge priority={a.priority as never} />
                    <div className="min-w-0">
                      <Link href={a.targetUrl ?? "#"} className="block truncate text-xs font-medium hover:text-blue-600">
                        {a.title}
                      </Link>
                      <div className="truncate text-[10px] text-zinc-400">{a.description}</div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link href={a.targetUrl ?? "#"} className="text-[11px] text-blue-600 hover:underline">去处理 →</Link>
                    <form action={dismissActionItemAction.bind(null, a.id)}>
                      <button type="submit" className="text-[10px] text-zinc-400 hover:text-zinc-600">忽略</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ===== 冷启动保护（数据置信度，规格 §25） ===== */}
      {(confidence.level === "insufficient" || confidence.level === "low") && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ {confidence.message}
          <span className="ml-2 text-[10px] text-amber-600">
            （真实快照 {confidence.realPostSnapshots} · 表现记录 {confidence.realTopicPerformances} · 发布 {confidence.realPublications}）
          </span>
        </div>
      )}
      {/* ===== Current Cycle + Weekly Action Center ===== */}
      <Card className="border-blue-100 bg-blue-50/40">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold">本周内容运营</h1>
              <p className="text-xs text-zinc-500">
                统计窗口：上一完整自然周 {format(week.start, "MM-dd")} ~ {format(week.end, "MM-dd")}（{week.weekKey}）
                <span className="ml-2">
                  {aiReady ? (
                    <span className="text-emerald-600">AI 已配置 · 真实调用</span>
                  ) : (
                    <span className="text-orange-600">演示模式（未配置 API Key）</span>
                  )}
                </span>
              </p>
            </div>
            {/* Weekly Action Center：状态驱动的动作流 */}
            <div className="flex flex-wrap items-center gap-2">
              {!thisWeekPlan && (
                <form action={generatePlanAction.bind(null, thisWeek)}>
                  <Button>生成本周内容计划</Button>
                </form>
              )}
              {thisWeekPlan && thisWeekPlan.status === "draft" && (
                <form action={confirmPlanAction.bind(null, thisWeekPlan.id)}>
                  <Button>确认本周选题</Button>
                </form>
              )}
              {thisWeekPlan && thisWeekPlan.status === "confirmed" && (
                <form action={startProductionAction.bind(null, thisWeekPlan.id)}>
                  <Button>确认并开始生产</Button>
                </form>
              )}
              {thisWeekPlan && thisWeekPlan.status === "production" && (
                <Link href="/production">
                  <Button>生产监控（进行中）</Button>
                </Link>
              )}
              <Link href="/weekly-plan">
                <Button variant="outline">周计划详情</Button>
              </Link>
              <Link href="/review">
                <Button variant="outline">待审核 {totalReview > 0 ? `(${totalReview})` : ""}</Button>
              </Link>
              <Link href="/notifications">
                <Button variant="ghost">通知{unread > 0 ? `(${unread})` : ""}</Button>
              </Link>
            </div>
          </div>

          {/* Current Cycle：四个周期状态卡 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniCard
              label="当前周期"
              value={thisWeekPlan ? PLAN_STATUS_LABELS[thisWeekPlan.status] ?? thisWeekPlan.status : "未生成"}
              sub={thisWeek}
            />
            <MiniCard
              label="上周扫描"
              value={lastWeekPlan ? `已完成 · ${lastWeekPlan.status}` : "未执行"}
              sub={lastWeekPlan ? lastWeekPlan.weekPrefix : week.weekKey}
            />
            <MiniCard
              label="本周计划"
              value={thisWeekPlan ? `${thisItems.length} 项选题` : "0 项"}
              sub={thisWeekPlan ? `待确认 ${pendingItems.length} · 生产 ${thisItems.filter((i) => i.status === "running").length}` : "点上方按钮生成"}
            />
            <MiniCard
              label="待人工处理"
              value={String(totalReview)}
              sub={`选题 ${pendingItems.length} · 内容 ${inReviewAssets.length} · 发布 ${confirmPubs.length}`}
            />
          </div>

          {/* Workflow Status：DAG 各类型运行统计 */}
          <div>
            <div className="mb-1.5 text-[11px] font-semibold text-zinc-600">工作流运行状态</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {workflowTypes.map((type) => {
                const s = runStats[type] ?? {};
                return (
                  <div key={type} className="flex items-center justify-between rounded-md border border-zinc-100 bg-white px-2.5 py-1.5">
                    <span className="text-xs font-medium">{WORKFLOW_TYPE_LABELS[type]}</span>
                    <span className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                      {s.queued ? <span className="rounded bg-zinc-100 px-1">{s.queued} 排队</span> : null}
                      {s.running ? <span className="rounded bg-blue-100 px-1 text-blue-700">{s.running} 运行</span> : null}
                      {s.completed ? <span className="rounded bg-emerald-100 px-1 text-emerald-700">{s.completed} 完成</span> : null}
                      {s.failed ? <span className="rounded bg-red-100 px-1 text-red-700">{s.failed} 失败</span> : null}
                      {!s.queued && !s.running && !s.completed && !s.failed ? <span className="text-zinc-400">无记录</span> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ===== Priority Topic Queue（带 Reason，V3 §24 解释性评分） ===== */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              优先级选题队列
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-normal text-zinc-500">按最终评分排序 · 含评分依据</span>
            </div>
            <Link href="/weekly-plan" className="text-[11px] text-blue-600 hover:underline">全部 →</Link>
          </div>
          {queue.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">
              本周还没有计划。点击上方「生成本周内容计划」开始。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead>内容角色</TableHead>
                  <TableHead>路由</TableHead>
                  <TableHead>最终评分</TableHead>
                  <TableHead>原因（Reason）</TableHead>
                  <TableHead>优先级</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.slice(0, 8).map((item) => {
                  const topic = topicByUuid.get(item.topicId);
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link href={`/topics/${bizId(item.topicId)}`} className="font-medium hover:text-blue-600">
                          {bizId(item.topicId)}
                        </Link>
                        <div className="max-w-48 truncate text-[10px] text-zinc-400">{topic?.title ?? "—"}</div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={CONTENT_ROLE_LABELS[item.contentRole ?? ""] ?? item.contentRole ?? "—"} tone="default" />
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">{WORKFLOW_TYPE_LABELS[item.workflowType]}</TableCell>
                      <TableCell>
                        <span className="text-[13px] font-semibold tabular">{item.finalScore ?? item.topicScore}</span>
                        <div className="text-[9px] text-zinc-400">
                          base {item.baseScore ?? "—"} {item.trendAdjustment != null && item.trendAdjustment !== "0" ? `· 趋势 ${item.trendAdjustment}` : ""}
                          {item.performanceAdjustment != null && item.performanceAdjustment !== "0" ? `· 表现 ${item.performanceAdjustment}` : ""}
                          {item.conversionAdjustment != null && item.conversionAdjustment !== "0" ? `· 转化 ${item.conversionAdjustment}` : ""}
                          {item.knowledgeGapAdjustment != null && item.knowledgeGapAdjustment !== "0" ? `· 缺口 ${item.knowledgeGapAdjustment}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-52 flex-wrap gap-1">
                          {(item.reasonCodes ?? []).slice(0, 3).map((code) => (
                            <span key={code} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                              {REASON_CODE_LABELS[code] ?? code}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell><PriorityBadge priority={item.priority as never} /></TableCell>
                      <TableCell>
                        <StatusBadge label={ITEM_STATUS_LABELS[item.status] ?? item.status} tone={ITEM_STATUS_TONES[item.status] as never} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ===== Review Queue / Publish Queue ===== */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Review Queue */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 text-xs font-semibold">
              Review Queue
              <Link href="/review" className="text-[11px] font-normal text-blue-600 hover:underline">全部待审核 →</Link>
            </div>
            <ul className="divide-y divide-zinc-100">
              {pendingItems.slice(0, 3).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <Link href={`/topics/${bizId(item.topicId)}`} className="min-w-0 truncate text-xs font-medium hover:text-blue-600">
                    选题确认 · {bizId(item.topicId)}
                  </Link>
                  <StatusBadge label={ITEM_STATUS_LABELS[item.status]} tone={ITEM_STATUS_TONES[item.status] as never} />
                </li>
              ))}
              {inReviewAssets.slice(0, 3).map(({ asset, topic }) => (
                <li key={asset.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <Link href={`/content/${topic.id}`} className="min-w-0 truncate text-xs font-medium hover:text-blue-600">
                    内容审核 · {asset.title}
                  </Link>
                  <StatusBadge label={ASSET_STATUS_LABELS[asset.status] ?? asset.status} tone={ASSET_STATUS_TONES[asset.status] ?? "default"} />
                </li>
              ))}
              {confirmPubs.slice(0, 3).map(({ pub, topic }) => (
                <li key={pub.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <Link href={`/topics/${topic.topicId}`} className="min-w-0 truncate text-xs font-medium hover:text-blue-600">
                    发布确认 · {topic.title}
                  </Link>
                  <StatusBadge label={PUBLICATION_STATUS_LABELS[pub.status] ?? pub.status} tone={PUBLICATION_STATUS_TONES[pub.status] ?? "default"} />
                </li>
              ))}
              {totalReview === 0 && <li className="px-3 py-4 text-center text-xs text-zinc-400">没有待处理项</li>}
            </ul>
          </CardContent>
        </Card>

        {/* Publish Queue */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 text-xs font-semibold">
              Publish Queue
              <Link href="/publications" className="text-[11px] font-normal text-blue-600 hover:underline">发布中心 →</Link>
            </div>
            <ul className="divide-y divide-zinc-100">
              {readyPubs.slice(0, 5).map(({ pub, topic }) => (
                <li key={pub.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <div className="min-w-0">
                    <Link href={`/topics/${topic.topicId}`} className="block truncate text-xs font-medium hover:text-blue-600">
                      {topic.title}
                    </Link>
                    <div className="text-[10px] text-zinc-400">
                      {PLATFORM_LABELS[pub.platform] ?? pub.platform} · {pub.scheduledDate ?? "未排期"}
                    </div>
                  </div>
                  <StatusBadge label={PUBLICATION_STATUS_LABELS[pub.status]} tone={PUBLICATION_STATUS_TONES[pub.status]} />
                </li>
              ))}
              {readyPubs.length === 0 && <li className="px-3 py-4 text-center text-xs text-zinc-400">没有待发布项</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ===== Performance Feedback（上一自然周，V3 §22-23） ===== */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold">
              Performance Feedback
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-normal text-zinc-500">{week.weekKey}</span>
            </div>
            <Link href="/analytics/topics" className="text-[11px] text-blue-600 hover:underline">Topic 分析 →</Link>
          </div>
          {perfRows.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">
              暂无上一自然周表现数据。可在「Topic 分析」触发全量计算。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead>综合分</TableHead>
                  <TableHead>流量</TableHead>
                  <TableHead>互动</TableHead>
                  <TableHead>涨粉</TableHead>
                  <TableHead>转化</TableHead>
                  <TableHead>趋势</TableHead>
                  <TableHead>建议</TableHead>
                  <TableHead>原因</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perfRows.slice(0, 6).map((r) => (
                  <TableRow key={r.topicId}>
                    <TableCell>
                      <Link href={`/topics/${r.topic?.topicId ?? r.topicId}`} className="font-medium hover:text-blue-600">
                        {r.topic?.topicId ?? r.topicId.slice(0, 8)}
                      </Link>
                      <div className="max-w-40 truncate text-[10px] text-zinc-400">{r.topic?.title ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-[13px] font-semibold tabular">{r.performanceScore}</TableCell>
                    <TableCell className="tabular text-xs">{r.trafficScore}</TableCell>
                    <TableCell className="tabular text-xs">{r.engagementScore}</TableCell>
                    <TableCell className="tabular text-xs">{r.followerScore}</TableCell>
                    <TableCell className="tabular text-xs">{r.conversionScore}</TableCell>
                    <TableCell className="tabular text-xs">{r.trendScore}</TableCell>
                    <TableCell>
                      <StatusBadge label={RECOMMENDATION_LABELS[r.recommendation ?? ""] ?? r.recommendation ?? "—"} tone={RECOMMENDATION_TONES[r.recommendation ?? ""] ?? "default"} />
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-48 flex-wrap gap-1">
                        {(r.reasonCodes ?? []).slice(0, 3).map((code) => (
                          <span key={code} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                            {REASON_CODE_LABELS[code] ?? code}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* V1 统计（精简保留） */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatCard label="P0 Topic" value={p0} tone="red" />
        <StatCard label="P1 Topic" value={p1} tone="orange" />
        <StatCard label="待审核内容" value={inReview} />
        <StatCard label="待发布内容" value={readyToPublish} />
        <StatCard label="趋势雷达候选" value={stats.radarCount} />
        <StatCard label="本周 Leads" value={stats.leadMetrics.salesLeads} />
      </div>
    </div>
  );
}

const RECOMMENDATION_TONES: Record<string, "default" | "blue" | "green" | "orange" | "red"> = {
  Pause: "red",
  Saturated: "default",
  "Traffic Only": "orange",
  "Increase Investment": "green",
  "Conversion Focus": "green",
  Continue: "green",
  Refresh: "orange",
  Maintain: "default",
};

function MiniCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-white px-3 py-2">
      <div className="text-[10px] text-zinc-400">{label}</div>
      <div className="text-[13px] font-semibold text-zinc-800">{value}</div>
      {sub && <div className="text-[10px] text-zinc-400">{sub}</div>}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "red" | "orange" | "green" }) {
  const toneClass = tone === "red" ? "text-red-600" : tone === "orange" ? "text-orange-600" : tone === "green" ? "text-emerald-600" : "";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] text-zinc-500">{label}</div>
        <div className={`tabular text-2xl font-semibold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
