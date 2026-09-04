import Link from "next/link";
import { trendRepository } from "@/lib/repositories";
import { trendRadarService } from "@/lib/services/trend-radar";
import { createTopicFromTrendAction, runTrendRadarAction } from "@/app/actions/v3";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/* ===== 状态/覆盖/来源类型 → 中文 + 色调（局部常量，数据字典见 lib/labels） ===== */
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

const num = (v: string | number | null | undefined, digits = 1) => Number(v ?? 0).toFixed(digits);

/** 速度分：正绿 / 负红 / 零灰 */
function Velocity({ value }: { value: number }) {
  if (value > 0) return <span className="tabular font-medium text-emerald-600">+{value.toFixed(1)}</span>;
  if (value < 0) return <span className="tabular font-medium text-red-600">{value.toFixed(1)}</span>;
  return <span className="tabular text-zinc-400">0.0</span>;
}

/**
 * 趋势雷达（V3 §10-§16）：
 * 全部真实 DB 读（trendRepository / trendRadarService），禁止 mock。
 * 顶部 = 扫描入口 + 建议生产；下方 = 全量趋势列表（含来源类型统计）。
 */
export default async function TrendRadarPage() {
  const [rows, suggested] = await Promise.all([
    trendRepository.listTrendsWithStats(),
    trendRadarService.suggestedTopics(5),
  ]);

  return (
    <div className="space-y-4 p-4">
      {/* 顶部：标题 + 扫描入口 + 建议 Topic 数 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">趋势雷达</h1>
          <p className="text-xs text-zinc-500">
            聚合多来源信号（AI 周报 / GitHub 周榜 / 知识库 / 内容表现 / 社交数据）的趋势评分与覆盖追踪
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            建议 Topic <span className="tabular font-semibold text-blue-700">{suggested.length}</span>
          </span>
          <form action={runTrendRadarAction}>
            <Button>扫描趋势雷达</Button>
          </form>
        </div>
      </div>

      {/* 建议生产：趋势名 + 已有 Topic 数 + 分数 + 创建 Topic */}
      <Card>
        <CardHeader>
          <CardTitle>建议生产</CardTitle>
        </CardHeader>
        <CardContent>
          {!suggested.length ? (
            <EmptyState title="暂无建议生产" description="点击「扫描趋势雷达」聚合真实来源信号后生成建议" />
          ) : (
            <div className="space-y-1.5">
              {suggested.map((s) => (
                <div key={s.trendId} className="flex items-center gap-3 rounded-md border border-zinc-100 bg-white px-3 py-2">
                  <Link
                    href={`/trend-radar/${s.trendKey}`}
                    className="min-w-0 truncate text-[13px] font-medium hover:text-blue-600"
                  >
                    {s.title}
                  </Link>
                  <span className="whitespace-nowrap text-[11px] text-zinc-400">已有 Topic {s.existingTopicIds.length} 个</span>
                  <span className="tabular text-[13px] font-semibold text-blue-700">{s.score.toFixed(1)}</span>
                  <form action={createTopicFromTrendAction.bind(null, s.trendId)} className="ml-auto">
                    <Button variant="outline" size="sm">创建 Topic</Button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 全部趋势 */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-zinc-100 px-3 py-2 text-xs font-semibold">全部趋势（{rows.length}）</div>
          {!rows.length ? (
            <EmptyState title="暂无趋势数据" description="点击「扫描趋势雷达」聚合来源信号后生成趋势" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>趋势</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>综合分</TableHead>
                  <TableHead>速度</TableHead>
                  <TableHead>来源多样性</TableHead>
                  <TableHead>覆盖</TableHead>
                  <TableHead>来源类型</TableHead>
                  <TableHead>最后出现</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ trend, sourceStats }) => (
                  <TableRow key={trend.id}>
                    <TableCell>
                      <Link href={`/trend-radar/${trend.trendKey}`} className="font-medium hover:text-blue-600">
                        {trend.title}
                      </Link>
                      <div className="text-[10px] text-zinc-400">{trend.trendKey}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={TREND_STATUS_LABELS[trend.status] ?? trend.status}
                        tone={TREND_STATUS_TONES[trend.status]}
                      />
                    </TableCell>
                    <TableCell className="tabular text-[13px] font-semibold">{num(trend.currentScore)}</TableCell>
                    <TableCell><Velocity value={Number(trend.velocityScore ?? 0)} /></TableCell>
                    <TableCell className="tabular">{num(trend.sourceDiversity)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        label={COVERAGE_LABELS[trend.coverageStatus] ?? trend.coverageStatus}
                        tone={COVERAGE_TONES[trend.coverageStatus]}
                      />
                    </TableCell>
                    <TableCell className="text-[11px] text-zinc-500">
                      {sourceStats.types.length ? sourceStats.types.map((t) => SOURCE_TYPE_LABELS[t] ?? t).join(" / ") : "—"}
                    </TableCell>
                    <TableCell className="text-[11px] text-zinc-400">{fmtDate(trend.lastSeenAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
