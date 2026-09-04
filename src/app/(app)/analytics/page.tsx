import Link from "next/link";
import { listAllMetrics } from "@/lib/repo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

type Agg = {
  topicId: string;
  topicTitle: string;
  views: number;
  reads: number;
  ctaClicks: number;
  demoRequests: number;
  consultations: number;
  salesLeads: number;
};

export default async function AnalyticsPage() {
  const rows = await listAllMetrics();

  const byTopic = new Map<string, Agg>();
  let totals = { views: 0, reads: 0, ctaClicks: 0, demoRequests: 0, consultations: 0, salesLeads: 0 };

  for (const { m, topic } of rows) {
    const a = byTopic.get(topic.id) ?? {
      topicId: topic.id,
      topicTitle: topic.title,
      views: 0, reads: 0, ctaClicks: 0, demoRequests: 0, consultations: 0, salesLeads: 0,
    };
    a.views += Number(m.views) || 0;
    a.reads += Number(m.reads) || 0;
    a.ctaClicks += m.ctaClicks || 0;
    a.demoRequests += m.demoRequests || 0;
    a.consultations += m.consultations || 0;
    a.salesLeads += m.salesLeads || 0;
    byTopic.set(topic.id, a);
  }
  for (const a of byTopic.values()) {
    totals.views += a.views; totals.reads += a.reads; totals.ctaClicks += a.ctaClicks;
    totals.demoRequests += a.demoRequests; totals.consultations += a.consultations; totals.salesLeads += a.salesLeads;
  }
  const list = [...byTopic.values()].sort((a, b) => b.salesLeads - a.salesLeads);
  const maxLeads = Math.max(...list.map((l) => l.salesLeads), 1);
  const funnel = [
    { label: "阅读", value: totals.reads },
    { label: "CTA 点击", value: totals.ctaClicks },
    { label: "Demo 预约", value: totals.demoRequests },
    { label: "咨询", value: totals.consultations },
    { label: "销售线索", value: totals.salesLeads },
  ];
  const maxFunnel = Math.max(...funnel.map((f) => f.value), 1);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">数据分析</h1>
        <p className="text-xs text-zinc-500">
          所有指标必须绑定 Topic_ID（需求十三）：先看 Topic 表现，再拆内容与平台。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        {[
          { label: "总阅读", value: totals.reads },
          { label: "总曝光", value: totals.views },
          { label: "CTA 点击", value: totals.ctaClicks },
          { label: "Demo 预约", value: totals.demoRequests },
          { label: "咨询", value: totals.consultations },
          { label: "销售线索", value: totals.salesLeads },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-zinc-400">{s.label}</div>
              <div className="tabular mt-1 text-xl font-semibold">{fmtNum(s.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>转化漏斗</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {funnel.map((f) => (
              <div key={f.label}>
                <div className="mb-0.5 flex justify-between text-[11px] text-zinc-500">
                  <span>{f.label}</span>
                  <span className="tabular font-medium">{fmtNum(f.value)}</span>
                </div>
                <div className="h-3 rounded-sm bg-zinc-100">
                  <div
                    className="h-full rounded-sm bg-blue-600"
                    style={{ width: `${Math.max((f.value / maxFunnel) * 100, f.value > 0 ? 2 : 0)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Topics（按销售线索）</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {list.length === 0 && <p className="text-xs text-zinc-400">暂无回填指标。</p>}
            {list.map((t) => (
              <div key={t.topicId}>
                <div className="mb-0.5 flex justify-between text-[11px]">
                  <Link href={`/topics/${t.topicId}`} className="max-w-[70%] truncate text-zinc-700 hover:text-blue-600">{t.topicTitle}</Link>
                  <span className="tabular text-zinc-500">{fmtNum(t.salesLeads)} leads</span>
                </div>
                <div className="h-2 rounded-sm bg-zinc-100">
                  <div className="h-full rounded-sm bg-emerald-500" style={{ width: `${(t.salesLeads / maxLeads) * 100}%` }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>逐 Topic 指标明细</CardTitle></CardHeader>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">暂无数据。</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-2">Topic</th>
                  <th className="px-2 py-2">阅读</th>
                  <th className="px-2 py-2">CTA</th>
                  <th className="px-2 py-2">Demo</th>
                  <th className="px-2 py-2">咨询</th>
                  <th className="px-4 py-2">Leads</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.topicId} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="max-w-[260px] truncate px-4 py-2">
                      <Link href={`/topics/${t.topicId}`} className="font-medium text-zinc-800 hover:text-blue-600">{t.topicTitle}</Link>
                    </td>
                    <td className="px-2 py-2 tabular">{fmtNum(t.reads)}</td>
                    <td className="px-2 py-2 tabular">{fmtNum(t.ctaClicks)}</td>
                    <td className="px-2 py-2 tabular">{fmtNum(t.demoRequests)}</td>
                    <td className="px-2 py-2 tabular">{fmtNum(t.consultations)}</td>
                    <td className="px-4 py-2 tabular font-medium text-emerald-600">{fmtNum(t.salesLeads)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
