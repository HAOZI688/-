import Link from "next/link";
import { topicPerformanceService } from "@/lib/services";
import { topicRepository } from "@/lib/repositories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, PriorityBadge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Topic 表现分析（规格 §74）：T+ 快照 → 评分 → 推荐 → 下一轮反馈。
 */
export default async function TopicAnalyticsPage() {
  const period = topicPerformanceService.currentPeriod();
  const rows = await topicPerformanceService.listAll(period);
  const feedback = await topicPerformanceService.feedbackForNextRound(period);
  const topics = await topicRepository.list();
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  const recTone: Record<string, "green" | "blue" | "orange" | "default"> = {
    加大投入: "green",
    继续: "blue",
    调整角度: "orange",
    暂缓: "default",
  };

  const scoreBar = (v: number | string | null) => {
    const n = Number(v ?? 0);
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, n * 10)}%` }} />
        </div>
        <span className="tabular text-[10px] text-zinc-500">{n.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">Topic 表现分析</h1>
        <p className="text-xs text-zinc-500">
          周期 {period}：数据回流 → 评分 → 推荐动作 → 下一轮 Orchestrator 反馈闭环（规格 §45）。
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>本期 Topic 评分</CardTitle></CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <p className="p-6 text-center text-xs text-zinc-400">
                暂无 {period} 期表现数据。导入小豆芽数据并运行表现聚合后展示。
              </p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400">
                    <th className="px-4 py-2">Topic</th>
                    <th className="px-2 py-2">流量</th>
                    <th className="px-2 py-2">互动</th>
                    <th className="px-2 py-2">线索</th>
                    <th className="px-2 py-2">转化</th>
                    <th className="px-2 py-2">总分</th>
                    <th className="px-4 py-2">推荐</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                      <td className="max-w-[200px] truncate px-4 py-2">
                        <Link href={`/topics/${r.topicId}`} className="font-medium text-zinc-800 hover:text-blue-600">
                          {r.topic?.title ?? r.topicId.slice(0, 8)}
                        </Link>
                        <span className="ml-1.5 text-[10px] text-zinc-400">{r.period}</span>
                      </td>
                      <td className="px-2 py-2">{scoreBar(r.trafficScore)}</td>
                      <td className="px-2 py-2">{scoreBar(r.engagementScore)}</td>
                      <td className="px-2 py-2">{scoreBar(r.leadScore)}</td>
                      <td className="px-2 py-2">{scoreBar(r.conversionScore)}</td>
                      <td className="px-2 py-2 text-sm font-semibold tabular">{r.performanceScore}</td>
                      <td className="px-4 py-2"><Badge variant={recTone[r.recommendation ?? "default"] ?? "default"}>{r.recommendation}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-emerald-600" />高分延伸建议</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {feedback.topPerformers.length === 0 && <p className="text-xs text-zinc-400">暂无上一期数据。</p>}
              {feedback.topPerformers.map((r) => {
                const t = topicMap.get(r.topicId);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded border border-zinc-100 p-2">
                    <span className="max-w-[160px] truncate text-xs font-medium text-zinc-700">{t?.title ?? r.topicId.slice(0, 8)}</span>
                    <span className="text-sm font-semibold tabular text-emerald-600">{r.performanceScore}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5 text-red-500" />低分调整建议</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {feedback.bottomPerformers.length === 0 && <p className="text-xs text-zinc-400">暂无上一期数据。</p>}
              {feedback.bottomPerformers.map((r) => {
                const t = topicMap.get(r.topicId);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded border border-zinc-100 p-2">
                    <span className="max-w-[160px] truncate text-xs font-medium text-zinc-700">{t?.title ?? r.topicId.slice(0, 8)}</span>
                    <span className="text-sm font-semibold tabular text-red-500">{r.performanceScore}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
