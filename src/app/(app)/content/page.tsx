import Link from "next/link";
import { listAllAssets } from "@/lib/repo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { fmtDate } from "@/lib/format";
import {
  ASSET_STATUS_LABELS,
  ASSET_STATUS_TONES,
  ASSET_TYPE_LABELS,
  CONTENT_ROLE_LABELS,
  PLATFORM_LABELS,
} from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic: topicFilter } = await searchParams;
  const rows = await listAllAssets();
  const filtered = topicFilter ? rows.filter((r) => r.topic.id === topicFilter) : rows;

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold">内容资产</h1>
        <p className="text-xs text-zinc-500">
          Content Asset 与 Topic 严格分离：一个 Topic 衍生多种平台资产，每份资产都有独立生命周期与版本。
        </p>
      </div>

      {topicFilter && (
        <div className="text-xs text-zinc-500">
          已按 Topic 过滤：{filtered[0]?.topic.title ?? "（该 Topic 暂无资产）"}
          <Link href="/content" className="ml-2 text-blue-600 hover:underline">清除过滤</Link>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map(({ asset, topic }) => (
          <Card key={asset.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/content/${asset.id}`} className="text-sm font-medium text-zinc-800 hover:text-blue-600">
                  {asset.title}
                </Link>
                <StatusBadge label={ASSET_STATUS_LABELS[asset.status]} tone={ASSET_STATUS_TONES[asset.status]} />
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="blue">{ASSET_TYPE_LABELS[asset.assetType]}</Badge>
                {asset.platform && <Badge variant="outline">{PLATFORM_LABELS[asset.platform]}</Badge>}
                {asset.contentRole && <Badge variant="outline">{CONTENT_ROLE_LABELS[asset.contentRole]}</Badge>}
                {asset.version > 1 && <Badge variant="outline">v{asset.version}</Badge>}
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <Link href={`/topics/${topic.id}`} className="hover:text-blue-600">↳ {topic.title}</Link>
                <span className="tabular">更新 {fmtDate(asset.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card><CardContent className="p-6 text-center text-xs text-zinc-400">暂无内容资产。</CardContent></Card>
      )}
    </div>
  );
}
