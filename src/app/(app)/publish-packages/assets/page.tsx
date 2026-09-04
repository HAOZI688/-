import Link from "next/link";
import { publishPackageRepository } from "@/lib/repositories";
import { uploadBrandAssetAction, toggleBrandAssetActiveAction, toggleBrandAssetLockAction } from "@/app/actions/publish-package";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  logo: "Logo（正式）",
  product_screenshot: "产品截图",
  template: "模板",
  background: "背景",
  icon: "图标",
  visual_reference: "视觉参考",
  cta_asset: "CTA 素材",
  cover: "封面",
  card: "项目卡片",
};

/**
 * Brand Asset Center（V4 规格 §18）：
 * 上传 / 预览 / 版本 / 启用停用 / 锁定 / 引用。
 * 约定：正式 Logo 仅允许人工上传并锁定；AI 生成图片禁止重绘正式 Logo。
 */
export default async function BrandAssetsPage() {
  const assets = await publishPackageRepository.listBrandAssets(100);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">品牌资产中心</h1>
          <p className="text-xs text-zinc-500">
            上传 / 预览 / 版本 / 启用停用 / 锁定 / 引用 · 正式 Logo 必须人工上传并锁定（禁止 AI 重绘，规格 §18）
          </p>
        </div>
        <Link href="/publish-packages"><Button variant="outline" size="sm">← 发布包</Button></Link>
      </div>

      {/* 上传 */}
      <Card>
        <CardContent className="p-3">
          <form action={uploadBrandAssetAction} className="grid gap-2 md:grid-cols-5 md:items-end">
            <label className="space-y-1 text-[11px] text-zinc-600 md:col-span-2">
              <span>文件（PNG/JPG/SVG）</span>
              <input type="file" name="file" accept="image/*" required className="block w-full text-xs text-zinc-600 file:mr-2 file:rounded file:border-0 file:bg-blue-50 file:px-2 file:py-1 file:text-xs file:text-blue-700" />
            </label>
            <label className="space-y-1 text-[11px] text-zinc-600">
              <span>名称</span>
              <input name="name" required placeholder="如：主 Logo / 封面-W36" className="w-full rounded border border-zinc-200 px-2 py-1 text-xs" />
            </label>
            <label className="space-y-1 text-[11px] text-zinc-600">
              <span>类型</span>
              <select name="type" className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs" defaultValue="cover">
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <Button size="sm" type="submit">上传</Button>
            <label className="space-y-1 text-[11px] text-zinc-600 md:col-span-5">
              <span>用途说明（可选）</span>
              <input name="usageNotes" placeholder="如：公众号封面 900x383，含标题安全区" className="w-full rounded border border-zinc-200 px-2 py-1 text-xs" />
            </label>
          </form>
        </CardContent>
      </Card>

      {/* 资产列表 */}
      {assets.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState title="还没有品牌资产" description="上传 Logo、封面模板或产品截图，供发布包引用。" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {assets.map((a) => (
            <div key={a.id} className="space-y-1.5 rounded-lg border border-zinc-200 bg-white p-2">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.fileUrl ?? ""} alt={a.name} className={`aspect-square w-full rounded object-contain ${a.active ? "" : "opacity-40 grayscale"}`} />
                {a.locked && <span className="absolute left-1 top-1 rounded bg-amber-500 px-1 text-[9px] text-white">已锁定</span>}
                {!a.active && <span className="absolute right-1 top-1 rounded bg-zinc-600 px-1 text-[9px] text-white">已停用</span>}
              </div>
              <div className="truncate text-[11px] font-medium text-zinc-700" title={a.name}>{a.name}</div>
              <div className="flex items-center justify-between text-[9px] text-zinc-400">
                <span>{TYPE_LABELS[a.type] ?? a.type}</span>
                <span>v{a.version}</span>
              </div>
              <div className="text-[9px] text-zinc-400">{fmtDate(a.createdAt)}</div>
              <div className="flex gap-1">
                <form action={toggleBrandAssetLockAction.bind(null, a.id)} className="flex-1">
                  <Button size="sm" variant={a.locked ? "outline" : "ghost"} className="h-5 w-full px-0 text-[9px]" type="submit">
                    {a.locked ? "解锁" : "锁定"}
                  </Button>
                </form>
                <form action={toggleBrandAssetActiveAction.bind(null, a.id)} className="flex-1">
                  <Button size="sm" variant="ghost" className="h-5 w-full px-0 text-[9px]" type="submit">
                    {a.active ? "停用" : "启用"}
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
