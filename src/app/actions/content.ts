"use server";

import { getAssetById, getTopicById } from "@/lib/repo";
import { db } from "@/lib/db";
import { contentAssets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
