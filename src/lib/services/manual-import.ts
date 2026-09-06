/**
 * B-1 Manual CSV Import Service：人工抄数 CSV → 正式数据闭环。
 *
 * 定位：**现有 Import Pipeline 的一种输入来源**（不是第二套导入系统）。
 * UI（/data-import「导入抄数 CSV」）与 CLI（pnpm data:import-manual）共用本服务，
 * 内部复用 xiaodouyaConnector.importPostsCsv / connectorSyncService.importAccountsCsv：
 * - data_source = "manual"（Live Mode 视为真实数据，与 seed/fixture 严格区分）
 * - CSV「日期」列 → captured_at（数据实际日期，本地时区稳定 timestamp，不用系统时间）
 * - 快照幂等：post = external_post_id + captured_at + data_source；
 *   account = social_account_id + captured_at + data_source（重复导入 → updated，不 duplicate）
 * - 导入成功后自动触发：Account Growth Baseline 刷新 + Topic Performance 重算
 *   （Attribution 不自动跑——数据不足时本就返回 insufficient_data，不是错误）
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "@/lib/connectors/csv";
import { xiaodouyaConnector } from "@/lib/connectors/xiaodouya";
import { connectorSyncService } from "@/lib/services/connector-sync";
import { auditRepository } from "@/lib/repositories";

/** 抄数数据文件目录（相对项目根） */
export const MANUAL_DATA_DIR = "data";

export interface ManualImportRowError {
  file: string;
  rowIndex: number;
  field: string;
  rawValue: string;
  reason: string;
}

export interface ManualImportResult {
  file: string;
  /** 关联的 data_import_batches.id（CLI/审计留痕用） */
  batchId?: string;
  detectedType: "account" | "post" | "mixed" | "unknown";
  ok: boolean;
  duplicate?: boolean;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  accountsMatched: number;
  postsMatched: number;
  manualMatchRequired: number;
  accountSnapshots: number;
  postSnapshots: number;
  duplicateSnapshots: number;
  errors: ManualImportRowError[];
  triggeredRecalculations?: string[];
  message?: string;
}

/** 表头 → 类型检测。record_type 列存在时返回 "mixed"（/screen 抄数宽表，按行拆分）。
 * 作品列优先：有作品标题即作品级；否则有账号+粉丝列即账号级。 */
export function detectManualCsv(headers: string[]): "account" | "post" | "mixed" | "unknown" {
  if (headers.some((h) => h.toLowerCase() === "record_type")) return "mixed";
  const hasTitle = headers.some((h) => ["作品标题", "title", "post_title"].includes(h));
  if (hasTitle) return "post";
  const hasAccount = headers.some((h) => ["账号名称", "账号", "account_name", "昵称"].includes(h));
  const hasMetric = headers.some((h) => ["粉丝数", "followers", "新增粉丝", "播放量", "views"].includes(h));
  if (hasAccount && hasMetric) return "account";
  return "unknown";
}

function rowErrorsFrom(files: string, errors: string[]): ManualImportRowError[] {
  // 行错误文案："第N行: <reason>"；尽力从中拆出 field/raw（reason 已含时直接透传）
  return errors.map((e) => {
    const m = /^第(\d+)行[:：]\s*(.*)$/.exec(e);
    return {
      file: files,
      rowIndex: m ? Number(m[1]) : 0,
      field: "",
      rawValue: "",
      reason: m ? m[2] : e,
    };
  });
}

