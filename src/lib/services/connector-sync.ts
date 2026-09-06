import { connectorRepository, metricsRepository, socialAccountRepository } from "@/lib/repositories";
import { xiaodouyaConnector } from "@/lib/connectors/xiaodouya";
import { parseCsv, parseNumber, parseDateLocal, DATE_COLUMN_ALIASES } from "@/lib/connectors/csv";
import { notificationService } from "@/lib/services/notification";
import { auditRepository } from "@/lib/repositories";
import { db } from "@/lib/db";
import { dataSyncJobs, socialAccounts } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Connector Sync Service（V3 §5-§9）：小豆芽生产级连接器。
 *
 * Adapter 原则：不假设公开 API 存在。当前只有 File Import（XiaodouyaFileConnector）；
 * Api Mode 是预留适配器（未配置时 UI 显示 Not Configured，禁止伪造 endpoint）。
 * 替换 Connector Adapter 不重构 Database / Analytics。
 *
 * 幂等原则：重复导入同一文件不重复创建 Social Account / External Post / Metric Snapshot /
 * Lead / Publication —— 业务唯一键：external_post = connector+platform+external_post_id（缺 ID 用 URL）；
 * metric snapshot = external_post_id+captured_at+source；account = platform+account_name。
 * 导入结果记录 created / updated / skipped / failed。
 */

/** Metric Freshness 默认规则（可配置化，不写死 UI） */
export const FRESHNESS_DEFAULTS = {
  freshHours: 48,
  agingHours: 168, // 7 天
};

export type FreshnessLevel = "fresh" | "aging" | "stale";

/** SocialDataConnector Adapter 契约（V3 §5） */
export interface SocialDataConnector {
  readonly mode: "file_import" | "manual" | "api";
  testConnection(): Promise<{ ok: boolean; detail: string }>;
  listAccounts(): Promise<unknown[]>;
  listPosts(): Promise<unknown[]>;
  getAccountMetrics(accountId: string): Promise<unknown>;
  getPostMetrics(postId: string): Promise<unknown>;
  syncAccounts(): Promise<unknown>;
  syncPosts(): Promise<unknown>;
  syncMetrics(): Promise<unknown>;
}

/** 文件模式适配器：小豆芽当前仅文件导入（未来 API 模式替换本类即可） */
export const xiaodouyaFileConnector: SocialDataConnector = {
  mode: "file_import",
  async testConnection() {
    const conn = await xiaodouyaConnector.ensureConnector();
    return { ok: true, detail: `File Import 模式已就绪（connector ${conn.id.slice(0, 8)}），等待用户上传 CSV` };
  },
  async listAccounts() {
    return socialAccountRepository.list();
  },
  async listPosts() {
    return connectorRepository.listExternalPosts({ limit: 200 });
  },
  async getAccountMetrics(accountId: string) {
    return metricsRepository.listAccountSnapshots(accountId);
  },
  async getPostMetrics(postId: string) {
    return metricsRepository.listPostSnapshots(postId);
  },
  async syncAccounts() {
    return { ok: false, detail: "File Import 模式：请上传账号 CSV" };
  },
  async syncPosts() {
    return { ok: false, detail: "File Import 模式：请上传作品 CSV" };
  },
  async syncMetrics() {
    return { ok: false, detail: "File Import 模式：请上传指标 CSV" };
  },
};

/** API 模式占位适配器（未配置，禁止伪造 endpoint） */
export const xiaodouyaApiConnector: SocialDataConnector = {
  mode: "api",
  async testConnection() {
    return { ok: false, detail: "API Mode 未配置：当前没有小豆芽公开 API Contract，不伪造 endpoint" };
  },
  async listAccounts() {
    return [];
  },
  async listPosts() {
    return [];
  },
  async getAccountMetrics() {
    return null;
  },
  async getPostMetrics() {
    return null;
  },
  async syncAccounts() {
    return { ok: false, detail: "API 未配置" };
  },
  async syncPosts() {
    return { ok: false, detail: "API 未配置" };
  },
  async syncMetrics() {
    return { ok: false, detail: "API 未配置" };
  },
};

/** 当前激活适配器（按连接器 config.mode 切换；V3 默认 file_import） */
export async function getConnectorAdapter(): Promise<SocialDataConnector> {
  const connectors = await connectorRepository.listConnectors();
  const xiaodouya = connectors.find((c) => c.connectorType === "xiaodouya");
  const mode = xiaodouya?.config && (xiaodouya.config as Record<string, unknown>)?.mode === "api" ? "api" : "file_import";
  return mode === "api" ? xiaodouyaApiConnector : xiaodouyaFileConnector;
}

