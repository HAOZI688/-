"use server";

import { revalidatePath } from "next/cache";
import { xiaodouyaConnector } from "@/lib/connectors/xiaodouya";
import { readCsvFile } from "@/lib/connectors/csv";

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
