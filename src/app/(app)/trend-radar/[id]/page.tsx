import Link from "next/link";
import { notFound } from "next/navigation";
import { trendRepository } from "@/lib/repositories";
import { createTopicFromTrendAction, recalcTrendAction } from "@/app/actions/v3";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/shared/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/* ===== 状态/覆盖/来源类型/关系 → 中文 + 色调（局部常量，数据字典见 lib/labels） ===== */
const TREND_STATUS_LABELS: Record<string, string> = {
  emerging: "新兴",
  rising: "上升",
  stable: "稳定",
  declining: "下滑",
  archived: "已归档",
};

const TREND_STATUS_TONES: Record<string, "default" | "blue" | "green" | "orange" | "red" | "outline"> = {
  emerging: "blue",
  rising: "green",
  stable: "default",
  declining: "orange",
  archived: "default",
};

const COVERAGE_LABELS: Record<string, string> = {
  uncovered: "未覆盖",
  partial: "部分覆盖",
  covered: "已覆盖",
  saturated: "已饱和",
};

const COVERAGE_TONES: Record<string, "default" | "blue" | "green" | "orange" | "red" | "outline"> = {
  uncovered: "red",
  partial: "orange",
  covered: "blue",
  saturated: "green",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  ai_weekly: "AI 周报",
  github_weekly: "GitHub 周榜",
  knowledge: "知识库",
  manual: "人工录入",
  content_performance: "内容表现",
  social_data: "社交数据",
  user_question: "用户提问",
};

const RELATION_LABELS: Record<string, string> = {
  source: "来源",
  covered: "已覆盖",
  suggested: "建议",
  derived: "衍生",
};

/** 8 信号（trend-scoring §13 breakdown 键，0-10） */
const SIGNAL_LABELS: Record<string, string> = {
  recurrence: "复发频率",
  velocity: "增速",
  sourceDiversity: "来源多样性",
  technicalSignificance: "技术显著性",
  b2b: "B2B 相关性",
  contentPerformance: "内容表现",
  conversion: "转化信号",
  knowledgeGap: "知识缺口",
};
const SIGNAL_KEYS = Object.keys(SIGNAL_LABELS);

const num = (v: string | number | null | undefined, digits = 1) => Number(v ?? 0).toFixed(digits);

/** 速度分：正绿 / 负红 / 零灰 */
function Velocity({ value }: { value: number }) {
  if (value > 0) return <span className="tabular font-medium text-emerald-600">+{value.toFixed(1)}</span>;
  if (value < 0) return <span className="tabular font-medium text-red-600">{value.toFixed(1)}</span>;
  return <span className="tabular text-zinc-400">0.0</span>;
}

/**
 * 趋势详情（V3 §10-§16）：
 * 评分明细（8 信号进度条）+ 来源证据 + 覆盖 Topic（业务 topicId 路由）+ 快照时间线。
 * 全部真实 DB 读，数据为空用 EmptyState。
 */
