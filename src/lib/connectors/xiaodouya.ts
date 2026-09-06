import { connectorRepository, metricsRepository, publicationRepository, socialAccountRepository, auditRepository } from "@/lib/repositories";
import { metricNormalizationService } from "@/lib/services";
import { parseCsv, parseNumber, parseDate, parseDateLocal, DATE_COLUMN_ALIASES, type CsvRow } from "./csv";
import { createHash } from "node:crypto";

/**
 * 小豆芽数据集成（规格 §34-§43）。
 *
 * V1 实现 File Import 模式：CSV 上传 → 检测 → 映射 → 匹配 → 快照。
 * V1 不假设公开 API 存在；API Mode 是预留 connectorType=future_api，只替换实现。
 *
 * V4 生产化（规格 §15-§19 / §21）：
 * - 重复文件检测：同 fileHash + 同 dataType 已完成批次 → 跳过（不静默重复）
 * - 行级错误：失败行结构化落库（rowIndex/row/error），支撑 Retry Failed Rows / Export Failed Rows
 * - 历史导入模式：historicalImport=1，无 Publication 对应不算失败（允许后绑）
 * - 匹配优先级链：external_post_id → external_url → platform+account+published_at → title_similarity → manual
 * - 匹配留痕：match_method / match_confidence / matched_at / manual_confirmed_by
 */

export interface XiaodouyaImportResult {
  batchId: string;
  connectorId: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  externalPostsCreated: number;
  externalPostsUpdated: number;
  matchedPublications: number;
  snapshotsCreated: number;
  /** B-1：幂等统计（快照 updated）+ 匹配计数 */
  snapshotsUpdated?: number;
  postsMatched?: number;
  unmatchedPosts?: number;
  /** 重复文件跳过（未新建批次，返回已有批次 ID） */
  duplicate?: boolean;
  errors: string[];
}

export interface XiaodouyaImportOptions {
  /** 历史导入：无 Publication 对应不算失败，标记 historical_import=1 */
  historicalImport?: boolean;
  /** 文件内容 SHA-256（重复检测） */
  fileHash?: string;
  /** 检测到的编码（utf8/gbk），留痕用 */
  encoding?: "utf8" | "gbk";
  /**
   * B-1：数据来源（落 external_posts / post_metric_snapshots.data_source）。
   * 抄数 CSV 用 "manual"（Live Mode 视为真实数据）；默认小豆芽导入。
   */
  dataSource?: "manual" | "xiaodouya_import" | "historical_import";
}

/** 作品级 CSV 期望的最小字段（小豆芽导出常见列名）；manual 抄数无作品ID 时按标题生成稳定 ID */
export const REQUIRED_POST_FIELDS = ["作品ID", "作品标题", "发布时间"] as const;

/** B-1：无作品ID 时生成确定性外部 ID（同一标题+账号+平台重复导入 → 同一 post，幂等） */
function stableManualPostId(platform: string, accountName: string, title: string): string {
  const hash = createHash("sha1").update(`${platform}|${accountName}|${title}`).digest("hex").slice(0, 16);
  return `manual_${hash}`;
}

