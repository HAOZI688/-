import Link from "next/link";
import { orchestratorRepository, workflowRepository } from "@/lib/repositories";
import { aiCostService } from "@/lib/services/ai-cost";
import { acceptanceStatsService } from "@/lib/services/acceptance-stats";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RUN_STATUS_LABELS, RUN_STATUS_TONES, WORKFLOW_TYPE_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/format";
import { retryRunAction, cancelQueuedRunAction } from "@/app/actions/v3";

export const dynamic = "force-dynamic";

const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: "已生成 · 待确认",
  confirmed: "已确认 · 待生产",
  production: "生产中",
  completed: "已完成",
  cancelled: "已取消",
  production_blocked: "生产阻塞（含失败项）",
  needs_review: "产出待人工复核",
};

/**
 * Production（/production）：DAG 生产监控台。
 * 按工作流类型 × 状态聚合（queued/running/completed/failed/needs_review）+ run 明细列表。
 * Error Recovery：失败 run 可 Retry（相同参数重启），queued/running 可取消。
 */
export default async function ProductionPage() {
  const [runs, plans, costRows, costTotal, acceptance] = await Promise.all([
    workflowRepository.listRunsWithTopic(200),
    orchestratorRepository.listPlans(6),
    aiCostService.weeklyByWorkflow(),
    aiCostService.weeklyTotal(),
    acceptanceStatsService.weeklySummary(),
  ]);
  // 每个计划项数（weekly_plans 无 items 列，一次批量查询）
  const planItemCounts = new Map<string, number>();
  for (const plan of plans) {
    planItemCounts.set(plan.id, (await orchestratorRepository.getPlanItems(plan.id)).length);
  }

  // 按类型 × 状态统计
  const byType: Record<string, Record<string, number>> = {};
  for (const { run } of runs) {
    byType[run.workflowType] ??= { queued: 0, running: 0, completed: 0, failed: 0, needs_review: 0 };
    byType[run.workflowType][run.status] = (byType[run.workflowType][run.status] ?? 0) + 1;
  }
  const types = ["ai_weekly", "github_weekly", "evergreen", "wechat_deep_dive"] as const;

  const totalByStatus = {
    queued: runs.filter((r) => r.run.status === "queued").length,
    running: runs.filter((r) => r.run.status === "running").length,
    completed: runs.filter((r) => r.run.status === "completed").length,
    failed: runs.filter((r) => r.run.status === "failed").length,
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">生产监控台</h1>
          <p className="text-xs text-zinc-500">
            DAG 运行状态 · 失败可重试（相同参数重启），排队中可取消 · 全部真实落库
          </p>
        </div>
        <Link href="/weekly-plan"><Button variant="ghost">← 返回周计划</Button></Link>
      </div>

      {/* 全局状态条 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat label="排队中" value={totalByStatus.queued} className="text-zinc-800" />
        <MiniStat label="运行中" value={totalByStatus.running} className="text-blue-700" />
        <MiniStat label="已完成" value={totalByStatus.completed} className="text-emerald-700" />
        <MiniStat label="失败 / 需介入" value={totalByStatus.failed + runs.filter((r) => r.run.needsManual).length} className="text-red-600" />
      </div>

      {/* 按工作流类型的 DAG 状态 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {types.map((type) => {
          const s = byType[type] ?? {};
          return (
            <Card key={type}>
              <CardContent className="p-3">
                <div className="text-[13px] font-medium">{WORKFLOW_TYPE_LABELS[type]}</div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-center text-[11px]">
                  <div className="rounded bg-zinc-50 py-1">
                    <div className="tabular font-semibold text-zinc-700">{s.queued ?? 0}</div>
                    <div className="text-[9px] text-zinc-400">排队</div>
                  </div>
                  <div className="rounded bg-blue-50 py-1">
                    <div className="tabular font-semibold text-blue-700">{s.running ?? 0}</div>
                    <div className="text-[9px] text-blue-400">运行</div>
                  </div>
                  <div className="rounded bg-emerald-50 py-1">
                    <div className="tabular font-semibold text-emerald-700">{s.completed ?? 0}</div>
                    <div className="text-[9px] text-emerald-400">完成</div>
                  </div>
                  <div className="rounded bg-red-50 py-1">
                    <div className="tabular font-semibold text-red-600">{s.failed ?? 0}</div>
                    <div className="text-[9px] text-red-400">失败</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 本周计划状态（DAG 维度） */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-zinc-100 px-3 py-2 text-xs font-semibold">本周计划状态</div>
          {plans.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">还没有周计划。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>周期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>计划项</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.weekPrefix}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={PLAN_STATUS_LABELS[plan.status] ?? plan.status}
                        tone={PLAN_STATUS_TONES[plan.status] ?? "default"}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">{planItemCounts.get(plan.id) ?? 0} 项</TableCell>
                    <TableCell>
                      <Link href="/weekly-plan" className="text-[11px] text-blue-600 hover:underline">周计划详情 →</Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Run 明细（Error Recovery：Retry / Cancel Queued） */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-zinc-100 px-3 py-2 text-xs font-semibold">
            Run 明细（最近 {runs.length} 条）
          </div>
          {runs.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">还没有工作流运行记录。</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类型</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>批次</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>启动时间</TableHead>
                  <TableHead>错误信息</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.slice(0, 50).map(({ run, topic }) => (
                  <TableRow key={run.id} className={run.status === "failed" ? "bg-red-50/40" : undefined}>
                    <TableCell className="text-xs font-medium">{WORKFLOW_TYPE_LABELS[run.workflowType]}</TableCell>
                    <TableCell>
                      {topic ? (
                        <Link href={`/topics/${topic.topicId}`} className="text-xs hover:text-blue-600">
                          {topic.topicId}
                        </Link>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] text-zinc-500">{run.batchId ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge label={RUN_STATUS_LABELS[run.status] ?? run.status} tone={RUN_STATUS_TONES[run.status] ?? "default"} />
                        {run.needsManual && (
                          <StatusBadge label="需人工介入" tone="red" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] text-zinc-500">{fmtDate(run.startedAt ?? run.createdAt)}</TableCell>
                    <TableCell className="max-w-52 truncate text-[11px] text-red-600" title={run.error ?? ""}>
                      {run.status === "failed" || run.needsManual ? (run.error ?? "失败").slice(0, 60) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        <Link href="/workflows/runs" className="text-[11px] text-blue-600 hover:underline">执行记录 →</Link>
                        {(run.status === "failed" || run.needsManual) && (
                          <form action={retryRunAction.bind(null, run.id)}>
                            <Button variant="outline" size="sm">重试</Button>
                          </form>
                        )}
                        {(run.status === "queued" || run.status === "running") && (
                          <form action={cancelQueuedRunAction.bind(null, run.id)}>
                            <Button variant="ghost" size="sm" className="text-red-600">取消</Button>
                          </form>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* V4：AI 成本 + 内容验收（规格 §38/§39） */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
              <span className="text-xs font-semibold">本周 AI 成本（真实调用留痕）</span>
              <span className="text-[11px] text-zinc-500">
                总计 ${costTotal.costUsd.toFixed(4)} · {costTotal.calls} 次调用
                {costTotal.avgCostPerPublished !== null && ` · 单篇已发布 $${costTotal.avgCostPerPublished.toFixed(4)}`}
              </span>
            </div>
            {costRows.length === 0 ? (
              <p className="p-6 text-center text-xs text-zinc-400">
                本周暂无真实 AI 调用（未配置 API Key 时工作流为演示模式，不产生成本）。
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>工作流</TableHead>
                    <TableHead className="text-right">调用</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">成本</TableHead>
                    <TableHead className="text-right">平均延迟</TableHead>
                    <TableHead className="text-right">重试率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costRows.map((r) => (
                    <TableRow key={r.workflowType}>
                      <TableCell className="text-xs font-medium">{WORKFLOW_TYPE_LABELS[r.workflowType] ?? r.workflowType}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
                      <TableCell className="text-right tabular-nums">{(r.inputTokens + r.outputTokens).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-blue-700">${r.costUsd.toFixed(4)}</TableCell>
                      <TableCell className="text-right tabular-nums">{(r.avgLatencyMs / 1000).toFixed(1)}s</TableCell>
                      <TableCell className="text-right tabular-nums">{(r.retryRate * 100).toFixed(0)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="border-b border-zinc-100 px-3 py-2 text-xs font-semibold">本周内容验收（Acceptance Rate）</div>
            {acceptance.length === 0 ? (
              <p className="p-6 text-center text-xs text-zinc-400">本周暂无内容产出记录。</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>工作流</TableHead>
                    <TableHead className="text-right">生成</TableHead>
                    <TableHead className="text-right">直接通过</TableHead>
                    <TableHead className="text-right">修改后通过</TableHead>
                    <TableHead className="text-right">打回</TableHead>
                    <TableHead className="text-right">通过率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {acceptance.map((a) => {
                    const sample = a.approvedDirectly + a.approvedAfterEdit + a.rejected;
                    const insufficient = sample < 5;
                    return (
                      <TableRow key={a.workflowType}>
                        <TableCell className="text-xs font-medium">{WORKFLOW_TYPE_LABELS[a.workflowType] ?? a.workflowType}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.generated}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-600">{a.approvedDirectly}</TableCell>
                        <TableCell className="text-right tabular-nums text-blue-600">{a.approvedAfterEdit}</TableCell>
                        <TableCell className="text-right tabular-nums text-red-500">{a.rejected}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {insufficient ? (
                            <span className="text-[10px] text-amber-600" title={`样本量 ${sample} < 5`}>INSUFFICIENT_SAMPLE</span>
                          ) : a.acceptanceRate === null ? "—" : `${a.acceptanceRate.toFixed(0)}%`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const PLAN_STATUS_TONES: Record<string, "orange" | "blue" | "green" | "default"> = {
  draft: "orange",
  confirmed: "blue",
  production: "blue",
  completed: "green",
  cancelled: "default",
};

function MiniStat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-white px-3 py-2">
      <div className="text-[10px] text-zinc-400">{label}</div>
      <div className={`tabular text-2xl font-semibold ${className ?? ""}`}>{value}</div>
    </div>
  );
}