export default async function TrendDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trend = await trendRepository.getTrend(id);
  if (!trend) notFound();

  // 子查询按 UUID 关联（趋势主查询已兼容 trend_key 业务 ID）
  const [sources, topics, snapshots] = await Promise.all([
    trendRepository.listSources(trend.id),
    trendRepository.listTopics(trend.id),
    trendRepository.listSnapshots(trend.id),
  ]);

  const breakdown = (trend.scoreBreakdown ?? {}) as Record<string, number>;

  return (
    <div className="space-y-4 p-4">
      {/* 头部：标题 + 状态 + 覆盖 + 操作 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{trend.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="font-mono">{trend.trendKey}</span>
            <StatusBadge
              label={TREND_STATUS_LABELS[trend.status] ?? trend.status}
              tone={TREND_STATUS_TONES[trend.status]}
            />
            <StatusBadge
              label={`覆盖：${COVERAGE_LABELS[trend.coverageStatus] ?? trend.coverageStatus}`}
              tone={COVERAGE_TONES[trend.coverageStatus]}
            />
            {trend.category ? <span>分类：{trend.category}</span> : null}
            <span>首次发现 {fmtDate(trend.firstSeenAt)}</span>
            <span>最后出现 {fmtDate(trend.lastSeenAt)}</span>
          </div>
          {trend.description && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-zinc-500">{trend.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <form action={recalcTrendAction.bind(null, id)}>
            <Button variant="outline" size="sm">重新评分</Button>
          </form>
          <form action={createTopicFromTrendAction.bind(null, id)}>
            <Button size="sm">创建 Topic</Button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 左列：评分明细 + 信号进度条 */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>评分明细</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <div className="rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2">
                  <div className="text-[10px] text-zinc-500">综合分</div>
                  <div className="tabular text-xl font-semibold text-blue-700">{num(trend.currentScore)}</div>
                </div>
                <div className="rounded-md border border-zinc-100 px-3 py-2">
                  <div className="text-[10px] text-zinc-500">速度</div>
                  <div className="text-xl font-semibold"><Velocity value={Number(trend.velocityScore ?? 0)} /></div>
                </div>
                <div className="rounded-md border border-zinc-100 px-3 py-2">
                  <div className="text-[10px] text-zinc-500">来源多样性</div>
                  <div className="tabular text-lg font-semibold">{num(trend.sourceDiversity)}</div>
                </div>
                <div className="rounded-md border border-zinc-100 px-3 py-2">
                  <div className="text-[10px] text-zinc-500">B2B 相关性</div>
                  <div className="tabular text-lg font-semibold">
                    {trend.b2bRelevance != null ? `${trend.b2bRelevance} / 10` : "—"}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
                <span>评分配置版本</span>
                <span className="font-mono">{trend.configVersion ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>信号明细（{SIGNAL_KEYS.length} 项）</CardTitle></CardHeader>
            <CardContent className="space-y-2.5">
              {SIGNAL_KEYS.map((key) => {
                const v = Math.max(0, Math.min(10, Number(breakdown[key] ?? 0)));
                return (
                  <div key={key}>
                    <div className="mb-0.5 flex justify-between text-[11px] text-zinc-500">
                      <span>{SIGNAL_LABELS[key]}</span>
                      <span className="tabular font-medium">{v.toFixed(1)} / 10</span>
                    </div>
                    <Progress value={(v / 10) * 100} />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* 右两列：来源证据 / 覆盖 Topic / 时间线 */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>来源证据（{sources.length}）</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {!sources.length ? (
                <EmptyState title="暂无来源证据" description="运行「扫描趋势雷达」或「重新评分」后，来源事件会聚合到这里" />
              ) : (
                sources.map(({ source, topic }) => (
                  <div key={source.id} className="rounded-md border border-zinc-100 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="blue">{SOURCE_TYPE_LABELS[source.sourceType] ?? source.sourceType}</Badge>
                        {topic && (
                          <Link href={`/topics/${topic.topicId}`} className="text-xs font-medium text-blue-600 hover:underline">
                            {topic.title}
                          </Link>
                        )}
                      </div>
                      <span className="whitespace-nowrap text-[10px] text-zinc-400">{fmtDate(source.seenAt)}</span>
                    </div>
                    {source.evidence && <p className="mt-1 text-xs leading-relaxed text-zinc-600">{source.evidence}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>覆盖 Topic（{topics.length}）</CardTitle></CardHeader>
            <CardContent>
              {!topics.length ? (
                <EmptyState title="暂无关联 Topic" description="点击「创建 Topic」将该趋势纳入选题库（Topic Approval Gate）" />
              ) : (
                <div className="space-y-1.5">
                  {topics.map(({ tt, topic }) => (
                    <div key={tt.id} className="flex items-center gap-2 rounded-md border border-zinc-100 px-3 py-2">
                      <Link href={`/topics/${topic.topicId}`} className="min-w-0 truncate text-[13px] font-medium hover:text-blue-600">
                        {topic.title}
                      </Link>
                      <span className="font-mono text-[10px] text-zinc-400">{topic.topicId}</span>
                      <span className="ml-auto">
                        <Badge variant="outline">{RELATION_LABELS[tt.relation] ?? tt.relation}</Badge>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>评分时间线（{snapshots.length}）</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!snapshots.length ? (
                <EmptyState title="暂无快照" description="每次扫描 / 重算都会落一条快照记录" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>快照时间</TableHead>
                      <TableHead>综合分</TableHead>
                      <TableHead>速度</TableHead>
                      <TableHead>来源数</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshots.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-[11px] text-zinc-500">{fmtDate(s.snapshotDate)}</TableCell>
                        <TableCell className="tabular font-medium">{num(s.currentScore)}</TableCell>
                        <TableCell><Velocity value={Number(s.velocityScore ?? 0)} /></TableCell>
                        <TableCell className="tabular">{s.sourceCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