export const xiaodouyaConnector = {
  /**
   * 获取或创建小豆芽连接器（幂等，按 name 查重）。
   */
  async ensureConnector() {
    const connectors = await connectorRepository.listConnectors();
    const existing = connectors.find((c) => c.connectorType === "xiaodouya");
    if (existing) return existing;
    const created = await connectorRepository.createConnector({
      name: "小豆芽数据连接器",
      connectorType: "xiaodouya",
      status: "active",
      config: { mode: "file_import", note: "V1 File Import 模式（规格 §34）" },
    });
    return created;
  },

  /**
   * 小豆芽作品 CSV 导入全流程：
   * 1. 解析 CSV → 检测必需字段
   * 2. 重复文件检测（同 fileHash 已完成批次 → 跳过）
   * 3. upsert external_posts（Post ID / URL 幂等）
   * 4. 与 publications 匹配（优先级链，规格 §21）
   * 5. 生成 T+1 post_metric_snapshots
   * 6. 留痕 data_import_batches + audit（失败行结构化落库）
   */
  async importPostsCsv(csvText: string, fileName: string, opts: XiaodouyaImportOptions = {}): Promise<XiaodouyaImportResult> {
    const connector = await this.ensureConnector();
    const { headers, rows } = parseCsv(csvText);
    const historical = opts.historicalImport ?? false;

    // 重复文件检测：同 hash 已完成/部分成功批次 → 直接跳过
    if (opts.fileHash) {
      const dup = await connectorRepository.findDuplicateBatch(opts.fileHash, "posts");
      if (dup) {
        await auditRepository.log({
          action: "data_import",
          entityType: "data_import_batches",
          entityId: dup.id,
          actor: "user",
          before: null,
          after: { fileName, duplicate: true, originalBatch: dup.id },
          notes: `重复文件跳过（已有批次 ${dup.id.slice(0, 8)}）`,
        });
        return { batchId: dup.id, connectorId: connector.id, totalRows: rows.length, successRows: 0, failedRows: 0, externalPostsCreated: 0, externalPostsUpdated: 0, matchedPublications: 0, snapshotsCreated: 0, duplicate: true, errors: [] };
      }
    }

    const errors: string[] = [];
    if (!headers.length) errors.push("CSV 为空或无表头");
    const titleColPre = headers.find((h) => ["作品标题", "title"].includes(h));
    if (!titleColPre) errors.push("缺少必需字段: 作品标题");
    // 小豆芽导出必须三件套；manual 抄数允许无作品ID/发布时间（按标题生成稳定 ID，日期列做快照时间）
    if (!opts.dataSource || opts.dataSource === "xiaodouya_import") {
      const missing = REQUIRED_POST_FIELDS.filter((f) => !headers.includes(f));
      if (missing.length) errors.push(`缺少必需字段: ${missing.join(", ")}`);
    }

    // 字段名归一化：小豆芽导出列名 → 标准列（B-1 扩充抄数列：日期/阅读/曝光/完播率/主页访问）
    const col = (aliases: string[]): string | null => aliases.find((a) => headers.includes(a)) ?? null;
    const postIdCol = col(["作品ID", "post_id", "external_post_id"]);
    const titleCol = col(["作品标题", "title"]);
    const timeCol = col(["发布时间", "published_at", "created_at"]);
    const capturedCol = col(DATE_COLUMN_ALIASES);
    const urlCol = col(["作品链接", "url", "external_url"]);
    const accountCol = col(["账号名称", "account_name", "账号"]);
    const platformCol = col(["平台", "platform"]);
    const likesCol = col(["点赞数", "likes"]);
    const commentsCol = col(["评论数", "comments"]);
    const sharesCol = col(["分享数", "shares"]);
    const viewsCol = col(["播放量", "views", "plays"]);
    const savesCol = col(["收藏数", "saves"]);
    const readsCol = col(["阅读量", "reads"]);
    const impressionsCol = col(["曝光量", "impressions"]);
    const completionCol = col(["完播率", "completion_rate"]);
    const profileVisitsCol = col(["主页访问", "主页访问量", "profile_visits"]);

    // 确保标准指标定义存在
    await metricNormalizationService.ensureStandardDefinitions();
    await metricsRepository.ensureMetricDefinition({ key: "impressions", label: "曝光量", category: "content", unit: "count" });

    // 建立导入批次
    const batch = await connectorRepository.createImportBatch({
      connectorId: connector.id,
      fileName,
      fileType: "csv",
      dataType: "posts",
      fileHash: opts.fileHash ?? null,
      fileHeaders: headers as never,
      historicalImport: historical ? 1 : 0,
      status: errors.length ? "failed" : "importing",
      totalRows: String(rows.length),
    });

    if (errors.length) {
      await connectorRepository.updateImportBatch(batch.id, { status: "failed", errorLog: errors.join("; ") });
      return { batchId: batch.id, connectorId: connector.id, totalRows: 0, successRows: 0, failedRows: rows.length, externalPostsCreated: 0, externalPostsUpdated: 0, matchedPublications: 0, snapshotsCreated: 0, errors };
    }

    // 账号映射：小豆芽 CSV 内账号名 → social_accounts
    const accounts = await socialAccountRepository.list();
    const accountByName = new Map(accounts.map((a) => [a.accountName, a]));
    const platformDefault = platformCol ? String(rows[0]?.data[platformCol] ?? "").toLowerCase() : "";

    let success = 0;
    let created = 0;
    let updated = 0;
    let matched = 0;
    let snapshots = 0;
    let snapshotsUpdated = 0;
    const failedRowData: { rowIndex: number; row: Record<string, string>; error: string }[] = [];
    const dataSource = opts.dataSource ?? "xiaodouya_import";

    for (const { data: row, rowIndex } of rows) {
      try {
        let postId = postIdCol ? row[postIdCol] : "";
        const title = titleCol ? row[titleCol] : "";
        // B-1：manual 抄数无作品ID → 按平台+账号+标题生成确定性 ID（重复导入幂等）
        if (!postId && !title) {
          failedRowData.push({ rowIndex, row, error: "行缺少作品ID 且缺少作品标题（二者至少其一）: " + JSON.stringify(row).slice(0, 80) });
          continue;
        }
        if (!postId) {
          const accountNamePre = accountCol ? row[accountCol] : "";
          postId = stableManualPostId(String(platformDefault || "other"), accountNamePre, title);
        }
        const publishedAt = timeCol ? parseDate(row[timeCol]) : null;
        // B-1：日期列 → captured_at（数据实际日期，不用系统时间；本地时区稳定 timestamp）
        const capturedAt = capturedCol ? parseDateLocal(row[capturedCol]) : null;
        if (capturedCol && row[capturedCol] && !capturedAt) {
          failedRowData.push({ rowIndex, row, error: `列[${capturedCol}] 值[${row[capturedCol]}] 无法解析为日期` });
          continue;
        }
        const externalUrl = urlCol ? row[urlCol] : undefined;
        const accountName = accountCol ? row[accountCol] : "";
        const account = accountName ? accountByName.get(accountName) : undefined;
        const platform = (account?.platform ?? (platformDefault || "other")) as never;

        // 作品 upsert（Post ID / URL 幂等；历史导入标记 historical_import + data_source）
        const { post, created: isNew } = await connectorRepository.upsertExternalPost({
          connectorId: connector.id,
          externalPostId: postId,
          title: title || null,
          publishedAt,
          externalUrl: externalUrl || null,
          platform: platform || "other",
          socialAccountId: account?.id ?? null,
          matchStatus: "unmatched",
          historicalImport: historical ? 1 : undefined,
          dataSource,
          rawData: { row, encoding: opts.encoding ?? null, fileName },
        });
        if (isNew) created++;
        else updated++;

        // 与 publication 匹配（优先级链：ID → URL → 平台+账号+时间 → 标题相似 → manual）
        const match = await this.matchPublication(post.id, externalUrl, platform, title, account?.id ?? null, publishedAt);
        if (match) matched++;

        // 作品指标快照（日期列做 captured_at；幂等：同 post+日期+来源 → updated 不重复建）
        const snap = await this.createPostSnapshot({
          postId: post.id,
          publicationId: post.publicationId,
          row,
          cols: { viewsCol, likesCol, commentsCol, sharesCol, savesCol, readsCol, impressionsCol, completionCol, profileVisitsCol },
          capturedAt: capturedAt ?? new Date(),
          dataSource,
        });
        if (snap.status === "created") snapshots++;
        else snapshotsUpdated++;

        success++;
      } catch (e) {
        failedRowData.push({ rowIndex, row, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const finalStatus = failedRowData.length ? (failedRowData.length > success ? "failed" : "partial") : "completed";
    await connectorRepository.updateImportBatch(batch.id, {
      status: finalStatus,
      successRows: String(success),
      failedRows: String(failedRowData.length),
      failedRowData: failedRowData as never,
      errorLog: failedRowData.slice(0, 20).map((f) => `第${f.rowIndex}行: ${f.error}`).join("; "),
      completedAt: new Date(),
    });
    await connectorRepository.updateConnector(connector.id, { lastSyncAt: new Date() });
    await auditRepository.log({
      action: "data_import",
      entityType: "data_import_batches",
      entityId: batch.id,
      actor: "user",
      before: null,
      after: { fileName, total: rows.length, success, created, matched, snapshots, historical },
      notes: `小豆芽 CSV 导入: ${fileName}`,
    });

    return {
      batchId: batch.id,
      connectorId: connector.id,
      totalRows: rows.length,
      successRows: success,
      failedRows: failedRowData.length,
      externalPostsCreated: created,
      externalPostsUpdated: updated,
      matchedPublications: matched,
      snapshotsCreated: snapshots,
      snapshotsUpdated,
      postsMatched: matched,
      unmatchedPosts: success - matched,
      errors: failedRowData.map((f) => `第${f.rowIndex}行: ${f.error}`),
    };
  },

  /**
   * 匹配优先级链（规格 §21）：
   * 1. external_post_id：已绑定 publicationId 且手动确认（外部作品 ID 直接命中）
   * 2. external_url：publishedUrl 精确匹配
   * 3. platform + account + published_at ±1 天
   * 4. title_similarity：平台+账号+标题相似
   * 5. manual：人工兜底（本函数不执行，返回 null 进入未匹配列表）
   * 每次命中写入 match_method / match_confidence / matched_at。
   */
  async matchPublication(postId: string, externalUrl: string | undefined, platform: string, title: string, socialAccountId: string | null, publishedAt: Date | null = null) {
    const post = await connectorRepository.getExternalPost(postId);
    if (!post) return null;

    // 规则 1：已在数据库中确认过（external_post_id 绑定）
    if (post.matchStatus === "confirmed" && post.publicationId) {
      await this.confirmMatch(post.id, post.publicationId, "confirmed", "external_post_id", "外部作品 ID 已绑定");
      return post.publicationId;
    }

    // 规则 2：URL 精确匹配
    if (externalUrl) {
      const pubs = await publicationRepository.listAll();
      const byUrl = pubs.find((p) => p.publishedUrl && p.publishedUrl === externalUrl);
      if (byUrl) {
        await this.confirmMatch(post.id, byUrl.id, "confirmed", "external_url", "URL 精确匹配");
        return byUrl.id;
      }
    }

    // 规则 3：平台 + 账号 + 发布时间 ±1 天
    const pubs = await publicationRepository.list();
    if (publishedAt) {
      const timeCandidates = pubs.filter((p) => {
        const samePlatform = !platform || platform === "other" || p.pub.platform === platform;
        if (!samePlatform) return false;
        if (socialAccountId && p.pub.socialAccountId && p.pub.socialAccountId !== socialAccountId) return false;
        const pubDate = p.pub.publishedDate ?? (p.pub.scheduledDate ? new Date(p.pub.scheduledDate) : null);
        if (!pubDate) return false;
        const diffMs = Math.abs(pubDate.getTime() - publishedAt.getTime());
        return diffMs <= 86400000; // ±1 天
      });
      if (timeCandidates.length === 1) {
        await this.confirmMatch(post.id, timeCandidates[0].pub.id, "suggested", "platform_time", "平台+账号+发布时间 ±1 天匹配");
        return timeCandidates[0].pub.id;
      }
    }

    // 规则 4：平台 + 账号 + 标题相似（标题 >= 4 字才参与）
    const titleCandidates = pubs.filter((p) => {
      const samePlatform = !platform || platform === "other" || p.pub.platform === platform;
      if (!samePlatform) return false;
      if (socialAccountId && p.pub.socialAccountId && p.pub.socialAccountId !== socialAccountId) return false;
      const pubTitle = p.topic?.title ?? "";
      if (!title || !pubTitle || title.length < 4) return false;
      return pubTitle.includes(title.slice(0, 4)) || title.includes(pubTitle.slice(0, 4));
    });

    if (titleCandidates.length === 1) {
      await this.confirmMatch(post.id, titleCandidates[0].pub.id, "suggested", "title_similarity", "平台+账号+标题相似匹配");
      return titleCandidates[0].pub.id;
    }
    return null;
  },

  async confirmMatch(postId: string, publicationId: string, matchStatus: "confirmed" | "suggested", matchMethod: string, note: string) {
    await connectorRepository.updateExternalPostMatch(postId, {
      publicationId,
      matchStatus,
      matchConfidence: matchStatus === "confirmed" ? "high" : "medium",
    });
    // V4：match_method / matched_at 留痕
    await connectorRepository.setExternalPostMatchMeta(postId, { matchMethod, matchedAt: new Date() });
    await auditRepository.log({
      action: "external_post_match",
      entityType: "external_posts",
      entityId: postId,
      actor: "system",
      before: null,
      after: { publicationId, matchStatus, matchMethod, note },
      notes: note,
    });
  },

  /** 创建作品指标快照（T+1 基线；V4 用 parseNumber 支持 万/千分位） */
  /**
   * B-1：作品快照（幂等 upsert：external_post_id + captured_at + data_source）。
   * 扩展指标：阅读/曝光/完播率/主页访问（标准列）+ 全行原始数据（rawMetrics）。
   */
  async createPostSnapshot(input: {
    postId: string;
    publicationId: string | null;
    row: Record<string, string>;
    cols: { viewsCol: string | null; likesCol: string | null; commentsCol: string | null; sharesCol: string | null; savesCol: string | null; readsCol: string | null; impressionsCol: string | null; completionCol: string | null; profileVisitsCol: string | null };
    capturedAt: Date;
    dataSource: string;
  }) {
    const { row, cols } = input;
    const completionRaw = cols.completionCol ? row[cols.completionCol] : undefined;
    const snapshot = await metricsRepository.upsertPostSnapshot({
      externalPostId: input.postId,
      publicationId: input.publicationId,
      capturedAt: input.capturedAt,
      views: parseNumber(cols.viewsCol ? row[cols.viewsCol] : undefined) ?? 0,
      likes: parseNumber(cols.likesCol ? row[cols.likesCol] : undefined) ?? 0,
      comments: parseNumber(cols.commentsCol ? row[cols.commentsCol] : undefined) ?? 0,
      shares: parseNumber(cols.sharesCol ? row[cols.sharesCol] : undefined) ?? 0,
      saves: parseNumber(cols.savesCol ? row[cols.savesCol] : undefined) ?? 0,
      reads: parseNumber(cols.readsCol ? row[cols.readsCol] : undefined) ?? 0,
      impressions: parseNumber(cols.impressionsCol ? row[cols.impressionsCol] : undefined) ?? 0,
      profileVisits: parseNumber(cols.profileVisitsCol ? row[cols.profileVisitsCol] : undefined) ?? 0,
      completionRate: completionRaw && parseNumber(completionRaw) !== undefined ? String(parseNumber(completionRaw)) : null,
      dataSource: input.dataSource,
      rawMetrics: { source: input.dataSource === "manual" ? "manual_csv" : "xiaodouya_csv", row },
    } as never);
    return snapshot;
  },
};
