import Link from "next/link";
import { orchestratorRepository, topicRepository } from "@/lib/repositories";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { PriorityBadge } from "@/components/ui/badge";
import { WORKFLOW_TYPE_LABELS } from "@/lib/labels";
import { generatePlanAction } from "@/app/actions/planning";
import { confirmPlanAction, startProductionAction } from "@/app/actions/review";

export const dynamic = "force-dynamic";

const ITEM_STATUS_LABELS: Record<string, string> = {
  pending: "待确认",
  approved: "已确认",
  rejected: "已拒绝",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  skipped: "跳过",
};

const ITEM_STATUS_TONES: Record<string, "default" | "blue" | "green" | "red" | "orange"> = {
  pending: "orange",
  approved: "blue",
  rejected: "default",
  running: "blue",
  completed: "green",
  failed: "red",
  skipped: "default",
};

/**
 * 本周计划（V2 P0）：Orchestrator 生成的周计划 + 依赖 DAG 视图。
 * draft → [确认选题] → confirmed → [开始生产] → production（DAG 自动推进）→ completed。
 */
export default async function PlanningPage() {
  const plans = await orchestratorRepository.listPlans(5);
  const plan = plans[0] ?? null;

  let items: Awaited<ReturnType<typeof orchestratorRepository.getPlanItems>> = [];
  let deps: Awaited<ReturnType<typeof orchestratorRepository.listDependencies>> = [];
  if (plan) {
    [items, deps] = await Promise.all([
      orchestratorRepository.getPlanItems(plan.id),
      orchestratorRepository.listDependencies(),
    ]);
  }
  const topics = plan ? await topicRepository.list() : [];
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  const types = ["ai_weekly", "github_weekly", "evergreen", "wechat_deep_dive"] as const;
  const byType = (t: (typeof types)[number]) => items.filter((i) => i.workflowType === t);
  const quota = (plan?.quota ?? {}) as Record<string, number>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">本周内容计划</h1>
          <p className="text-xs text-zinc-500">
            {plan
              ? `${plan.weekPrefix} · 状态 ${plan.status}${plan.confirmedAt ? ` · 已确认 ${plan.confirmedAt.toLocaleDateString()}` : ""}`
              : "尚未生成。点击「生成本周内容计划」，Orchestrator 将扫描候选 → 评分 → 路由并落库。"}
          </p>
        </div>
        <div className="flex gap-2">
          {plan && plan.status === "draft" && (
            <form action={confirmPlanAction.bind(null, plan.id)}>
              <Button>确认选题</Button>
            </form>
          )}
          {plan && plan.status === "confirmed" && (
            <form action={startProductionAction.bind(null, plan.id)}>
              <Button>开始生产</Button>
            </form>
          )}
          <Link href="/review"><Button variant="outline">去待审核 →</Button></Link>
        </div>
      </div>

      {!plan ? (
        <Card>
          <CardContent className="p-6">
            <p className="mb-3 text-sm text-zinc-600">本周还没有计划。生成后：AI 周报 1 / GitHub 周榜 1 / 常青 1 / 公众号 2（配额可配置）。</p>
            <form action={generatePlanAction.bind(null, currentWeek())}>
              <Button>生成本周内容计划</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 依赖 DAG */}
          <Card>
            <CardContent className="p-4">
              <div className="mb-3 text-xs font-semibold">依赖 DAG（上游全部完成 → 触发下游）</div>
              <div className="flex flex-wrap items-end gap-3">
                {types.map((t) => {
                  const count = byType(t).length;
                  const finished = byType(t).filter((i) => i.status === "completed").length;
                  const running = byType(t).filter((i) => i.status === "running").length;
                  return (
                    <div key={t} className="flex flex-col items-center gap-1">
                      <div
                        className={`rounded-lg border px-4 py-2 text-center ${
                          running
                            ? "border-blue-300 bg-blue-50"
                            : finished === count && count > 0
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-zinc-200 bg-white"
                        }`}
                      >
                        <div className="text-[13px] font-medium">{WORKFLOW_TYPE_LABELS[t]}</div>
                        <div className="text-[10px] text-zinc-500">
                          {count ? `${finished}/${count} 完成${running ? ` · ${running} 运行中` : ""}` : "—"}
                        </div>
                      </div>
                      <div className="text-[10px] text-zinc-400">配额 {quota[t] ?? 0}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 space-y-1 text-[10px] text-zinc-400">
                {deps.map((d) => (
                  <div key={d.id}>
                    {WORKFLOW_TYPE_LABELS[d.parentWorkflowType]} → {WORKFLOW_TYPE_LABELS[d.childWorkflowType]}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 计划项明细 */}
          <Card>
            <CardContent className="p-0">
              <div className="border-b border-zinc-100 px-3 py-2 text-xs font-semibold">
                计划项（{items.length}）
                <span className="ml-2 font-normal text-zinc-400">
                  {items.filter((i) => i.status === "pending").length} 待确认 · {items.filter((i) => i.status === "running").length} 运行中
                </span>
              </div>
              <ul className="divide-y divide-zinc-100">
                {items.map((item) => {
                  const topic = topicMap.get(item.topicId);
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link href={`/topics/${item.topicId}`} className="truncate text-[13px] font-medium hover:text-blue-600">
                            {topic?.title ?? item.topicId}
                          </Link>
                          <StatusBadge label={WORKFLOW_TYPE_LABELS[item.workflowType]} tone="blue" />
                          <PriorityBadge priority={item.priority as never} />
                        </div>
                        <div className="mt-0.5 text-[10px] text-zinc-400">
                          评分 {item.topicScore} · {topic?.topicId}
                          {item.runId && <span> · run {item.runId.slice(0, 8)}</span>}
                        </div>
                      </div>
                      <StatusBadge label={ITEM_STATUS_LABELS[item.status] ?? item.status} tone={ITEM_STATUS_TONES[item.status]} />
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          {/* 扫描摘要 */}
          {plan.scanSummary && (
            <Card>
              <CardContent className="p-3">
                <div className="mb-2 text-xs font-semibold">扫描摘要（Orchestrator）</div>
                <pre className="max-h-48 overflow-auto rounded bg-zinc-50 p-2 text-[10px] text-zinc-500">
                  {JSON.stringify(plan.scanSummary, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/** 当前 ISO 周（2026W37），供「生成本周内容计划」使用 */
function currentWeek(): string {
  const now = new Date();
  const y = now.getFullYear();
  const start = new Date(y, 0, 1);
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${y}W${String(week).padStart(2, "0")}`;
}
