import Link from "next/link";
import { orchestratorRepository, topicRepository } from "@/lib/repositories";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { PriorityBadge } from "@/components/ui/badge";
import {
  CONTENT_ROLE_LABELS,
  ITEM_STATUS_LABELS,
  ITEM_STATUS_TONES,
  REASON_CODE_LABELS,
  WORKFLOW_TYPE_LABELS,
} from "@/lib/labels";
import { isoWeekKey } from "@/lib/utils";
import {
  approvePlanItemAction,
  approveAllPlanItemsAction,
  pausePlanItemAction,
  resumePlanItemAction,
  editPlanItemFormAction,
} from "@/app/actions/v3";
import { confirmPlanAction, rejectPlanItemAction, startProductionAction } from "@/app/actions/review";
import { generatePlanAction } from "@/app/actions/planning";
import { EmptyState } from "@/components/ui/empty-state";

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

const PRIORITY_OPTIONS = ["P0", "P1", "P2", "P3"];
const ROLE_OPTIONS = ["traffic", "cognition", "scenario", "product", "conversion"];
const WORKFLOW_OPTIONS = ["ai_weekly", "github_weekly", "evergreen", "wechat_deep_dive"];

/**
 * Weekly Plan V2（/weekly-plan）：
 * 解释性评分（base + trend + performance + conversion + knowledge_gap → final，clamp 0-10）
 * 每条计划项展示全部 adjustment 明细 + reason_codes（V3 §24，不只有最终数字）。
 * 操作：通过 / 暂停 / 恢复 / 拒绝 / 编辑（表单版）/ 全部通过 / 确认 / 开始生产。
 */
