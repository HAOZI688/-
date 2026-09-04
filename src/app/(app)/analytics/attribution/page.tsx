import { attributionRepository, metricsRepository, socialAccountRepository } from "@/lib/repositories";
import { ATTRIBUTION_MODEL_VERSION } from "@/lib/services/attribution";
import { runAttributionAction } from "@/app/actions/v3";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtDay, fmtNum } from "@/lib/format";
import { PLATFORM_LABELS, RUN_STATUS_LABELS, RUN_STATUS_TONES } from "@/lib/labels";

export const dynamic = "force-dynamic";

/** 归因类型 → 中文标签 + 徽标配色（direct 绿 / high_confidence 蓝 / probable 橙 / assisted 灰 / unattributed 红） */
const ATTRIBUTION_TYPE_LABELS: Record<string, string> = {
  direct: "直接归因",
  high_confidence: "高置信",
  probable: "可能",
  assisted: "辅助",
  unattributed: "未归因",
};

const ATTRIBUTION_TYPE_TONES: Record<string, "green" | "blue" | "orange" | "default" | "red"> = {
  direct: "green",
  high_confidence: "blue",
  probable: "orange",
  assisted: "default",
  unattributed: "red",
};

export default async function AttributionPage() {
  const accounts = await socialAccountRepository.list();
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const accountName = (id: string) => accountMap.get(id)?.accountName ?? id.slice(0, 8);

  const [cards, runs] = await Promise.all([
    Promise.all(
      accounts.map(async (acc) => {
        const [baseline, snapshot] = await Promise.all([
          attributionRepository.getLatestBaseline(acc.id),
          metricsRepository.getLatestAccountSnapshot(acc.id),
        ]);
        return { account: acc, baseline, snapshot };
      }),
    ),
    attributionRepository.listRuns(undefined, 20),
  ]);

  // 每个 Run 预取结果（<details> 展开渲染，保持 server component）
  const resultsByRun = new Map<string, Awaited<ReturnType<typeof attributionRepository.listResults>>>();
  await Promise.all(
    runs.map(async (run) => {
      resultsByRun.set(run.id, await attributionRepository.listResults(run.id));
    }),
  );

  return (
    <div className="space-y-4 p-4">
      {/* 顶部标题 + 运行按钮 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">涨粉归因</h1>
          <p className="text-xs text-zinc-500">
            增量 = 观察增长 − 预期基线（28 天滚动日均），按信号分级分配给周期内作品 · 模型 {ATTRIBUTION_MODEL_VERSION}
          </p>
        </div>
        <form action={runAttributionAction.bind(null)}>
          <Button>运行涨粉归因（上一自然周）</Button>
        </form>
      </div>

      {/* 账号卡片区：基线 + 最新快照 */}
      <div>
        <div className="mb-1.5 text-[11px] font-semibold text-zinc-600">账号基线 &amp; 最新快照</div>
        {cards.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState title="暂无账号" description="先在连接器导入平台账号与小豆芽数据，再运行归因。" />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {cards.map(({ account: acc, baseline, snapshot }) => (
              <Card key={acc.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-zinc-800">{acc.accountName}</div>
                    <div className="text-[10px] text-zinc-400">{PLATFORM_LABELS[acc.platform] ?? acc.platform}</div>
                  </div>

                  {baseline ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <Mini label="日均增长" value={fmtNum(num(baseline.avgDailyGrowth))} />
                      <Mini label="日均中位" value={fmtNum(num(baseline.medianDailyGrowth))} />
                      <Mini label="标准差" value={fmtNum(num(baseline.stdDev))} />
                      <Mini label="异常日" value={fmtNum(baseline.anomalyDays)} />
                      <Mini label="样本天数" value={fmtNum(baseline.sampleDays)} />
                    </div>
                  ) : (
                    <p className="text-[10px] text-zinc-400">暂无增长基线（运行归因后自动生成）</p>
                  )}

                  <div className="border-t border-zinc-100 pt-1.5">
                    {snapshot ? (
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-zinc-500">
                          粉丝 <b className="tabular text-zinc-800">{fmtNum(snapshot.followers)}</b>
                        </span>
                        <span className="text-zinc-500">
                          新增 <b className="tabular text-emerald-600">+{fmtNum(snapshot.newFollowers)}</b>
                        </span>
                        <span className="whitespace-nowrap text-[10px] text-zinc-400">{fmtDate(snapshot.capturedAt)}</span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-zinc-400">暂无账号快照（请先同步小豆芽数据）</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 归因 Run 列表 */}
      <div>
        <div className="mb-1.5 text-[11px] font-semibold text-zinc-600">归因 Run 记录（最近 20 次）</div>
        {runs.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState title="暂无归因记录" description="点击顶部按钮为全部账号计算上一自然周的涨粉归因。" />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>账号</TableHead>
                    <TableHead>周期</TableHead>
                    <TableHead className="text-right">观察增长</TableHead>
                    <TableHead className="text-right">预期增长</TableHead>
                    <TableHead className="text-right">增量</TableHead>
                    <TableHead className="text-right">未归因</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>完成时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => {
                    const results = resultsByRun.get(run.id) ?? [];
                    return (
                      <TableRow key={run.id}>
                        <TableCell colSpan={8} className="p-0">
                          <details className="group">
                            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 [&::-webkit-details-marker]:hidden">
                              <span className="w-2 text-zinc-400 transition-transform group-open:rotate-90">▸</span>
                              <span className="w-40 truncate font-medium text-zinc-800">{accountName(run.socialAccountId)}</span>
                              <span className="w-44 text-zinc-500">
                                {fmtDay(run.periodStart)} ~ {fmtDay(run.periodEnd)}
                              </span>
                              <span className="w-14 text-right tabular text-zinc-600">{fmtNum(run.observedGrowth)}</span>
                              <span className="w-14 text-right tabular text-zinc-600">{fmtNum(run.expectedGrowth)}</span>
                              <span className="w-14 text-right tabular font-semibold text-emerald-600">
                                +{fmtNum(run.incrementalGrowth)}
                              </span>
                              <span className="w-14 text-right tabular text-zinc-500">{fmtNum(run.unattributed)}</span>
                              <span className="w-16">
                                <StatusBadge
                                  label={RUN_STATUS_LABELS[run.status] ?? run.status}
                                  tone={RUN_STATUS_TONES[run.status]}
                                />
                              </span>
                              <span className="ml-auto w-24 text-right text-[10px] text-zinc-400">
                                {fmtDate(run.completedAt)}
                              </span>
                            </summary>

                            {run.error && (
                              <div className="mx-3 mb-2 rounded-md bg-red-50 px-2 py-1.5 text-[10px] text-red-600">
                                {run.error}
                              </div>
                            )}

                            <div className="border-t border-zinc-100 bg-zinc-50/50 px-3 py-2">
                              {results.length === 0 ? (
                                <p className="py-1 text-[10px] text-zinc-400">暂无归因结果。</p>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>作品</TableHead>
                                      <TableHead>Topic</TableHead>
                                      <TableHead className="text-right">归因粉丝</TableHead>
                                      <TableHead className="text-right">得分</TableHead>
                                      <TableHead>类型</TableHead>
                                      <TableHead>证据</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {results.map((r) => {
                                      const ev = (r.result.evidence ?? {}) as Record<string, unknown>;
                                      const evidenceText = [ev.viewEvidence, ev.profileEvidence, ev.recencyEvidence]
                                        .filter((v): v is string => typeof v === "string" && v.length > 0);
                                      return (
                                        <TableRow key={r.result.id}>
                                          <TableCell className="max-w-[220px]">
                                            <div className="truncate text-xs font-medium text-zinc-800">
                                              {r.topic?.title ?? "—"}
                                            </div>
                                            <div className="text-[10px] text-zinc-400">
                                              {r.publication?.publishedDate ? fmtDay(r.publication.publishedDate) : "未发布"}
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-xs text-zinc-500">{r.topic?.topicId ?? "—"}</TableCell>
                                          <TableCell className="text-right text-xs font-semibold tabular text-emerald-600">
                                            {r.result.attributedFollowers != null
                                              ? fmtNum(Number(r.result.attributedFollowers))
                                              : "—"}
                                          </TableCell>
                                          <TableCell className="text-right text-xs tabular text-zinc-600">
                                            {r.result.attributionScore != null
                                              ? Number(r.result.attributionScore).toFixed(3)
                                              : "—"}
                                          </TableCell>
                                          <TableCell>
                                            <StatusBadge
                                              label={ATTRIBUTION_TYPE_LABELS[r.result.attributionType] ?? r.result.attributionType}
                                              tone={ATTRIBUTION_TYPE_TONES[r.result.attributionType] ?? "default"}
                                            />
                                          </TableCell>
                                          <TableCell className="max-w-[260px] text-[10px] text-zinc-500">
                                            {evidenceText.length > 0 ? evidenceText.join("；") : "—"}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              )}
                            </div>
                          </details>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/** numeric 列（string | null）转 number | null */
function num(v: string | null | undefined): number | null {
  return v == null || v === "" ? null : Number(v);
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] text-zinc-400">{label}</span>
      <span className="text-xs font-medium tabular text-zinc-700">{value}</span>
    </div>
  );
}
