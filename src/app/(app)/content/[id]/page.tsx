import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetById, getTopicById, getRunsByTopic, listAllAssets, listVersions } from "@/lib/repo";
import { contentRepository } from "@/lib/repositories";
import { saveAssetEditAction } from "@/app/actions/content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import {
  ASSET_STATUS_LABELS,
  ASSET_STATUS_TONES,
  ASSET_TYPE_LABELS,
  CONTENT_ROLE_LABELS,
  PLATFORM_LABELS,
  RUN_STATUS_LABELS,
  RUN_STATUS_TONES,
  WORKFLOW_TYPE_LABELS,
} from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getAssetById(id);
  if (!asset) notFound();
  const [topic, runs, siblingAssets, versions] = await Promise.all([
    getTopicById(asset.topicId),
    getRunsByTopic(asset.topicId),
    listAllAssets().then((rows) => rows.filter((r) => r.asset.topicId === asset.topicId)),
    listVersions(id),
  ]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{asset.title}</h1>
            <StatusBadge label={ASSET_STATUS_LABELS[asset.status]} tone={ASSET_STATUS_TONES[asset.status]} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <Badge variant="blue">{ASSET_TYPE_LABELS[asset.assetType]}</Badge>
            {asset.platform && <Badge variant="outline">{PLATFORM_LABELS[asset.platform]}</Badge>}
            {asset.contentRole && <Badge variant="outline">{CONTENT_ROLE_LABELS[asset.contentRole]}</Badge>}
            <span>v{asset.version}</span>
            <span className="tabular">更新 {fmtDate(asset.updatedAt)}</span>
          </div>
        </div>
        <Link href={`/topics/${asset.topicId}`}><Button variant="outline" size="sm">所属 Topic</Button></Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>内容</CardTitle></CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap rounded-md border border-zinc-100 bg-zinc-50/50 p-4 text-sm leading-relaxed text-zinc-700">
                {asset.content ?? "（暂无内容）"}
              </div>
              {asset.cta && (
                <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
                  CTA：{asset.cta}
                </div>
              )}
              {/* V4：人工编辑（版本化存档；审核时计入「修改后通过」） */}
              <details className="mt-3 rounded-md border border-zinc-200">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-600">人工编辑（保存新版本）</summary>
                <form action={saveAssetEditAction.bind(null, asset.id)} className="space-y-2 p-3">
                  <textarea
                    name="content"
                    defaultValue={asset.content ?? ""}
                    rows={12}
                    className="w-full rounded-md border border-zinc-200 p-2 font-mono text-xs text-zinc-700 focus:border-blue-400 focus:outline-none"
                  />
                  <Button size="sm" type="submit">保存新版本（v{asset.version + 1}）</Button>
                </form>
              </details>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>同 Topic 资产</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {siblingAssets.map(({ asset: a }) => (
                <Link
                  key={a.id}
                  href={`/content/${a.id}`}
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs ${a.id === asset.id ? "bg-blue-50 font-medium text-blue-700" : "text-zinc-600 hover:bg-zinc-50"}`}
                >
                  <span className="max-w-[160px] truncate">{a.title}</span>
                  <span className="text-[10px] text-zinc-400">v{a.version}</span>
                </Link>
              ))}
              {siblingAssets.length === 0 && <p className="text-xs text-zinc-400">无</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>版本历史（规格 §26）</CardTitle></CardHeader>
            <CardContent>
              {versions.length ? (
                <div className="space-y-2">
                  {versions.map((v) => (
                    <div key={v.id} className="rounded-md border border-zinc-100 p-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold">v{v.version}</span>
                        <span className="tabular text-[10px] text-zinc-400">{fmtDate(v.createdAt)}</span>
                      </div>
                      {v.changeSummary && <div className="mt-0.5 text-[11px] text-zinc-500">{v.changeSummary}</div>}
                      {v.createdBy && <div className="mt-0.5 text-[10px] text-zinc-400">by {v.createdBy}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400">暂无版本记录</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>信息</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-zinc-500">创建</span><span className="tabular">{fmtDate(asset.createdAt)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">版本</span><span>v{asset.version}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">角色</span><span>{asset.contentRole ? CONTENT_ROLE_LABELS[asset.contentRole] : "—"}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>关联工作流</CardTitle></CardHeader>
            <CardContent>
              {runs.length ? (
                <div className="space-y-2">
                  {runs.slice(0, 3).map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs">
                      <span>{WORKFLOW_TYPE_LABELS[r.workflowType]}</span>
                      <StatusBadge label={RUN_STATUS_LABELS[r.status]} tone={RUN_STATUS_TONES[r.status]} />
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-zinc-400">暂无关联执行记录</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
