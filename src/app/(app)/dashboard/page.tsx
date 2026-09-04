import { getDashboardStats, listTopics } from "@/lib/repo";
import { orchestratorRepository, contentRepository, publicationRepository } from "@/lib/repositories";
import { isAiConfigured } from "@/lib/ai/providers";
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
import { isoWeekKey, previousCompleteWeek } from "@/lib/utils";
import { format } from "date-fns";
import Link from "next/link";
import { generatePlanAction } from "@/app/actions/planning";
import { confirmPlanAction, startProductionAction } from "@/app/actions/review";

export const dynamic = "force-dynamic";

const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: "已生成 · 待确认",
  confirmed: "已确认 · 待生产",
  production: "生产中",
  completed: "已完成",
  cancelled: "已取消",
};

/**
 * Dashboard（V2 周一视图）：
 * 顶部 = V2 运营流：上一自然周扫描状态 → [生成本周内容计划] → P0/P1 选题列表 → [确认并开始生产]
 * 下方保留 V1 统计卡。全部真实落库。
 */
export default async function DashboardPage() {
  const week = previousCompleteWeek();
  const thisWeek = isoWeekKey(new Date());
  const [stats, topTopics, plans, assets, pubs] = await Promise.all([
    getDashboardStats(),
    listTopics(),
    orchestratorRepository.listPlans(4),
    contentRepository.listAllAssets(200),
    publicationRepository.list(),
  ]);

  const lastWeekPlan = plans.find((p) => p.weekPrefix === week.weekKey) ?? null;
  const thisWeekPlan = plans.find((p) => p.weekPrefix === thisWeek) ?? null;
  const thisItems = thisWeekPlan ? await orchestratorRepository.getPlanItems(thisWeekPlan.id) : [];
  const pendingItems = thisItems.filter((i) => i.status === "pending");
  const lastWeekRuns = stats.latestRuns.filter((r) => r.batchId?.startsWith(week.weekKey));
  const aiReady = isAiConfigured();

  const countBy = (arr: { status?: string; count: number }[], key: string) =>
    arr.find((r) => r.status === key)?.count ?? 0;

  const p0 = countBy(stats.topicsByPriority, "P0");
  const p1 = countBy(stats.topicsByPriority, "P1");
  const inReview = countBy(stats.topicsByStatus, "review") + countBy(stats.topicsByStatus, "needs_revision");
  const readyToPublish = countBy(stats.topicsByStatus, "ready_to_publish");
  const published = countBy(stats.topicsByStatus, "published");

  const inReviewAssets = assets.filter((a) => a.asset.status === "in_review").length;
  const confirmPubs = pubs.filter((p) => p.pub.status === "planned" || p.pub.status === "ready").length;
  const totalReview = pendingItems.length + inReviewAssets + confirmPubs;

  const latestByType: Record<string, { status: string; batchId: string | null; createdAt: Date }> = {};
  for (const r of stats.latestRuns) {
    if (!latestByType[r.type]) latestByType[r.type] = { status: r.status, batchId: r.batchId, createdAt: r.createdAt };
  }

  const workflowCards = [
    { key: "ai_weekly", label: "AI 周报", batch: `本周批次：${thisWeek}-AI-WEEKLY` },
    { key: "github_weekly", label: "GitHub 周榜", batch: `本周批次：${thisWeek}-GITHUB` },
    { key: "evergreen", label: "常青知识", batch: "按知识库节奏" },
    { key: "wechat_deep_dive", label: "公众号深度专题", batch: "按专题排期" },
  ];

  return (
    <div className="space-y-4 p-4">
      {/* V2 运营流 */}
      <Card className="border-blue-100 bg-blue-50/40">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
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
            <div className="flex items-center gap-2">
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
              <Link href="/review">
                <Button variant="outline">
                  待审核 {totalReview > 0 ? `(${totalReview})` : ""}
                </Button>
              </Link>
              <Link href="/planning"><Button variant="outline">计划详情</Button></Link>
            </div>
          </div>

          {/* 上周扫描状态 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniCard label="上周扫描" value={lastWeekPlan ? `已完成 · ${lastWeekPlan.status}` : "未执行"} sub={lastWeekPlan ? `${lastWeekPlan.weekPrefix}` : week.weekKey} />
            <MiniCard label="上周工作流运行" value={String(lastWeekRuns.length)} sub="runs（批次含上周前缀）" />
            <MiniCard label="本周计划" value={thisWeekPlan ? PLAN_STATUS_LABELS[thisWeekPlan.status] ?? thisWeekPlan.status : "未生成"} sub={thisWeekPlan ? `${thisItems.length} 项` : "点上方按钮生成"} />
            <MiniCard label="待人工审核" value={String(totalReview)} sub={`选题 ${pendingItems.length} · 内容 ${inReviewAssets} · 发布 ${confirmPubs}`} />
          </div>

          {/* 本周选题简表（P0/P1 优先） */}
          {thisItems.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-zinc-600">
                本周选题（{thisItems.length} 项 · 待确认 {pendingItems.length}）
              </div>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {[...thisItems]
                  .sort((a, b) => (a.priority === "P0" ? -1 : b.priority === "P0" ? 1 : Number(b.topicScore) - Number(a.topicScore)))
                  .slice(0, 6)
                  .map((item) => (
                    <li key={item.id} className="flex items-center gap-2 rounded-md border border-zinc-100 bg-white px-2.5 py-1.5">
                      <Link href={`/topics/${item.topicId}`} className="min-w-0 truncate text-xs font-medium hover:text-blue-600">
                        {item.topicId}
                      </Link>
                      <StatusBadge label={WORKFLOW_TYPE_LABELS[item.workflowType]} tone="blue" />
                      <PriorityBadge priority={item.priority as never} />
                      <span className="ml-auto text-[10px] text-zinc-400">{item.topicScore}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* V1 统计 */}
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
