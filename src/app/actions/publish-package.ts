"use server";

import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { publishPackageService } from "@/lib/services/publish-package";
import { publishPackageRepository } from "@/lib/repositories";
import { auditRepository } from "@/lib/repositories";

/**
 * V4 Publish Package Actions（规格 §13-§18）。
 * 契约：form action 返回 void（数据读库渲染，不依赖返回值）。
 */

/** 生成 GitHub 周榜发布包（幂等：同快照已有包直接复用） */
export async function createGithubWeeklyPackageAction(snapshotId: string) {
  await publishPackageService.createFromGithubSnapshot(snapshotId);
  revalidatePath("/publish-packages");
  revalidatePath("/github-weekly");
}

/** QA 确认（fact/brand/content 单项） */
export async function setPackageQaAction(packageId: string, kind: "fact" | "brand" | "content", pass: boolean) {
  await publishPackageService.setQa(packageId, kind, pass);
  revalidatePath(`/publish-packages/${packageId}`);
  revalidatePath("/publish-packages");
}

/** 状态推进（draft → needs_assets → needs_review → ready → published，带 QA 门禁） */
export async function transitionPackageAction(packageId: string, to: "needs_assets" | "needs_review" | "ready" | "published") {
  await publishPackageService.transition(packageId, to);
  revalidatePath(`/publish-packages/${packageId}`);
  revalidatePath("/publish-packages");
}

/** 挂载视觉资产（顺序 = 挂载顺序） */
export async function attachVisualAction(packageId: string, brandAssetId: string) {
  await publishPackageService.attachVisual(packageId, brandAssetId);
  revalidatePath(`/publish-packages/${packageId}`);
}

/** 移除视觉资产 */
export async function removeVisualAction(packageId: string, brandAssetId: string) {
  await publishPackageService.removeVisual(packageId, brandAssetId);
  revalidatePath(`/publish-packages/${packageId}`);
}

/** 编辑发布说明 */
export async function updatePackageNotesAction(packageId: string, formData: FormData) {
  const notes = String(formData.get("publishNotes") ?? "").slice(0, 2000);
  await publishPackageRepository.update(packageId, { publishNotes: notes });
  revalidatePath(`/publish-packages/${packageId}`);
}

/**
 * V4：上传视觉资产（封面/卡片/截图）→ public/uploads + brand_assets 留痕。
 * 禁止 AI 自动重绘正式 Logo（logo 类型仅允许人工上传，规格 §18）。
 */
export async function uploadBrandAssetAction(formData: FormData) {
  const file = formData.get("file");
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "cover");
  const usageNotes = String(formData.get("usageNotes") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) throw new Error("未选择文件");
  if (!name) throw new Error("缺少资产名称");

  const dir = path.join(process.cwd(), "public", "uploads", "brand-assets");
  await mkdir(dir, { recursive: true });
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "png";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, fileName), buf);

  const asset = await publishPackageRepository.createBrandAsset({
    name: name.slice(0, 200),
    type: type as never,
    fileUrl: `/uploads/brand-assets/${fileName}`,
    usageNotes: usageNotes || null,
    active: true,
    locked: false,
    dataSource: "user_input",
  });

  await auditRepository.log({
    action: "content_update",
    entityType: "brand_assets",
    entityId: asset.id,
    actor: "user",
    before: null,
    after: { name: asset.name, type, fileUrl: asset.fileUrl },
    notes: `上传品牌/视觉资产：${asset.name}`,
  });

  revalidatePath("/publish-packages/assets");
  revalidatePath("/publish-packages");
}

/** 品牌资产 启用/停用 */
export async function toggleBrandAssetActiveAction(assetId: string) {
  const asset = await publishPackageRepository.getBrandAsset(assetId);
  if (!asset) throw new Error("资产不存在");
  if (asset.locked) throw new Error("资产已锁定，先解锁再停用");
  await publishPackageRepository.updateBrandAsset(assetId, { active: !asset.active });
  revalidatePath("/publish-packages/assets");
}

/** 品牌资产 锁定/解锁（锁定后禁止 AI/自动化替换，规格 §18） */
export async function toggleBrandAssetLockAction(assetId: string) {
  const asset = await publishPackageRepository.getBrandAsset(assetId);
  if (!asset) throw new Error("资产不存在");
  await publishPackageRepository.updateBrandAsset(assetId, { locked: !asset.locked });
  await auditRepository.log({
    action: "content_update",
    entityType: "brand_assets",
    entityId: assetId,
    actor: "user",
    before: { locked: asset.locked },
    after: { locked: !asset.locked },
    notes: asset.locked ? "解锁品牌资产" : "锁定品牌资产（禁止自动替换）",
  });
  revalidatePath("/publish-packages/assets");
}
