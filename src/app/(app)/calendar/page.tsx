import Link from "next/link";
import { publicationRepository } from "@/lib/repositories";
import { Card } from "@/components/ui/card";
import { Badge, PriorityBadge } from "@/components/ui/badge";
import { PLATFORM_LABELS, PUBLICATION_STATUS_LABELS, PUBLICATION_STATUS_TONES } from "@/lib/labels";
import { StatusBadge } from "@/components/shared/status-badge";

export const dynamic = "force-dynamic";

/**
 * 内容日历（规格 §75）：按日期网格展示发布计划。
 */
export default async function CalendarPage() {
  const rows = await publicationRepository.list();

  // 按日期分组
  const byDate = new Map<string, typeof rows>();
  for (const { pub, topic } of rows) {
    const key = pub.scheduledDate ?? pub.publishedDate?.toISOString().slice(0, 10) ?? "未排期";
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push({ pub, topic });
  }

  // 未来 14 天网格
  const days: { date: string; label: string }[] = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push({
      date: d.toISOString().slice(0, 10),
      label: `${d.getMonth() + 1}/${d.getDate()}${i === 0 ? "（今天）" : ""}`,
    });
  }

  const done = rows.filter(({ pub }) => pub.status === "published").length;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">内容日历</h1>
        <p className="text-xs text-zinc-500">
          未来 14 天发布计划：已发布 {done} 条 / 共 {rows.length} 条。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
        {days.map(({ date, label }) => {
          const items = byDate.get(date) ?? [];
          return (
            <Card key={date} className="min-h-28 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-zinc-500">{label}</span>
                {items.length > 0 && <Badge variant="blue">{items.length}</Badge>}
              </div>
              <div className="space-y-1">
                {items.map(({ pub, topic }) => (
                  <div key={pub.id} className="rounded border border-zinc-100 bg-zinc-50 p-1.5">
                    <Link href={`/topics/${topic.id}`} className="block max-w-full truncate text-[11px] font-medium text-zinc-700 hover:text-blue-600">
                      {topic.title}
                    </Link>
                    <div className="mt-1 flex items-center gap-1">
                      <Badge variant="outline" className="text-[9px]">{PLATFORM_LABELS[pub.platform]}</Badge>
                      <StatusBadge label={PUBLICATION_STATUS_LABELS[pub.status]} tone={PUBLICATION_STATUS_TONES[pub.status]} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold">全部发布计划</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400">
              <th className="px-2 py-2">Topic</th>
              <th className="px-2 py-2">平台</th>
              <th className="px-2 py-2">日期</th>
              <th className="px-2 py-2">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ pub, topic }) => (
              <tr key={pub.id} className="border-b border-zinc-50">
                <td className="max-w-[300px] truncate px-2 py-2 font-medium text-zinc-700">{topic.title}</td>
                <td className="px-2 py-2"><Badge variant="outline">{PLATFORM_LABELS[pub.platform]}</Badge></td>
                <td className="px-2 py-2 tabular text-zinc-500">{pub.scheduledDate ?? "未排期"}</td>
                <td className="px-2 py-2"><StatusBadge label={PUBLICATION_STATUS_LABELS[pub.status]} tone={PUBLICATION_STATUS_TONES[pub.status]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
