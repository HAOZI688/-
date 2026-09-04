"use server";

import { getAssetById, getTopicById } from "@/lib/repo";
import { db } from "@/lib/db";
import { contentAssets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { contentRepository, auditRepository } from "@/lib/repositories";

export async function setAssetStatusAction(assetId: string, status: string) {
  await db.update(contentAssets).set({ status: status as never, updatedAt: new Date() }).where(eq(contentAssets.id, assetId));
  revalidatePath("/content");
  revalidatePath(`/content/${assetId}`);
  return true;
}

export async function getAssetDetailAction(assetId: string) {
  const asset = await getAssetById(assetId);
  if (!asset) return null;
  const topic = await getTopicById(asset.topicId);
  return { asset, topic };
}

/** V4：人工编辑内容（版本化存档；审核通过时按「有无人工编辑版本」区分 直接通过/修改后通过） */
export async function saveAssetEditAction(assetId: string, formData: FormData) {
  const content = String(formData.get("content") ?? "");
  const asset = await contentRepository.getAssetById(assetId);
  if (!asset) throw new Error("内容资产不存在");
  await contentRepository.createVersion(assetId, asset.version, content, "人工编辑", "user");
  await db
    .update(contentAssets)
    .set({ content, version: asset.version + 1, updatedAt: new Date() })
    .where(eq(contentAssets.id, assetId));
  await auditRepository.log({
    action: "content_update",
    entityType: "content_asset",
    entityId: assetId,
    before: { version: asset.version },
    after: { version: asset.version + 1 },
    notes: "人工编辑内容（版本化）",
    actor: "user",
  });
  revalidatePath(`/content/${assetId}`);
  revalidatePath("/review");
}
