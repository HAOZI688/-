import Link from "next/link";
import { listPublications } from "@/lib/repo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { PLATFORM_LABELS, PUBLICATION_STATUS_LABELS, PUBLICATION_STATUS_TONES } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function PublicationsPage() {
  const rows = await listPublications();

  const byStatus: Record<string, number> = {};
  rows.forEach(({ pub }) => { byStatus[pub.status] = (byStatus[pub.status] ?? 0) + 1; });

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">发布交接（Publish Handoff）</h1>
        <p className="text-xs text-zinc-500">
          V1 不自动发布：本页做发布计划与登记，人工确认后标记「已发布」并回填 URL。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["planned", "ready", "published", "failed"] as const).map((s) => (
          <Card key={s}>
            <CardContent className="flex items-center justify-between p-3">
              <StatusBadge label={PUBLICATION_STATUS_LABELS[s]} tone={PUBLICATION_STATUS_TONES[s]} />
              <span className="tabular text-lg font-semibold">{byStatus[s] ?? 0}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-xs text-zinc-400">暂无发布计划。</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-2">Topic</th>
                  <th className="px-2 py-2">平台</th>
                  <th className="px-2 py-2">计划日期</th>
                  <th className="px-2 py-2">发布时间</th>
                  <th className="px-2 py-2">状态</th>
                  <th className="px-4 py-2">链接</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ pub, topic }) => (
                  <tr key={pub.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="max-w-[240px] truncate px-4 py-2">
                      <Link href={`/topics/${topic.id}`} className="font-medium text-zinc-800 hover:text-blue-600">{topic.title}</Link>
                    </td>
                    <td className="px-2 py-2"><Badge variant="outline">{PLATFORM_LABELS[pub.platform]}</Badge></td>
                    <td className="px-2 py-2 tabular text-zinc-600">{pub.scheduledDate ?? "—"}</td>
                    <td className="px-2 py-2 tabular text-zinc-600">{pub.publishedDate ? new Date(pub.publishedDate).toLocaleDateString("zh-CN") : "—"}</td>
                    <td className="px-2 py-2"><StatusBadge label={PUBLICATION_STATUS_LABELS[pub.status]} tone={PUBLICATION_STATUS_TONES[pub.status]} /></td>
                    <td className="max-w-[200px] truncate px-4 py-2">
                      {pub.publishedUrl ? (
                        <a href={pub.publishedUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{pub.publishedUrl}</a>
                      ) : <span className="text-zinc-400">—</span>}
                    </td>
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
