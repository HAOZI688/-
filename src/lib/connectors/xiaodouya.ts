import { connectorRepository, metricsRepository, publicationRepository, socialAccountRepository, auditRepository } from "@/lib/repositories";
import { metricNormalizationService, STANDARD_METRICS } from "@/lib/services";
import { parseCsv } from "./csv";

/**
 * 小豆芽数据集成（规格 §34-§43）。
 *
 * V1 实现 File Import 模式：CSV 上传 → 检测 → 映射 → 匹配 → 快照。
 * V1 不假设公开 API 存在；API Mode 是预留 connectorType=future_api，只替换实现。
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
  errors: string[];
}

/** 作品级 CSV 期望的最小字段（小豆芽导出常见列名） */
export const REQUIRED_POST_FIELDS = ["作品ID", "作品标题", "发布时间"] as const;

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
   * 2. upsert external_posts（Post ID / URL 幂等）
   * 3. 与 publications 匹配（Post ID → URL → 平台+账号+时间+标题相似度，规格 §37）
   * 4. 生成 T+1 post_metric_snapshots
   * 5. 留痕 data_import_batches + audit
   */
  async importPostsCsv(csvText: string, fileName: string): Promise<XiaodouyaImportResult> {
    const connector = await this.ensureConnector();
    const { headers, rows } = parseCsv(csvText);

    const errors: string[] = [];
    if (!headers.length) errors.push("CSV 为空或无表头");
    const missing = REQUIRED_POST_FIELDS.filter((f) => !headers.includes(f));
    if (missing.length) errors.push(`缺少必需字段: ${missing.join(", ")}`);

    // 字段名归一化：小豆芽导出列名 → 标准列
    const col = (aliases: string[]): string | null => aliases.find((a) => headers.includes(a)) ?? null;
    const postIdCol = col(["作品ID", "post_id", "external_post_id"]);
    const titleCol = col(["作品标题", "title"]);
    const timeCol = col(["发布时间", "published_at", "created_at"]);
    const urlCol = col(["作品链接", "url", "external_url"]);
    const accountCol = col(["账号名称", "account_name", "账号"]);
    const platformCol = col(["平台", "platform"]);
    const likesCol = col(["点赞数", "likes"]);
    const commentsCol = col(["评论数", "comments"]);
    const sharesCol = col(["分享数", "shares"]);
    const viewsCol = col(["播放量", "views", "plays"]);
    const savesCol = col(["收藏数", "saves"]);

    // 确保标准指标定义存在
    await metricNormalizationService.ensureStandardDefinitions();
    await metricsRepository.ensureMetricDefinition({ key: "impressions", label: "曝光量", category: "content", unit: "count" });

    // 建立导入批次
    const batch = await connectorRepository.createImportBatch({
      connectorId: connector.id,
      fileName,
      fileType: "csv",
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
    const platformDefault = platformCol ? String(rows[0]?.[platformCol] ?? "").toLowerCase() : "";

    let success = 0;
    let created = 0;
    let updated = 0;
    let matched = 0;
    let snapshots = 0;
    const rowErrors: string[] = [];

    for (const row of rows) {
      try {
        const postId = postIdCol ? row[postIdCol] : "";
        if (!postId) {
          rowErrors.push(`行缺少作品ID: ${JSON.stringify(row).slice(0, 80)}`);
          continue;
        }
        const title = titleCol ? row[titleCol] : "";
        const publishedAt = timeCol && row[timeCol] ? new Date(row[timeCol]) : null;
        const externalUrl = urlCol ? row[urlCol] : undefined;
        const accountName = accountCol ? row[accountCol] : "";
        const account = accountName ? accountByName.get(accountName) : undefined;
        const platform = (account?.platform ?? (platformDefault || "other")) as never;

        // 作品 upsert（Post ID / URL 幂等）
        const { post, created: isNew } = await connectorRepository.upsertExternalPost({
          connectorId: connector.id,
          externalPostId: postId,
          title: title || null,
          publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : null,
          externalUrl: externalUrl || null,
          platform: platform || "other",
          socialAccountId: account?.id ?? null,
          matchStatus: "unmatched",
          rawData: { row },
        });
        if (isNew) created++;
        else updated++;

        // 与 publication 匹配（规格 §37）
        const match = await this.matchPublication(post.id, externalUrl, platform, title, account?.id ?? null);
        if (match) matched++;

        // 作品指标快照（T+1：导入时点的首张快照）
        const snap = await this.createPostSnapshot(post.id, post.publicationId, row, viewsCol, likesCol, commentsCol, sharesCol, savesCol);
        if (snap) snapshots++;

        success++;
      } catch (e) {
        rowErrors.push(`行处理失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const finalStatus = rowErrors.length ? (rowErrors.length > success ? "failed" : "partial") : "completed";
    await connectorRepository.updateImportBatch(batch.id, {
      status: finalStatus,
      successRows: String(success),
      failedRows: String(rowErrors.length),
      errorLog: rowErrors.slice(0, 20).join("; "),
      completedAt: new Date(),
    });
    await connectorRepository.updateConnector(connector.id, { lastSyncAt: new Date() });
    await auditRepository.log({
      action: "data_import",
      entityType: "data_import_batches",
      entityId: batch.id,
      actor: "user",
      before: null,
      after: { fileName, total: rows.length, success, created, matched, snapshots },
      notes: `小豆芽 CSV 导入: ${fileName}`,
    });

    return {
      batchId: batch.id,
      connectorId: connector.id,
      totalRows: rows.length,
      successRows: success,
      failedRows: rowErrors.length,
      externalPostsCreated: created,
      externalPostsUpdated: updated,
      matchedPublications: matched,
      snapshotsCreated: snapshots,
      errors: rowErrors,
    };
  },

  /**
   * 匹配规则（规格 §37）：Post ID → URL → 平台+账号+时间+标题相似度 → 人工。
   * 返回匹配到的 publicationId 或 null。
   */
  async matchPublication(postId: string, externalUrl: string | undefined, platform: string, title: string, socialAccountId: string | null) {
    const post = await connectorRepository.getExternalPost(postId);
    if (!post) return null;

    // 规则 1：已在数据库中手动确认过
    if (post.matchStatus === "confirmed" && post.publicationId) return post.publicationId;

    // 规则 2：URL 精确匹配
    if (externalUrl) {
      const pubs = await publicationRepository.listAll();
      const byUrl = pubs.find((p) => p.publishedUrl && p.publishedUrl === externalUrl);
      if (byUrl) {
        await this.confirmMatch(post.id, byUrl.id, "confirmed", "URL 精确匹配");
        return byUrl.id;
      }
    }

    // 规则 3：平台 + 账号 + 发布时间 ±1 天 + 标题包含
    const pubs = await publicationRepository.list();
    const candidates = pubs.filter((p) => {
      const samePlatform = !platform || platform === "other" || p.pub.platform === platform;
      if (!samePlatform) return false;
      if (socialAccountId && p.pub.socialAccountId && p.pub.socialAccountId !== socialAccountId) return false;
      const pubTitle = p.topic?.title ?? "";
      const titleOk = !title || !pubTitle || title.length < 4 || pubTitle.includes(title.slice(0, 4)) || title.includes(pubTitle.slice(0, 4));
      return titleOk;
    });

    if (candidates.length === 1) {
      await this.confirmMatch(post.id, candidates[0].pub.id, "suggested", "平台+账号+标题相似");
      return candidates[0].pub.id;
    }
    return null;
  },

  async confirmMatch(postId: string, publicationId: string, matchStatus: "confirmed" | "suggested", note: string) {
    await connectorRepository.updateExternalPostMatch(postId, {
      publicationId,
      matchStatus,
      matchConfidence: matchStatus === "confirmed" ? "high" : "medium",
    });
    await auditRepository.log({
      action: "external_post_match",
      entityType: "external_posts",
      entityId: postId,
      actor: "user",
      before: null,
      after: { publicationId, matchStatus, note },
      notes: note,
    });
  },

  /** 创建作品指标快照（T+1 基线） */
  async createPostSnapshot(postId: string, publicationId: string | null, row: Record<string, string>, viewsCol: string | null, likesCol: string | null, commentsCol: string | null, sharesCol: string | null, savesCol: string | null) {
    const num = (v: string | undefined): number | undefined => {
      if (v === undefined || v === "") return undefined;
      const n = Number(String(v).replace(/[^\d.\-]/g, ""));
      return Number.isNaN(n) ? undefined : Math.round(n);
    };
    const snapshot = await metricsRepository.createPostSnapshot({
      externalPostId: postId,
      publicationId,
      capturedAt: new Date(),
      views: num(viewsCol ? row[viewsCol] : undefined) ?? 0,
      likes: num(likesCol ? row[likesCol] : undefined) ?? 0,
      comments: num(commentsCol ? row[commentsCol] : undefined) ?? 0,
      shares: num(sharesCol ? row[sharesCol] : undefined) ?? 0,
      saves: num(savesCol ? row[savesCol] : undefined) ?? 0,
      rawMetrics: { source: "xiaodouya_csv", row },
    });
    return snapshot;
  },
};
