"use server";

import { revalidatePath } from "next/cache";
import { orchestratorService } from "@/lib/services/orchestrator";
import { auditRepository, contentRepository, publicationRepository } from "@/lib/repositories";

/**
 * Human Gate Actions（V2 P0）：
 * Gate 1 Topic 确认（confirmPlan / rejectPlanItem）
 * Gate 2 内容审核（approveAsset / revisionAsset）
 * Gate 3 发布确认（confirmPublication）
 * 全部落审计，绝不自动发布。
 * 约定：form action 契约返回 void（数据读库渲染，不依赖返回值）。
 */

/* ===== Gate 1：选题确认（Orchestrator 计划） ===== */

export async function confirmPlanAction(planId: string) {
  await orchestratorService.confirmPlan(planId);
  revalidatePath("/review");
  revalidatePath("/planning");
  revalidatePath("/weekly-plan");
  revalidatePath("/dashboard");
}

export async function rejectPlanItemAction(itemId: string) {
  await orchestratorService.rejectPlanItem(itemId);
  revalidatePath("/review");
  revalidatePath("/planning");
  revalidatePath("/weekly-plan");
}

/** Gate 1 通过后：开始生产（触发 DAG 根节点） */
export async function startProductionAction(planId: string) {
  await orchestratorService.startProduction(planId);
  revalidatePath("/review");
  revalidatePath("/planning");
  revalidatePath("/weekly-plan");
  revalidatePath("/production");
  revalidatePath("/workflows");
  revalidatePath("/dashboard");
}

/* ===== Gate 2：内容审核（writeback 产出的 in_review 资产） ===== */

/** 通过：版本化存档后放行（规格 §26）；V4 按有无人工编辑版本区分 直接通过/修改后通过 */
export async function approveAssetAction(assetId: string) {
  const asset = await contentRepository.getAssetById(assetId);
  if (!asset) throw new Error("内容资产不存在");
  const versions = await contentRepository.listVersions(assetId);
  const humanEdited = versions.some((v) => v.createdBy === "user");
  await contentRepository.createVersion(assetId, asset.version, asset.content ?? "", "人工审核通过");
  const updated = await contentRepository.updateAsset(assetId, { status: "ready", version: asset.version + 1 });
  await auditRepository.log({
    action: "content_update",
    entityType: "content_asset",
    entityId: assetId,
    before: { status: asset.status, version: asset.version },
    after: { status: "ready", version: updated.version },
    notes: humanEdited ? "Human Gate 内容审核通过（修改后）" : "Human Gate 内容审核通过（直接）",
    actor: "user",
  });
  // V4：内容验收统计（有编辑版本 → approved_after_edit，否则 approved_directly）
  const { acceptanceStatsService } = await import("@/lib/services/acceptance-stats");
  await acceptanceStatsService.record(asset, humanEdited ? { approvedAfterEdit: 1 } : { approvedDirectly: 1 });
  revalidatePath("/review");
  revalidatePath("/content/" + asset.topicId);
}

/** 打回：标记 needs_revision，重新走生产 */
export async function revisionAssetAction(assetId: string) {
  const asset = await contentRepository.getAssetById(assetId);
  if (!asset) throw new Error("内容资产不存在");
  const updated = await contentRepository.updateAsset(assetId, { status: "needs_revision" });
  await auditRepository.log({
    action: "content_update",
    entityType: "content_asset",
    entityId: assetId,
    before: { status: asset.status },
    after: { status: "needs_revision" },
    notes: "人工打回修改",
    actor: "user",
  });
  // V4：内容验收统计（rejected + revision_count）
  const { acceptanceStatsService } = await import("@/lib/services/acceptance-stats");
  await acceptanceStatsService.record(asset, { rejected: 1, revisionCount: 1 });
  revalidatePath("/review");
  revalidatePath("/content/" + asset.topicId);
}

/* ===== Gate 3：发布确认（planned → ready → scheduled，绝不自动发布） ===== */

export async function confirmPublicationAction(pubId: string) {
  const pub = await publicationRepository.getById(pubId);
  if (!pub) throw new Error("发布计划不存在");
  const nextStatus = pub.status === "planned" ? "ready" : "scheduled";
  await publicationRepository.updateStatus(pubId, nextStatus);
  await auditRepository.log({
    action: "publication_update",
    entityType: "publication",
    entityId: pubId,
    before: { status: pub.status },
    after: { status: nextStatus },
    notes: `Human Gate 发布确认 → ${nextStatus}`,
    actor: "user",
  });
  revalidatePath("/review");
  revalidatePath("/publications");
}