export default async function WeeklyPlanPage() {
  const thisWeek = isoWeekKey(new Date());
  const [plans, topics] = await Promise.all([orchestratorRepository.listPlans(4), topicRepository.list()]);
  const plan = plans.find((p) => p.weekPrefix === thisWeek) ?? plans[0] ?? null;
  const items = plan ? await orchestratorRepository.getPlanItems(plan.id) : [];
  const pendingItems = items.filter((i) => i.status === "pending");
  const pausedItems = items.filter((i) => i.status === "paused");

  const topicByUuid = new Map(topics.map((t) => [t.id, t]));
  const bizId = (uuid: string) => topicByUuid.get(uuid)?.topicId ?? uuid;

  const scanSummary = (plan?.scanSummary ?? null) as
    | { prevWeek?: string; candidates?: number; feedbackApplied?: number; trendLinked?: number }
    | null;

  return (
    <div className="space-y-4 p-4">
      {/* V4 冷启动保护（规格 §25）：数据不足时明确提示推荐依据 */}
      <ColdStartBanner />
      {/* 头部 + 计划级动作 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">本周内容计划</h1>
          <p className="text-xs text-zinc-500">
            {plan
              ? `${plan.weekPrefix} · ${PLAN_STATUS_LABELS[plan.status] ?? plan.status} · ${items.length} 项选题`
              : `本周 ${thisWeek} 还没有计划`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!plan && (
            <form action={generatePlanAction.bind(null, thisWeek)}>
              <Button>生成本周内容计划</Button>
            </form>
          )}
          {plan && plan.status === "draft" && (
            <>
              {pendingItems.length > 0 && (
                <form action={approveAllPlanItemsAction.bind(null, plan.id)}>
                  <Button variant="outline">全部通过（{pendingItems.length}）</Button>
                </form>
              )}
              <form action={confirmPlanAction.bind(null, plan.id)}>
                <Button>确认本周选题</Button>
              </form>
            </>
          )}
          {plan && plan.status === "confirmed" && (
            <form action={startProductionAction.bind(null, plan.id)}>
              <Button>确认并开始生产</Button>
            </form>
          )}
          {plan && plan.status === "production" && (
            <Link href="/production">
              <Button variant="outline">生产监控（进行中）</Button>
            </Link>
          )}
          <Link href="/dashboard"><Button variant="ghost">← 返回工作台</Button></Link>
        </div>
      </div>

      {/* 评分公式说明（解释性评分） */}
      {plan && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-[11px] text-zinc-500">
            <span className="font-semibold text-zinc-700">评分模型：</span>
            <span>最终分 = clamp(基础分 {">base"} + 趋势调整 {">trend"} + 表现调整 {">perf"} + 转化调整 {">conv"} + 知识缺口调整 {">gap"}, 0~10)</span>
            <span className="text-zinc-400">|</span>
            <span>趋势调整 = (趋势分−5)×0.3（±1.5）</span>
            <span>表现调整 = (表现分−5)×0.2（±1）</span>
            <span>转化调整 = (转化分−5)×0.15（±0.75）</span>
            <span>知识缺口 = 无资产且无知识 +0.5</span>
            {scanSummary && (
              <span className="ml-auto text-zinc-400">
                扫描 {scanSummary.prevWeek ?? "—"}：候选 {scanSummary.candidates ?? 0} · 反馈 {scanSummary.feedbackApplied ?? 0} · 趋势关联 {scanSummary.trendLinked ?? 0}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {/* 计划项列表（V3 解释性评分明细） */}
      {!plan ? (
        <Card>
          <CardContent>
            <EmptyState
              title="本周还没有内容计划"
              description="点击右上角「生成本周内容计划」，Orchestrator 会扫描可生产 Topic 并给出解释性评分。"
              action={
                <form action={generatePlanAction.bind(null, thisWeek)}>
                  <Button size="sm">生成本周内容计划</Button>
                </form>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <p className="p-6 text-center text-xs text-zinc-400">计划为空（可能候选不足或全部被拒绝）。</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {items.map((item) => {
                  const topic = topicByUuid.get(item.topicId);
                  const editable = ["pending", "approved", "paused"].includes(item.status);
                  return (
                    <li key={item.id} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        {/* 左：Topic + 元信息 */}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/topics/${bizId(item.topicId)}`} className="truncate text-[13px] font-medium hover:text-blue-600">
                              {bizId(item.topicId)}
                            </Link>
                            <StatusBadge label={ITEM_STATUS_LABELS[item.status] ?? item.status} tone={ITEM_STATUS_TONES[item.status] as never} />
                            <PriorityBadge priority={item.priority as never} />
                            <StatusBadge label={WORKFLOW_TYPE_LABELS[item.workflowType]} tone="blue" />
                            <StatusBadge label={CONTENT_ROLE_LABELS[item.contentRole ?? ""] ?? item.contentRole ?? "—"} tone="default" />
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-zinc-400">{topic?.title ?? "—"}</div>

                          {/* V3 解释性评分明细 */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-zinc-500">
                            <span>基础 <b className="tabular text-zinc-700">{item.baseScore ?? "—"}</b></span>
                            <span>趋势 <b className={numClass(item.trendAdjustment)}>{signed(item.trendAdjustment)}</b></span>
                            <span>表现 <b className={numClass(item.performanceAdjustment)}>{signed(item.performanceAdjustment)}</b></span>
                            <span>转化 <b className={numClass(item.conversionAdjustment)}>{signed(item.conversionAdjustment)}</b></span>
                            <span>缺口 <b className={numClass(item.knowledgeGapAdjustment)}>{signed(item.knowledgeGapAdjustment)}</b></span>
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">
                              最终 {item.finalScore ?? item.topicScore}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {(item.reasonCodes ?? []).map((code) => (
                                <span key={code} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">
                                  {REASON_CODE_LABELS[code] ?? code}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* 右：操作 */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          {item.status === "pending" && (
                            <form action={approvePlanItemAction.bind(null, item.id)}>
                              <Button size="sm">通过</Button>
                            </form>
                          )}
                          {item.status === "pending" && (
                            <form action={pausePlanItemAction.bind(null, item.id)}>
                              <Button variant="outline" size="sm">暂停</Button>
                            </form>
                          )}
                          {item.status === "approved" && (
                            <form action={pausePlanItemAction.bind(null, item.id)}>
                              <Button variant="outline" size="sm">暂停</Button>
                            </form>
                          )}
                          {item.status === "paused" && (
                            <form action={resumePlanItemAction.bind(null, item.id)}>
                              <Button variant="outline" size="sm">恢复</Button>
                            </form>
                          )}
                          {item.status === "pending" && (
                            <form action={rejectPlanItemAction.bind(null, item.id)}>
                              <Button variant="ghost" size="sm" className="text-red-600">拒绝</Button>
                            </form>
                          )}
                          {editable && (
                            <details className="group">
                              <summary className="cursor-pointer list-none rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50">
                                编辑
                              </summary>
                              <form
                                action={editPlanItemFormAction.bind(null, item.id)}
                                className="absolute right-3 z-10 mt-1 flex w-64 flex-col gap-1.5 rounded-lg border border-zinc-200 bg-white p-2 shadow-md"
                              >
                                <label className="flex items-center gap-2 text-[11px] text-zinc-500">
                                  优先级
                                  <select name="priority" defaultValue={item.priority} className="h-6 flex-1 rounded border border-zinc-200 px-1 text-xs">
                                    {PRIORITY_OPTIONS.map((p) => (
                                      <option key={p} value={p}>{p}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="flex items-center gap-2 text-[11px] text-zinc-500">
                                  内容角色
                                  <select name="contentRole" defaultValue={item.contentRole ?? "scenario"} className="h-6 flex-1 rounded border border-zinc-200 px-1 text-xs">
                                    {ROLE_OPTIONS.map((r) => (
                                      <option key={r} value={r}>{CONTENT_ROLE_LABELS[r]}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="flex items-center gap-2 text-[11px] text-zinc-500">
                                  生产路由
                                  <select name="workflowType" defaultValue={item.workflowType} className="h-6 flex-1 rounded border border-zinc-200 px-1 text-xs">
                                    {WORKFLOW_OPTIONS.map((w) => (
                                      <option key={w} value={w}>{WORKFLOW_TYPE_LABELS[w]}</option>
                                    ))}
                                  </select>
                                </label>
                                <Button size="sm" className="mt-1">保存修改</Button>
                              </form>
                            </details>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* 摘要统计 */}
      {plan && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MiniStat label="待确认" value={pendingItems.length} />
          <MiniStat label="已通过" value={items.filter((i) => i.status === "approved").length} />
          <MiniStat label="已暂停" value={pausedItems.length} />
          <MiniStat label="生产中" value={items.filter((i) => i.status === "running").length} />
          <MiniStat label="已完成" value={items.filter((i) => i.status === "completed").length} />
        </div>
      )}
    </div>
  );
}

function signed(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (n === 0) return "0";
  return n > 0 ? `+${v}` : v;
}

function numClass(v: string | null | undefined): string {
  const n = Number(v ?? 0);
  if (n > 0) return "tabular text-emerald-700";
  if (n < 0) return "tabular text-red-600";
  return "tabular text-zinc-700";
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-white px-3 py-2">
      <div className="text-[10px] text-zinc-400">{label}</div>
      <div className="tabular text-lg font-semibold text-zinc-800">{value}</div>
    </div>
  );
}

/** V4 冷启动保护：数据置信度不足时提示推荐依据（规格 §25） */
async function ColdStartBanner() {
  const { computeDataConfidence } = await import("@/lib/services/data-confidence");
  const confidence = await computeDataConfidence();
  if (confidence.level === "medium" || confidence.level === "high") {
    return (
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
        ✓ {confidence.message}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      ⚠️ {confidence.message}
      <span className="ml-2 text-[10px] text-amber-600">
        （真实快照 {confidence.realPostSnapshots} · 表现记录 {confidence.realTopicPerformances} · 发布 {confidence.realPublications}）
      </span>
    </div>
  );
}