export const connectorSyncService = {
  /**
   * 检测 CSV 表头 → 匹配模板（requiredColumns 命中比例）→ 返回建议映射。
   * 无模板时返回 null（用户可以保存新模板）。
   */
  async detectMapping(csvText: string, dataType: "account" | "post" | "account_metrics" | "post_metrics") {
    const { headers } = parseCsv(csvText);
    if (!headers.length) return { headers, matched: null as null | { id: string; name: string; version: string; columnMapping: Record<string, string> }, suggest: {} as Record<string, string> };

    const templates = await connectorRepository.listMappingTemplates({ dataType, activeOnly: true });
    let best: { id: string; name: string; version: string; columnMapping: Record<string, string> } | null = null;
    let bestRatio = 0;
    for (const t of templates) {
      const required: string[] = JSON.parse(t.requiredColumns ?? "[]");
      if (!required.length) continue;
      const hit = required.filter((c) => headers.includes(c)).length / required.length;
      if (hit > bestRatio) {
        bestRatio = hit;
        best = { id: t.id, name: t.name, version: t.version, columnMapping: (t.columnMapping ?? {}) as Record<string, string> };
      }
    }

    // 无模板时按字段名启发式建议
    const suggest: Record<string, string> = {};
    if (!best) {
      const KNOWN: Record<string, string[]> = {
        account_name: ["账号名称", "账号", "account_name", "昵称"],
        platform: ["平台", "platform"],
        external_account_id: ["抖音号", "账号ID", "external_account_id"],
        external_post_id: ["作品ID", "post_id", "external_post_id", "note_id", "aweme_id"],
        title: ["作品标题", "title", "标题"],
        published_at: ["发布时间", "published_at", "created_at", "发布日期"],
        external_url: ["作品链接", "url", "external_url", "链接"],
        views: ["播放量", "views", "plays", "阅读量"],
        likes: ["点赞数", "likes", "赞"],
        comments: ["评论数", "comments"],
        shares: ["分享数", "shares", "转发"],
        saves: ["收藏数", "saves"],
        profile_visits: ["主页访问", "profile_visits"],
        followers: ["粉丝数", "followers", "粉丝"],
        new_followers: ["新增粉丝", "new_followers", "涨粉"],
        impressions: ["曝光量", "impressions"],
      };
      for (const header of headers) {
        for (const [key, aliases] of Object.entries(KNOWN)) {
          if (aliases.includes(header)) {
            suggest[header] = key;
            break;
          }
        }
      }
    }
    return { headers, matched: best, suggest };
  },

  /**
   * 保存映射模板（V3 §7）：用户确认映射后可复用。
   */
  async saveTemplate(input: { dataType: "account" | "post" | "account_metrics" | "post_metrics"; name: string; columnMapping: Record<string, string>; requiredColumns?: string[]; version?: string }) {
    return connectorRepository.createMappingTemplate({
      connectorType: "xiaodouya",
      dataType: input.dataType,
      name: input.name,
      version: input.version ?? "1.0",
      columnMapping: input.columnMapping as never,
      requiredColumns: JSON.stringify(input.requiredColumns ?? Object.keys(input.columnMapping).slice(0, 3)),
      active: 1,
    });
  },

  /**
   * 账号 CSV 导入（幂等）：platform+account_name 唯一键 upsert social_accounts +
   * connector_accounts 映射；无 external_account_id 时标记 unmapped。
   * V4：重复文件检测（fileHash）/ 行级错误结构化落库 / 历史导入标记。
   */
  async importAccountsCsv(csvText: string, fileName: string, opts: { historicalImport?: boolean; fileHash?: string; encoding?: "utf8" | "gbk"; dataSource?: "manual" | "xiaodouya_import" | "historical_import" } = {}) {
    const connector = await xiaodouyaConnector.ensureConnector();
    const { headers, rows } = parseCsv(csvText);
    const historical = opts.historicalImport ?? false;

    // 重复文件检测：同 hash 已完成/部分成功批次 → 跳过
    if (opts.fileHash) {
      const dup = await connectorRepository.findDuplicateBatch(opts.fileHash, "accounts");
      if (dup) {
        await auditRepository.log({
          action: "data_import",
          entityType: "data_import_batches",
          entityId: dup.id,
          actor: "user",
          before: null,
          after: { fileName, duplicate: true, originalBatch: dup.id },
          notes: `重复账号文件跳过（已有批次 ${dup.id.slice(0, 8)}）`,
        });
        return { batchId: dup.id, totalRows: rows.length, created: 0, updated: 0, failed: 0, accountSnapshots: 0, accountSnapshotsUpdated: 0, errors: [], duplicate: true };
      }
    }

    const batch = await connectorRepository.createImportBatch({ connectorId: connector.id, fileName, fileType: "csv", dataType: "accounts", fileHash: opts.fileHash ?? null, fileHeaders: headers as never, historicalImport: historical ? 1 : 0, status: "importing", totalRows: String(rows.length) });
    const errors: string[] = [];
    if (!headers.length) errors.push("CSV 为空或无表头");

    const col = (aliases: string[]) => aliases.find((a) => headers.includes(a)) ?? null;
    const nameCol = col(["账号名称", "账号", "account_name", "昵称"]);
    const platformCol = col(["平台", "platform"]);
    const extIdCol = col(["抖音号", "账号ID", "external_account_id"]);
    const followersCol = col(["粉丝数", "followers"]);
    // B-1：日期列（→ captured_at）+ 扩展指标列（标准字段）
    const capturedCol = col(DATE_COLUMN_ALIASES);
    const newFollowersCol = col(["新增粉丝", "new_followers", "涨粉"]);
    const profileVisitsCol = col(["主页访问", "主页访问量", "profile_visits"]);
    const impressionsCol = col(["曝光量", "曝光", "impressions"]);
    const viewsCol = col(["播放量", "播放", "views"]);
    const engagementsCol = col(["互动量", "互动", "engagements"]);

    let created = 0;
    let updated = 0;
    let failed = 0;
    let accountSnapshots = 0;
    let accountSnapshotsUpdated = 0;
    const failedRowData: { rowIndex: number; row: Record<string, string>; error: string }[] = [];
    const platformMap: Record<string, string> = { 抖音: "douyin", 微信: "wechat", 公众号: "wechat", 小红书: "xiaohongshu", 视频号: "wechat_video", 快手: "kuaishou", B站: "bilibili", 哔哩哔哩: "bilibili", 其他: "other" };

    for (const { data: row, rowIndex } of rows) {
      try {
        const accountName = nameCol ? row[nameCol] : "";
        if (!accountName) {
          failedRowData.push({ rowIndex, row, error: `行缺少账号名称: ${JSON.stringify(row).slice(0, 60)}` });
          failed++;
          continue;
        }
        const rawPlatform = platformCol ? row[platformCol] : "其他";
        const platform = (platformMap[rawPlatform] ?? rawPlatform.toLowerCase() ?? "other") as never;
        const extId = extIdCol ? row[extIdCol] : "";

        const existing = await db.select().from(socialAccounts).where(sqlNameMatch(accountName)).limit(1);
        if (existing[0]) {
          await socialAccountRepository.update(existing[0].id, { platform: platform as never, externalAccountId: extId || undefined });
          await connectorRepository.upsertConnectorAccount(connector.id, existing[0].id, extId || undefined, accountName);
          updated++;
        } else {
          const acc = await socialAccountRepository.create({ platform: platform as never, accountName, externalAccountId: extId || undefined, status: "active" });
          await connectorRepository.upsertConnectorAccount(connector.id, acc.id, extId || undefined, accountName);
          created++;
        }

        // 账号指标快照（B-1：日期列做 captured_at；幂等 upsert；扩展标准字段）
        if (followersCol && row[followersCol]) {
          const num = parseNumber(row[followersCol]);
          if (num !== undefined) {
            const accRow = await db.select().from(socialAccounts).where(sqlNameMatch(accountName)).limit(1);
            if (accRow[0]) {
              // 日期列校验：有值但解析失败 → 行级错误（不静默用当前时间）
              const capturedAt = capturedCol ? parseDateLocal(row[capturedCol]) : null;
              if (capturedCol && row[capturedCol] && !capturedAt) {
                throw new Error(`列[${capturedCol}] 值[${row[capturedCol]}] 无法解析为日期`);
              }
              const snap = await metricsRepository.upsertAccountSnapshot({
                socialAccountId: accRow[0].id,
                capturedAt: capturedAt ?? new Date(),
                followers: num,
                newFollowers: (newFollowersCol ? parseNumber(row[newFollowersCol]) : undefined) ?? 0,
                profileVisits: (profileVisitsCol ? parseNumber(row[profileVisitsCol]) : undefined) ?? 0,
                impressions: (impressionsCol ? parseNumber(row[impressionsCol]) : undefined) ?? 0,
                views: (viewsCol ? parseNumber(row[viewsCol]) : undefined) ?? 0,
                engagements: (engagementsCol ? parseNumber(row[engagementsCol]) : undefined) ?? 0,
                dataSource: opts.dataSource ?? "xiaodouya_import",
                rawMetrics: { source: (opts.dataSource ?? "xiaodouya_import") === "manual" ? "manual_csv_accounts" : "xiaodouya_csv_accounts", row, encoding: opts.encoding ?? null },
              } as never);
              if (snap.status === "created") accountSnapshots++;
              else accountSnapshotsUpdated++;
            }
          }
        }
      } catch (e) {
        failedRowData.push({ rowIndex, row, error: `行处理失败: ${e instanceof Error ? e.message : String(e)}` });
        failed++;
      }
    }

    const finalStatus = failedRowData.length ? (failedRowData.length > rows.length / 2 ? "failed" : "partial") : "completed";
    await connectorRepository.updateImportBatch(batch.id, { status: finalStatus, successRows: String(created + updated), failedRows: String(failed), failedRowData: failedRowData as never, errorLog: failedRowData.slice(0, 20).map((f) => `第${f.rowIndex}行: ${f.error}`).join("; "), completedAt: new Date() });
    await connectorRepository.updateConnector(connector.id, { lastSyncAt: new Date() });
    await auditRepository.log({
      action: "data_import",
      entityType: "data_import_batches",
      entityId: batch.id,
      actor: "user",
      before: null,
      after: { fileName, total: rows.length, created, updated, failed },
      notes: `小豆芽账号 CSV 导入: ${fileName}`,
    });
    if (failedRowData.length) {
      await notificationService.notify({
        type: "data_sync_failed",
        title: `账号导入有 ${failedRowData.length} 行失败`,
        message: failedRowData[0].error,
        link: "/connectors/xiaodouya",
        entityType: "data_import_batches",
        entityId: batch.id,
        severity: "warning",
      });
    }
    return { batchId: batch.id, totalRows: rows.length, created, updated, failed, accountSnapshots, accountSnapshotsUpdated, errors: failedRowData.map((f) => `第${f.rowIndex}行: ${f.error}`), duplicate: false };
  },

  /** V4：失败行重试（Retry Failed Rows）——按批次读回 failed_row_data 重新导入。
   * 注意：不传 fileHash（避免命中原 partial 批次被重复检测跳过）。 */
  async retryFailedRows(batchId: string) {
    const batch = await connectorRepository.getImportBatch(batchId);
    if (!batch) return { ok: false as const, message: "批次不存在" };
    const failedRowData = (batch.failedRowData ?? []) as { rowIndex: number; row: Record<string, string>; error: string }[];
    if (!failedRowData.length) return { ok: false as const, message: "该批次无失败行可重试" };

    if (batch.dataType === "accounts") {
      // 重建 CSV 文本（表头 + 失败行），复用账号导入流程
      const headers = (batch.fileHeaders ?? []) as string[];
      const text = [headers.join(","), ...failedRowData.map((f) => headers.map((h) => f.row[h] ?? "").join(","))].join("\n");
      const result = await this.importAccountsCsv(text, batch.fileName, { historicalImport: batch.historicalImport === 1, encoding: "utf8" });
      return { ok: true as const, result };
    }
    // posts
    const headers = (batch.fileHeaders ?? []) as string[];
    const text = [headers.join(","), ...failedRowData.map((f) => headers.map((h) => f.row[h] ?? "").join(","))].join("\n");
    const result = await xiaodouyaConnector.importPostsCsv(text, batch.fileName, { historicalImport: batch.historicalImport === 1, encoding: "utf8" });
    return { ok: true as const, result };
  },

  /** V4：失败行导出（Export Failed Rows）——返回 CSV 文本供下载 */
  async exportFailedRows(batchId: string) {
    const batch = await connectorRepository.getImportBatch(batchId);
    if (!batch) return { ok: false as const, message: "批次不存在", csv: "" };
    const failedRowData = (batch.failedRowData ?? []) as { rowIndex: number; row: Record<string, string>; error: string }[];
    if (!failedRowData.length) return { ok: false as const, message: "该批次无失败行", csv: "" };
    const headers = (batch.fileHeaders ?? []) as string[];
    const esc = (v: string) => (v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [
      [...headers, "错误原因"].map(esc).join(","),
      ...failedRowData.map((f) => [...headers.map((h) => f.row[h] ?? ""), f.error].map(esc).join(",")),
    ];
    return { ok: true as const, csv: lines.join("\n") };
  },

  /** 作品 CSV 导入（复用 V1 全流程 + 幂等 + 未匹配通知；V4 传递历史导入/重复检测选项） */
  async importPostsCsv(csvText: string, fileName: string, opts: { historicalImport?: boolean; fileHash?: string; encoding?: "utf8" | "gbk" } = {}) {
    const result = await xiaodouyaConnector.importPostsCsv(csvText, fileName, opts);
    if (result.duplicate) {
      await notificationService.notify({
        type: "data_sync_failed",
        title: "重复文件已跳过",
        message: `文件 ${fileName} 已导入过（同内容检测命中），未重复创建数据。`,
        link: "/connectors/xiaodouya",
        entityType: "data_import_batches",
        entityId: result.batchId,
        severity: "info",
      });
      return result;
    }
    if (result.failedRows > 0) {
      await notificationService.notify({
        type: "data_sync_failed",
        title: `作品导入有 ${result.failedRows} 行失败`,
        message: result.errors[0] ?? "",
        link: "/connectors/xiaodouya",
        entityType: "data_import_batches",
        entityId: result.batchId,
        severity: "warning",
      });
    }
    // 未匹配作品通知
    const unmatched = await connectorRepository.listUnmatchedPosts(result.connectorId, 1);
    if (unmatched.length) {
      await notificationService.notify({
        type: "unmatched_external_post",
        title: "存在未匹配的作品",
        message: `最近有 ${unmatched.length}+ 条作品未匹配 Publication，进入小豆芽工作台手动匹配。`,
        link: "/connectors/xiaodouya",
        entityType: "external_posts",
        severity: "warning",
      });
    }
    return result;
  },

  /** Metric Freshness：Last Captured At + Data Age → Fresh/Aging/Stale（阈值可配置） */
  freshness(ageHours: number, config?: { freshHours?: number; agingHours?: number }): FreshnessLevel {
    const freshHours = config?.freshHours ?? FRESHNESS_DEFAULTS.freshHours;
    const agingHours = config?.agingHours ?? FRESHNESS_DEFAULTS.agingHours;
    if (ageHours < freshHours) return "fresh";
    if (ageHours < agingHours) return "aging";
    return "stale";
  },

  /** 全账号数据新鲜度（工作台 Account Data Freshness 区） */
  async accountFreshness() {
    const accounts = await socialAccountRepository.list();
    const rows: { accountId: string; accountName: string; platform: string; lastCapturedAt: Date | null; ageHours: number; level: FreshnessLevel; followers: number; newFollowers: number }[] = [];
    for (const acc of accounts) {
      const latest = await metricsRepository.getLatestAccountSnapshot(acc.id);
      if (!latest) {
        rows.push({ accountId: acc.id, accountName: acc.accountName, platform: acc.platform, lastCapturedAt: null, ageHours: Infinity, level: "stale", followers: 0, newFollowers: 0 });
        continue;
      }
      const ageHours = (Date.now() - new Date(latest.capturedAt).getTime()) / 3600000;
      rows.push({
        accountId: acc.id,
        accountName: acc.accountName,
        platform: acc.platform,
        lastCapturedAt: latest.capturedAt,
        ageHours,
        level: this.freshness(ageHours),
        followers: latest.followers,
        newFollowers: latest.newFollowers,
      });
    }
    return rows;
  },

  /** 同步留痕：data_sync_jobs */
  async recordSyncJob(connectorId: string, syncType: string, counts: { created?: number; updated?: number; failed?: number }, errorLog?: string) {
    const created = counts.created ?? 0;
    const updated = counts.updated ?? 0;
    const failed = counts.failed ?? 0;
    return connectorRepository.createSyncJob({
      connectorId,
      syncType,
      status: failed > 0 ? "partial" : "completed",
      startedAt: new Date(),
      completedAt: new Date(),
      recordsRead: String(created + updated + failed),
      recordsCreated: String(created),
      recordsUpdated: String(updated),
      recordsFailed: String(failed),
      errorLog,
    });
  },
};

function sqlNameMatch(accountName: string) {
  return sql`${socialAccounts.accountName} = ${accountName}`;
}
