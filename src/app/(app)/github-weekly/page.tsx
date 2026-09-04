import Link from "next/link";
import { listGithubSnapshots, getGithubSnapshot, getGithubItems } from "@/lib/repo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { fmtNum } from "@/lib/format";
import { SELECTION_BASIS_LABELS, VERIFICATION_LABELS, VERIFICATION_TONES } from "@/lib/labels";
import type { GithubSnapshot } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function GithubWeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ snap?: string }>;
}) {
  const { snap } = await searchParams;
  const snapshots = await listGithubSnapshots();
  const active = snapshots.find((s) => s.id === snap) ?? snapshots[0] ?? null;

  let items: Awaited<ReturnType<typeof getGithubItems>> = [];
  if (active) items = await getGithubItems(active.id);

  const selected = items.filter((i) => i.selected).length;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">GitHub 周榜快照</h1>
        <p className="text-xs text-zinc-500">
          每周抓取的星标增长榜快照，建立后不可被未来数据覆盖（Original / Replay 双轨）。选取候选 → 人工核验 → 提升为 Topic。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {snapshots.map((s) => (
          <Link
            key={s.id}
            href={`/github-weekly?snap=${s.id}`}
            className={`rounded-md border px-3 py-1 text-xs ${
              active?.id === s.id ? "border-blue-600 bg-blue-50 font-medium text-blue-700" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
            }`}
          >
            {s.week}
            <span className="ml-1 text-[9px] uppercase text-zinc-400">{s.snapshotType}</span>
          </Link>
        ))}
      </div>

      {!active ? (
        <Card><CardContent className="p-6 text-center text-xs text-zinc-400">暂无快照。运行 github_weekly 工作流抓取。</CardContent></Card>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>快照 {active.snapshotId}</span>
            <Badge variant="outline">{SELECTION_BASIS_LABELS[active.selectionBasis]}</Badge>
            <span>捕获 {active.captureTime?.toLocaleString("zh-CN")}</span>
            <span className="tabular">共 {items.length} 项 · 已选 {selected}</span>
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-[10px] uppercase tracking-wide text-zinc-400">
                    <th className="px-4 py-2">#</th>
                    <th className="px-2 py-2">仓库</th>
                    <th className="px-2 py-2">周增长</th>
                    <th className="px-2 py-2">总星</th>
                    <th className="px-2 py-2">核验</th>
                    <th className="px-2 py-2">选取</th>
                    <th className="px-4 py-2">淘汰原因</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className={`border-b border-zinc-50 ${i.selected ? "bg-blue-50/40" : "hover:bg-zinc-50"}`}>
                      <td className="px-4 py-2 tabular text-zinc-400">{i.rank}</td>
                      <td className="max-w-[260px] px-2 py-2">
                        {i.repoUrl ? (
                          <a href={i.repoUrl} target="_blank" rel="noreferrer" className="font-medium text-zinc-800 hover:text-blue-600">
                            {i.repository}
                          </a>
                        ) : <span className="font-medium text-zinc-800">{i.repository}</span>}
                        {i.projectName && <div className="truncate text-[10px] text-zinc-400">{i.projectName}</div>}
                      </td>
                      <td className="px-2 py-2 tabular text-emerald-600">{i.weeklyGrowth ?? "—"}</td>
                      <td className="px-2 py-2 tabular">{i.totalStars != null ? fmtNum(i.totalStars) : "—"}</td>
                      <td className="px-2 py-2"><StatusBadge label={VERIFICATION_LABELS[i.verificationStatus]} tone={VERIFICATION_TONES[i.verificationStatus]} /></td>
                      <td className="px-2 py-2">{i.selected ? <Badge variant="green">已选</Badge> : <Badge variant="outline">—</Badge>}</td>
                      <td className="max-w-[200px] truncate px-4 py-2 text-zinc-400">{i.eliminationReason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
