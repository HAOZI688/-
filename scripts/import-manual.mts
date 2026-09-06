/**
 * B-1：人工抄数 CSV 导入 CLI（与 /data-import UI 共用 manualImportService，同一管道）。
 *
 * 用法：
 *   pnpm data:import-manual data/account-metrics.csv   # 单文件
 *   pnpm data:import-manual-all                        # 批量导入 data/*.csv
 *
 * 输出：File / Rows / Created / Updated / Skipped / Failed / Snapshots Created
 * 单文件失败不阻塞其他文件（--all 模式）。
 */
import { manualImportService, MANUAL_DATA_DIR, type ManualImportResult } from "../src/lib/services/manual-import";
import { readFile } from "node:fs/promises";

function printResult(r: ManualImportResult) {
  const type = r.detectedType === "post" ? "作品级" : r.detectedType === "account" ? "账号级" : "未识别";
  console.log(`\n📄 ${r.file}（${type}${r.duplicate ? " · 重复文件跳过" : ""}）`);
  if (r.message) console.log(`   ⚠️  ${r.message}`);
  console.log(
    [
      `Rows: ${r.totalRows}`,
      `Created: ${r.created}`,
      `Updated: ${r.updated}`,
      `Skipped: ${r.skipped}`,
      `Failed: ${r.failed}`,
      `Account Snapshots: ${r.accountSnapshots}`,
      `Post Snapshots: ${r.postSnapshots}`,
      `Duplicate Snapshots(updated): ${r.duplicateSnapshots}`,
      `Accounts Matched: ${r.accountsMatched}`,
      `Posts Matched: ${r.postsMatched}`,
      `Manual Match Required: ${r.manualMatchRequired}`,
    ].join(" | "),
  );
  for (const e of r.errors.slice(0, 10)) {
    console.log(`   ❌ 行${e.rowIndex}${e.field ? ` [${e.field}]` : ""}${e.rawValue ? ` 原值[${e.rawValue}]` : ""}: ${e.reason}`);
  }
  if (r.errors.length > 10) console.log(`   … 共 ${r.errors.length} 条失败行`);
  if (r.triggeredRecalculations?.length) {
    for (const t of r.triggeredRecalculations) console.log(`   🔁 ${t}`);
  }
}

function printSummary(results: ManualImportResult[]) {
  const ok = results.filter((r) => r.ok && !r.duplicate).length;
  const failedFiles = results.filter((r) => !r.ok && !r.duplicate);
  console.log(
    `\n===== 汇总：${results.length} 文件 · 成功 ${ok} · 跳过(重复) ${results.filter((r) => r.duplicate).length} · 失败 ${failedFiles.length} =====`,
  );
  if (failedFiles.length) {
    console.log("失败文件：");
    for (const f of failedFiles) console.log(`  - ${f.file}: ${f.message ?? f.errors[0]?.reason ?? "未知错误"}`);
    process.exitCode = 1;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--all")) {
    console.log(`▶ 批量导入 ${MANUAL_DATA_DIR}/*.csv …`);
    const results = await manualImportService.importAll();
    for (const r of results) {
      await manualImportService.auditBatch(r);
      printResult(r);
    }
    printSummary(results);
    return;
  }

  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("用法：pnpm data:import-manual <file.csv> 或 pnpm data:import-manual-all");
    process.exit(1);
  }
  console.log(`▶ 导入 ${file} …`);
  const text = await readFile(file, "utf-8");
  const r = await manualImportService.importFile(text, file);
  await manualImportService.auditBatch(r);
  printResult(r);
  printSummary([r]);
}

main().catch((e) => {
  console.error("❌ 导入失败：", e instanceof Error ? e.message : e);
  process.exit(1);
});
