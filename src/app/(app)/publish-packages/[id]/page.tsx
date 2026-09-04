import Link from "next/link";
import { notFound } from "next/navigation";
import { publishPackageRepository } from "@/lib/repositories";
import { snapshotWeekOf } from "@/lib/services/publish-package";
import {
  setPackageQaAction,
  transitionPackageAction,
  attachVisualAction,
  removeVisualAction,
  updatePackageNotesAction,
} from "@/app/actions/publish-package";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const PKG_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  needs_assets: "缺视觉资产",
  needs_review: "待 QA 审核",
  ready: "可发布",
  published: "已发布",
};
const QA_LABELS: Record<string, string> = { pending: "待确认", passed: "通过", failed: "不通过" };

/** 发布包详情（V4 规格 §13-§17）：正文/QA 门禁/视觉资产/状态推进/发布说明 */
export default async function PublishPackageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pkg = await publishPackageRepository.getById(id);
  if (!pkg) notFound();

  const visualIds = (pkg.visualAssetIds as string[]) ?? [];
  const [visuals, allAssets, week] = await Promise.all([
    Promise.all(visualIds.map((vid) => publishPackageRepository.getBrandAsset(vid))),
    publishPackageRepository.listBrandAssets(100),
    pkg.githubSnapshotId ? snapshotWeekOf(pkg.githubSnapshotId) : Promise.resolve(null),
  ]);
  const attachedIds = new Set(visualIds);
  const availableAssets = allAssets.filter((a) => a.active && !attachedIds.has(a.id));
  const qaAllPassed = pkg.factQaStatus === "passed" && pkg.brandQaStatus === "passed" && pkg.contentQaStatus === "passed";

  const hashtags = (pkg.hashtags as string[]) ?? [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">{pkg.title ?? "（无标题）"}</h1>
            <StatusBadge label={PKG_STATUS_LABELS[pkg.status] ?? pkg.status} tone={pkg.status === "ready" || pkg.status === "published" ? "green" : pkg.status === "needs_review" ? "blue" : "orange"} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {pkg.packageType === "github_weekly" ? "GitHub 周榜包" : pkg.packageType}
            {pkg.githubSnapshotId && ` · Snapshot 绑定 ${pkg.githubSnapshotId.slice(0, 8)}（Period ${week ?? "?"}）`}
            {pkg.publishedAt && ` · 发布于 ${fmtDate(pkg.publishedAt)}`}
          </p>
        </div>
        <Link href="/publish-packages"><Button variant="outline" size="sm">← 包列表</Button></Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 正文（总榜文案 + 项目文案 + 提纲 + 图片顺序） */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>正文（可直接复制发布）</CardTitle></CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap rounded-md border border-zinc-100 bg-zinc-50/50 p-4 text-sm leading-relaxed text-zinc-700">
                {pkg.body ?? "（无正文）"}
              </div>
              {pkg.primaryCta && (
                <div className="mt-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
                  CTA：{pkg.primaryCta}
                </div>
              )}
              {hashtags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {hashtags.map((h) => (
                    <Badge key={h} variant="outline">#{h}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 视觉资产（1 Cover + 5 Cards 顺序即发布顺序） */}
          <Card>
            <CardHeader>
              <CardTitle>
                视觉资产（顺序即发布顺序）
                <span className="ml-2 text-[11px] font-normal text-zinc-400">{visuals.filter(Boolean).length} 个已挂载</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
                {visuals.map((v, idx) =>
                  v ? (
                    <div key={v.id} className="space-y-1 rounded-md border border-zinc-200 p-1.5">
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={v.fileUrl ?? ""} alt={v.name} className="aspect-square w-full rounded object-cover" />
                        <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] text-white">#{idx + 1}</span>
                        {v.locked && <span className="absolute right-1 top-1 rounded bg-amber-500 px-1 text-[9px] text-white">锁定</span>}
                      </div>
                      <div className="truncate text-[10px] text-zinc-500" title={v.name}>{v.name}</div>
                      <form action={removeVisualAction.bind(null, pkg.id, v.id)}>
                        <Button size="sm" variant="ghost" className="h-5 w-full px-0 text-[10px] text-red-500">移除</Button>
                      </form>
                    </div>
                  ) : null,
                )}
              </div>
              {availableAssets.length > 0 && (
                <div className="border-t border-zinc-100 pt-2">
                  <div className="mb-1.5 text-[11px] font-medium text-zinc-600">从品牌资产库挂载（<Link href="/publish-packages/assets" className="text-blue-600 hover:underline">上传管理 →</Link>）</div>
                  <div className="flex flex-wrap gap-1.5">
                    {availableAssets.map((a) => (
                      <form key={a.id} action={attachVisualAction.bind(null, pkg.id, a.id)}>
                        <Button size="sm" variant="outline" type="submit" className="h-7 text-[11px]">+ {a.name}</Button>
                      </form>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右栏：状态推进 + QA + 发布说明 */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>状态推进（QA 门禁）</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {pkg.status !== "published" && (
                  <form action={transitionPackageAction.bind(null, pkg.id, "needs_review")}>
                    <Button size="sm" variant="outline" type="submit">提交 QA 审核</Button>
                  </form>
                )}
                {pkg.status !== "published" && (
                  <form action={transitionPackageAction.bind(null, pkg.id, "ready")}>
                    <Button size="sm" type="submit" disabled={!qaAllPassed}>标记可发布</Button>
                  </form>
                )}
                {pkg.status === "ready" && (
                  <form action={transitionPackageAction.bind(null, pkg.id, "published")}>
                    <Button size="sm" type="submit">确认已发布</Button>
                  </form>
                )}
              </div>
              {!qaAllPassed && pkg.status !== "published" && (
                <p className="text-[10px] text-amber-600">三项 QA 全部通过后才能标记可发布。</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>QA 三项</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {([["fact", "事实 QA（数字与快照一致）"], ["brand", "品牌 QA（Logo/规范）"], ["content", "内容 QA（标题/CTA/违禁词）"]] as const).map(([kind, label]) => {
                const status = kind === "fact" ? pkg.factQaStatus : kind === "brand" ? pkg.brandQaStatus : pkg.contentQaStatus;
                return (
                  <div key={kind} className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 px-2 py-1.5">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-zinc-700">{label}</div>
                      <div className={`text-[10px] ${status === "passed" ? "text-emerald-600" : status === "failed" ? "text-red-500" : "text-zinc-400"}`}>{QA_LABELS[status] ?? status}</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <form action={setPackageQaAction.bind(null, pkg.id, kind, true)}>
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" type="submit">通过</Button>
                      </form>
                      <form action={setPackageQaAction.bind(null, pkg.id, kind, false)}>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-red-500" type="submit">不通过</Button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>发布说明</CardTitle></CardHeader>
            <CardContent>
              <form action={updatePackageNotesAction.bind(null, pkg.id)} className="space-y-2">
                <textarea
                  name="publishNotes"
                  defaultValue={pkg.publishNotes ?? ""}
                  rows={5}
                  className="w-full rounded-md border border-zinc-200 p-2 text-xs text-zinc-700 focus:border-blue-400 focus:outline-none"
                />
                <Button size="sm" variant="outline" type="submit">保存说明</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
