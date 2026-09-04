import { getDashboardStats, listTopics } from "@/lib/repo";
import { Card, CardContent } from "@/components/ui/card";
import { PriorityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_STATUS_TONES,
  RUN_STATUS_LABELS,
  RUN_STATUS_TONES,
  TOPIC_STATUS_LABELS,
  TOPIC_STATUS_TONES,
  WORKFLOW_TYPE_LABELS,
} from "@/lib/labels";
import { StatusBadge } from "@/components/shared/status-badge";
import { previousCompleteWeek } from "@/lib/utils";
import { format } from "date-fns";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const week = previousCompleteWeek();
  const [stats, topTopics] = await Promise.all([getDashboardStats(), listTopics()]);

  const countBy = (arr: { status?: string; count: number }[], key: string) =>
    arr.find((r) => r.status === key)?.count ?? 0;

  const p0 = countBy(stats.topicsByPriority, "P0");
  const p1 = countBy(stats.topicsByPriority, "P1");
  const inReview = countBy(stats.topicsByStatus, "review") + countBy(stats.topicsByStatus, "needs_revision");
  const readyToPublish = countBy(stats.topicsByStatus, "ready_to_publish");
  const published = countBy(stats.topicsByStatus, "published");

  const latestByType: Record<string, { status: string; batchId: string | null; createdAt: Date }> = {};
  for (const r of stats.latestRuns) {
    if (!latestByType[r.type]) latestByType[r.type] = { status: r.status, batchId: r.batchId, createdAt: r.createdAt };
  }

  const workflowCards = [
    { key: "ai_weekly", label: "AI 周报", batch: `本周批次：${week.weekKey}-AI-WEEKLY` },
    { key: "github_weekly", label: "GitHub 周榜", batch: `本周批次：${week.weekKey}-GITHUB` },
    { key: "evergreen", label: "常青知识", batch: "按知识库节奏" },
    { key: "wechat_deep_dive", label: "公众号深度专题", batch: "按专题排期" },
  ];

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">运营总览</h1>
          <p className="text-xs text-zinc-500">
            统计窗口：上一完整自然周 {format(week.start, "MM-dd")} ~ {format(week.end, "MM-dd")}（{week.weekKey}）
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/workflows"><Button variant="outline">生成本周内容计划</Button></Link>
          <Link href="/workflows"><Button>确认并开始生产</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <StatCard label="P0 Topic" value={p0} tone="red" />
        <StatCard label="P1 Topic" value={p1} tone="orange" />
        <StatCard label="待审核内容" value={inReview} />
        <StatCard label="待发布内容" value={readyToPublish} />
        <StatCard label="已发布内容" value={published} tone="green" />
        <StatCard label="趋势雷达候选" value={stats.radarCount} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {workflowCards.map((w) => {
          const run = latestByType[w.key];
          return (
            <Card key={w.key}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-medium">{w.label}</div>
                  <StatusBadge
                    label={run ? RUN_STATUS_LABELS[run.status] ?? run.status : "未运行"}
                    tone={run ? RUN_STATUS_TONES[run.status] : "default"}
                  />
                </div>
                <p className="mt-1 text-[10px] text-zinc-400">{w.batch}</p>
                {run && (
                  <p className="mt-0.5 text-[10px] text-zinc-400">
                    {run.batchId ?? "—"} · {format(run.createdAt, "MM-dd HH:mm")}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="本周 Leads" value={stats.leadMetrics.salesLeads} />
        <StatCard label="Demo 数" value={stats.leadMetrics.demoRequests} />
        <StatCard label="Consultation 数" value={stats.leadMetrics.consultations} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b border-zinc-100 px-3 py-2 text-xs font-semibold">高优先级 Topic</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic</TableHead>
                <TableHead>优先级</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>类型</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topTopics.slice(0, 8).map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/topics/${t.id}`} className="font-medium hover:text-blue-600">{t.title}</Link>
                    <div className="text-[10px] text-zinc-400">{t.topicId}</div>
                  </TableCell>
                  <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell><StatusBadge label={TOPIC_STATUS_LABELS[t.status]} tone={TOPIC_STATUS_TONES[t.status]} /></TableCell>
                  <TableCell className="text-xs text-zinc-500">{t.topicType}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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
