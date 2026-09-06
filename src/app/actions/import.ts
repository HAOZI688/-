"use server";

import { revalidatePath } from "next/cache";
import { xiaodouyaConnector } from "@/lib/connectors/xiaodouya";
import { readCsvFile } from "@/lib/connectors/csv";
import { manualImportService, type ManualImportResult } from "@/lib/services/manual-import";

/**
 * 小豆芽 CSV 导入（规格 §38）：上传 → 解析 → 检测 → 导入 → 匹配 → 快照。
 */
export async function importXiaodouyaCsv(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false as const, error: "未选择文件" };
  }
  const { text, encoding, hash } = await readCsvFile(file);
  const result = await xiaodouyaConnector.importPostsCsv(text, file.name, { encoding, fileHash: hash });
  revalidatePath("/connectors/xiaodouya");
  revalidatePath("/data-import");
  return { ok: true as const, result };
}

/** 手动确认外部作品 ↔ Publication 匹配（规格 §37：兜底人工规则） */
export async function confirmExternalPostMatch(formData: FormData) {
  const postId = String(formData.get("postId") ?? "");
  const publicationId = String(formData.get("publicationId") ?? "");
  if (!postId || !publicationId) return { ok: false as const, error: "缺少参数" };
  const { connectorRepository } = await import("@/lib/repositories");
  await connectorRepository.updateExternalPostMatch(postId, {
    publicationId,
    matchStatus: "confirmed",
    matchConfidence: "high",
  });
  revalidatePath("/connectors/xiaodouya");
  return { ok: true as const };
}

/**
 * B-1：抄数 CSV 导入（人工数据 → 正式闭环）。
 * 与 CLI（pnpm data:import-manual）共用 manualImportService。
 */
export async function importManualCsvAction(file: File): Promise<{ ok: boolean; error?: string; result?: ManualImportResult }> {
  if (!file) return { ok: false, error: "未选择文件" };
  const { text } = await readCsvFile(file);
  const result = await manualImportService.importFile(text, file.name);
  await manualImportService.auditBatch(result);
  revalidatePath("/data-import");
  revalidatePath("/analytics/topics");
  revalidatePath("/analytics/attribution");
  revalidatePath("/connectors/xiaodouya");
  revalidatePath("/dashboard");
  return { ok: result.ok, error: result.ok ? undefined : result.message, result };
}

/** B-2：预览 /screen 抄数标准文件（data/metrics-import.csv） */
export async function previewScreenImportAction() {
  return manualImportService.previewScreenCsv();
}

/** B-2：执行 /screen 抄数导入（与 CLI data:import-screen 共用 importScreenCsv） */
export async function executeScreenImportAction(): Promise<{ ok: boolean; error?: string; result?: ManualImportResult }> {
  const result = await manualImportService.importScreenCsv();
  if (result.batchId || result.totalRows > 0) await manualImportService.auditBatch(result);
  revalidatePath("/data-import");
  revalidatePath("/analytics/topics");
  revalidatePath("/analytics/attribution");
  revalidatePath("/connectors/xiaodouya");
  revalidatePath("/dashboard");
  return { ok: result.ok, error: result.ok ? undefined : result.message, result };
}