export const manualImportService = {
  /** 单文件导入（UI 与 CLI 共用入口） */
  async importFile(csvText: string, fileName: string, opts: { skipRecalc?: boolean } = {}): Promise<ManualImportResult> {
    const { headers } = parseCsv(csvText);
    const type = detectManualCsv(headers);
    const base: ManualImportResult = {
      file: fileName, detectedType: type, ok: false, totalRows: 0, created: 0, updated: 0,
      skipped: 0, failed: 0, accountsMatched: 0, postsMatched: 0, manualMatchRequired: 0,
      accountSnapshots: 0, postSnapshots: 0, duplicateSnapshots: 0, errors: [],
    };

    if (type === "unknown") {
      return { ...base, ok: false, message: "无法识别 CSV 类型（需含「作品标题」列，或「账号/账号名称」+「粉丝数」等指标列）" };
    }

    const hash = (await import("node:crypto")).createHash("sha256").update(csvText).digest("hex");

    // B-2：/screen 抄数宽表（record_type 列）→ 按 record_type 拆分，分别走现有账号/作品管道，统计合并
    if (type === "mixed") {
      return this.importMixedCsv(csvText, fileName, hash, opts);
    }

    if (type === "post") {
      const r = await xiaodouyaConnector.importPostsCsv(csvText, fileName, { dataSource: "manual", fileHash: hash });
      const result: ManualImportResult = {
        ...base,
        batchId: r.batchId,
        ok: r.failedRows === 0,
        duplicate: r.duplicate,
        totalRows: r.totalRows,
        created: r.externalPostsCreated,
        updated: r.externalPostsUpdated,
        failed: r.failedRows,
        postsMatched: r.matchedPublications,
        manualMatchRequired: r.unmatchedPosts ?? 0,
        postSnapshots: r.snapshotsCreated,
        duplicateSnapshots: r.snapshotsUpdated ?? 0,
        errors: rowErrorsFrom(fileName, r.errors),
      };
      if (!r.duplicate && !opts.skipRecalc) await this.triggerRecalculations(result);
      return result;
    }

    // account
    const r = await connectorSyncService.importAccountsCsv(csvText, fileName, { dataSource: "manual", fileHash: hash });
    const result: ManualImportResult = {
      ...base,
      batchId: r.batchId,
      ok: r.failed === 0,
      duplicate: r.duplicate,
      totalRows: r.totalRows,
      created: r.created,
      updated: r.updated,
      failed: r.failed,
      accountsMatched: r.created + r.updated,
      accountSnapshots: r.accountSnapshots ?? 0,
      duplicateSnapshots: r.accountSnapshotsUpdated ?? 0,
      errors: rowErrorsFrom(fileName, r.errors),
    };
    if (!r.duplicate && !opts.skipRecalc) await this.triggerRecalculations(result);
    return result;
  },

  /**
   * B-2：混合宽表拆分（record_type=account|post）。两桶各自走现有管道（skipRecalc），
   * 完成后统一触发一次重算。单桶失败不阻塞另一桶。
   */
  async importMixedCsv(csvText: string, fileName: string, fileHash: string, opts: { skipRecalc?: boolean } = {}): Promise<ManualImportResult> {
    const { headers, rows } = parseCsv(csvText);
    const typeCol = headers.find((h) => h.toLowerCase() === "record_type");
    const buckets: Record<string, { data: Record<string, string>; rowIndex: number }[]> = { account: [], post: [] };
    for (const r of rows) {
      const t = (r.data[typeCol!] ?? "").trim().toLowerCase();
      if (t !== "account" && t !== "post") {
        buckets.account.push(r); // record_type 缺失的行默认按账号级尝试（列缺失会走行级错误）
        continue;
      }
      buckets[t].push(r);
    }

    const esc = (v: string) => (v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v);
    const merge = (parts: { data: Record<string, string> }[]) => [headers.join(","), ...parts.map((r) => headers.map((h) => esc(r.data[h] ?? "")).join(","))].join("\n");

    const result = emptyResult();
    result.file = fileName;
    result.detectedType = "mixed";
    result.totalRows = rows.length;

    const subResults: ManualImportResult[] = [];
    for (const [bucketType, bucketRows] of Object.entries(buckets)) {
      if (!bucketRows.length) continue;
      const subCsv = merge(bucketRows);
      try {
        if (bucketType === "post") {
          const r = await xiaodouyaConnector.importPostsCsv(subCsv, fileName, { dataSource: "manual", fileHash });
          subResults.push({ ...emptyResult(), file: fileName, detectedType: "post", totalRows: r.totalRows, created: r.externalPostsCreated, updated: r.externalPostsUpdated, failed: r.failedRows, postsMatched: r.matchedPublications, manualMatchRequired: r.unmatchedPosts ?? 0, postSnapshots: r.snapshotsCreated, duplicateSnapshots: r.snapshotsUpdated ?? 0, batchId: r.batchId, errors: rowErrorsFrom(fileName, r.errors) });
        } else {
          const r = await connectorSyncService.importAccountsCsv(subCsv, fileName, { dataSource: "manual", fileHash });
          subResults.push({ ...emptyResult(), file: fileName, detectedType: "account", totalRows: r.totalRows, created: r.created, updated: r.updated, failed: r.failed, accountsMatched: r.created + r.updated, accountSnapshots: r.accountSnapshots ?? 0, duplicateSnapshots: r.accountSnapshotsUpdated ?? 0, batchId: r.batchId, errors: rowErrorsFrom(fileName, r.errors) });
        }
      } catch (e) {
        subResults.push({ ...emptyResult(), file: fileName, detectedType: bucketType as "post" | "account", failed: bucketRows.length, message: `${bucketType} 桶导入失败: ${e instanceof Error ? e.message.slice(0, 80) : e}` });
      }
    }

    for (const sub of subResults) {
      result.created += sub.created;
      result.updated += sub.updated;
      result.failed += sub.failed;
      result.accountsMatched += sub.accountsMatched;
      result.postsMatched += sub.postsMatched;
      result.manualMatchRequired += sub.manualMatchRequired;
      result.accountSnapshots += sub.accountSnapshots;
      result.postSnapshots += sub.postSnapshots;
      result.duplicateSnapshots += sub.duplicateSnapshots;
      result.errors.push(...sub.errors);
      if (sub.message) result.errors.push({ file: fileName, rowIndex: 0, field: "", rawValue: "", reason: sub.message });
    }
    result.ok = result.failed === 0;
    result.batchId = subResults.find((r) => r.batchId)?.batchId;
    if (!opts.skipRecalc) await this.triggerRecalculations(result);
    return result;
  },

  /** B-2 §10/§11：/screen 抄数标准文件（data/metrics-import.csv）。UI 与 CLI 共用。 */
  async importScreenCsv(opts: { skipRecalc?: boolean } = {}): Promise<ManualImportResult> {
    const file = path.join(process.cwd(), MANUAL_DATA_DIR, "metrics-import.csv");
    let text: string;
    try {
      text = await readFile(file, "utf-8");
    } catch {
      return { ...emptyResult(), file: `${MANUAL_DATA_DIR}/metrics-import.csv`, ok: false, message: "尚未发现抄数数据：请在项目目录执行 /screen 抄数（生成 data/metrics-import.csv）后再导入" };
    }
    return this.importFile(text, `${MANUAL_DATA_DIR}/metrics-import.csv`, opts);
  },

  /** B-2 §10：导入前预览（行数 / 类型 / 平台 / 日期范围 / 前 5 行） */
  async previewScreenCsv(): Promise<{ exists: boolean; message?: string; totalRows: number; byType: Record<string, number>; platforms: string[]; dateRange: [string, string] | null; sample: Record<string, string>[]; headers: string[] }> {
    const file = path.join(process.cwd(), MANUAL_DATA_DIR, "metrics-import.csv");
    let text: string;
    try {
      text = await readFile(file, "utf-8");
    } catch {
      return { exists: false, totalRows: 0, byType: {}, platforms: [], dateRange: null, sample: [], headers: [], message: "尚未发现抄数数据，请先在项目目录执行 /screen 抄数" };
    }
    const { headers, rows } = parseCsv(text);
    const byType: Record<string, number> = {};
    const platforms = new Set<string>();
    const dates: string[] = [];
    const dateCol = headers.find((h) => ["snapshot_date", "数据日期", "统计日期", "日期", "date"].includes(h));
    const platformCol = headers.find((h) => h.toLowerCase() === "platform" || h === "平台");
    const typeCol = headers.find((h) => h.toLowerCase() === "record_type");
    for (const r of rows) {
      const t = (typeCol ? r.data[typeCol] : "") || (detectManualCsv(headers) === "post" ? "post" : "account");
      byType[t] = (byType[t] ?? 0) + 1;
      if (platformCol && r.data[platformCol]) platforms.add(r.data[platformCol]);
      if (dateCol && r.data[dateCol]) dates.push(r.data[dateCol]);
    }
    dates.sort();
    return {
      exists: true,
      totalRows: rows.length,
      byType,
      platforms: [...platforms],
      dateRange: dates.length ? [dates[0], dates[dates.length - 1]] : null,
      sample: rows.slice(0, 5).map((r) => r.data),
      headers,
    };
  },

  /** B-1 §13：快照落库后自动刷新 Baseline + Topic Performance（无需手动点“重新计算表现”） */
  async triggerRecalculations(result: ManualImportResult): Promise<string[]> {
    const triggered: string[] = [];
    if ((result.accountSnapshots ?? 0) + (result.postSnapshots ?? 0) === 0) return triggered;
    try {
      const { accountGrowthBaselineService } = await import("@/lib/services/account-growth-baseline");
      await accountGrowthBaselineService.computeAll();
      triggered.push("account_growth_baseline: recomputeAll");
    } catch (e) {
      triggered.push(`account_growth_baseline: FAILED ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
    try {
      const { topicPerformanceV2Service } = await import("@/lib/services/topic-performance-v2");
      const { topicRepository } = await import("@/lib/repositories");
      const topics = await topicRepository.list();
      for (const t of topics) {
        await topicPerformanceV2Service.computeForTopic(t.id);
      }
      triggered.push(`topic_performance_v2: recomputed ${topics.length} topics`);
    } catch (e) {
      triggered.push(`topic_performance_v2: FAILED ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
    result.triggeredRecalculations = triggered;
    return triggered;
  },

  /** B-1 §11：批量导入 data/*.csv（单文件失败不阻塞其他文件） */
  async importAll(dir = MANUAL_DATA_DIR): Promise<ManualImportResult[]> {
    const absDir = path.join(process.cwd(), dir);
    let files: string[] = [];
    try {
      files = (await readdir(absDir)).filter((f) => f.toLowerCase().endsWith(".csv")).sort();
    } catch {
      return [{ ...emptyResult(), file: dir + "/*.csv", ok: false, message: `目录不存在或不可读：${absDir}` }];
    }
    const results: ManualImportResult[] = [];
    for (const f of files) {
      try {
        const text = await readFile(path.join(absDir, f), "utf-8");
        results.push(await this.importFile(text, path.join(dir, f)));
      } catch (e) {
        results.push({ ...emptyResult(), file: path.join(dir, f), ok: false, message: e instanceof Error ? e.message : String(e) });
      }
    }
    return results;
  },

  /** 审计留痕（§15）。注意：audit_logs.entity_id 是 uuid 列，文件名放 notes/after，不进 entityId。审计失败不阻断导入结果。 */
  async auditBatch(result: ManualImportResult) {
    try {
      await auditRepository.log({
        action: "data_import",
        entityType: "manual_import",
        entityId: result.batchId ?? null,
      actor: "user",
      before: null,
      after: {
        dataSource: "manual", fileName: result.file, detectedType: result.detectedType,
        rows: result.totalRows, created: result.created, updated: result.updated,
        failed: result.failed, snapshots: result.accountSnapshots + result.postSnapshots,
        duplicateSnapshots: result.duplicateSnapshots,
        triggered: result.triggeredRecalculations ?? [],
      },
        notes: `抄数 CSV 导入: ${result.file}（${result.ok ? "成功" : "含失败"}）`,
      });
    } catch (e) {
      console.warn(`⚠️ audit 留痕失败（不阻断导入）: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
    }
  },
};

function emptyResult(): ManualImportResult {
  return {
    file: "", detectedType: "unknown" as const, ok: false, totalRows: 0, created: 0, updated: 0,
    skipped: 0, failed: 0, accountsMatched: 0, postsMatched: 0, manualMatchRequired: 0,
    accountSnapshots: 0, postSnapshots: 0, duplicateSnapshots: 0, errors: [],
  };
}
