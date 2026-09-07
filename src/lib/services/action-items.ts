/**
 * V4 Action Center（规格 §26）：统一「今天需要处理什么」。
 *
 * 来源（sources）：weekly_plan / workflow / review / publication / connector /
 * data_quality / trend / notification。完成对应动作后自动 resolved。
 *
 * 实现方式：syncActionItems() 从系统当前状态推导应有动作清单，
 * 与 action_items 表做 diff —— 新增缺失项、自动 resolve 已消失项（除 dismissed）。
 * Dashboard 每次加载时调用（force-dynamic），保证清单与系统状态一致。
 */
import { db } from "@/lib/db";
import { actionItems } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { orchestratorRepository, workflowRepository, contentRepository, publicationRepository, connectorRepository } from "@/lib/repositories";
import { isLiveMode } from "@/lib/services/live-mode";
import { connectorSyncService } from "@/lib/services/connector-sync";

export type ActionItemType =
  | "weekly_plan"
  | "workflow"
  | "review"
  | "publication"
  | "connector"
  | "data_quality"
  | "trend"
  | "notification";

interface DesiredAction {
  type: ActionItemType;
  priority: "P0" | "P1" | "P2";
  title: string;
  description: string;
  targetUrl: string;
  entityType: string;
  entityId: string;
}

export const actionItemsService = {
  /** 从系统状态推导当前应有的动作清单（幂等 upsert + 自动 resolve） */
  async syncActionItems(): Promise<{ open: number; created: number; resolved: number }> {
    const desired = await this.computeDesired();
    const desiredKeys = new Set(desired.map((d) => `${d.type}:${d.entityType}:${d.entityId}`));

    const existing = await db.select().from(actionItems).where(eq(actionItems.status, "open"));
    const existingKeys = new Set(existing.map((e) => `${e.type}:${e.entityType ?? ""}:${e.entityId ?? ""}`));

    let created = 0;
    // 插入缺失的；已存在的刷新文案（title/description 可能因错误友好化等变化），不动状态
    for (const d of desired) {
      const key = `${d.type}:${d.entityType}:${d.entityId}`;
      if (existingKeys.has(key)) {
        const match = existing.find((e) => `${e.type}:${e.entityType ?? ""}:${e.entityId ?? ""}` === key);
        if (match && (match.title !== d.title || match.description !== d.description || match.targetUrl !== d.targetUrl)) {
          await db.update(actionItems).set({ title: d.title, description: d.description, targetUrl: d.targetUrl }).where(eq(actionItems.id, match.id));
        }
        continue;
      }
      await db.insert(actionItems).values({
        type: d.type,
        priority: d.priority,
        title: d.title,
        description: d.description,
        targetUrl: d.targetUrl,
        status: "open",
        entityType: d.entityType,
        entityId: d.entityId,
      });
      created++;
    }

    // 自动 resolve：系统里已不存在的 open 项（完成动作后条件消失）
    const stale = existing.filter((e) => !desiredKeys.has(`${e.type}:${e.entityType ?? ""}:${e.entityId ?? ""}`));
    let resolved = 0;
    for (const s of stale) {
      await db.update(actionItems).set({ status: "resolved", resolvedAt: new Date() }).where(eq(actionItems.id, s.id));
      resolved++;
    }

    return { open: desired.length, created, resolved };
  },

  /** 推导当前应有动作（7 类来源） */
  async computeDesired(): Promise<DesiredAction[]> {
    const out: DesiredAction[] = [];
    const live = isLiveMode();

    // 1. weekly_plan：本周计划 draft 待确认
    try {
      const plans = await orchestratorRepository.listPlans(4);
      const draft = plans.find((p) => p.status === "draft");
      if (draft) {
        out.push({
          type: "weekly_plan",
          priority: "P1",
          title: "确认本周选题计划",
          description: `本周计划（${draft.weekPrefix}）已生成，等待人工确认后开始生产。`,
          targetUrl: "/review",
          entityType: "weekly_plans",
          entityId: draft.id,
        });
      }
      const confirmed = plans.find((p) => p.status === "confirmed");
      if (confirmed) {
        out.push({
          type: "weekly_plan",
          priority: "P1",
          title: "开始本周生产（DAG）",
          description: `计划 ${confirmed.weekPrefix} 已确认，点击开始生产。`,
          targetUrl: "/review",
          entityType: "weekly_plans",
          entityId: confirmed.id,
        });
      }
    } catch { /* 表可能为空，跳过 */ }

    // 2. workflow：failed / needs_manual runs
    try {
      const runs = await workflowRepository.listRuns(50);
      for (const run of runs) {
        if (run.status === "failed" || run.needsManual) {
          out.push({
            type: "workflow",
            priority: "P1",
            title: `${run.needsManual ? "AI 调用失败需人工介入" : "工作流失败，可重试"}`,
            description: (() => {
          const raw = run.error ?? "";
          const friendly = /Failed query|insert into|update "/i.test(raw)
            ? "内部执行出错（详情见生产监控台），可重试。"
            : raw.slice(0, 80);
          return `${run.workflowType} 运行失败：${friendly}`;
        })(),
            targetUrl: "/production",
            entityType: "workflow_runs",
            entityId: run.id,
          });
        }
      }
    } catch { /* skip */ }

    // 3. review：in_review 内容资产
    try {
      const assets = await contentRepository.listAllAssets(200);
      const inReview = assets.filter((a) => a.asset.status === "in_review");
      for (const { asset } of inReview.slice(0, 20)) {
        out.push({
          type: "review",
          priority: "P1",
          title: `内容待审核：${asset.title.slice(0, 40)}`,
          description: "AI 产出内容等待人工审核（Gate 2）。",
          targetUrl: `/content/${asset.id}`,
          entityType: "content_assets",
          entityId: asset.id,
        });
      }
    } catch { /* skip */ }

    // 4. publication：待确认发布
    try {
      const pubs = await publicationRepository.list();
      for (const { pub, topic } of pubs) {
        if (pub.status === "planned" || pub.status === "ready") {
          out.push({
            type: "publication",
            priority: "P2",
            title: `发布确认：${topic.title.slice(0, 40)}`,
            description: `发布计划 ${pub.status === "planned" ? "待确认就绪" : "待确认排期"}（Gate 3）。`,
            targetUrl: "/publications",
            entityType: "publications",
            entityId: pub.id,
          });
        }
      }
    } catch { /* skip */ }

    // 5. connector：未匹配外部作品
    try {
      const unmatched = await connectorRepository.listUnmatchedPosts(undefined, 50);
      // live 模式排除 seed 导入的作品
      for (const { post } of unmatched) {
        if (live && post.dataSource === "seed") continue;
        out.push({
          type: "connector",
          priority: "P1",
          title: `未匹配作品：${(post.title ?? post.externalPostId).slice(0, 40)}`,
          description: "外部作品未匹配到 Publication，需手动匹配或确认历史导入。",
          targetUrl: "/connectors/xiaodouya",
          entityType: "external_posts",
          entityId: post.id,
        });
      }
    } catch { /* skip */ }

    // 6. data_quality：有失败行的导入批次
    try {
      const batches = await connectorRepository.listImportBatches(20);
      for (const b of batches) {
        const failed = Number(b.failedRows ?? 0);
        if (failed > 0 && (b.status === "partial" || b.status === "failed")) {
          out.push({
            type: "data_quality",
            priority: "P1",
            title: `导入批次有 ${failed} 行失败：${b.fileName.slice(0, 30)}`,
            description: "可重试失败行或导出失败行修正后重新导入。",
            targetUrl: "/connectors/xiaodouya",
            entityType: "data_import_batches",
            entityId: b.id,
          });
        }
      }
    } catch { /* skip */ }

    // 7. connector：指标过期（stale 账号）
    try {
      const freshness = await connectorSyncService.accountFreshness();
      const staleAccounts = freshness.filter((f) => f.level === "stale");
      if (staleAccounts.length > 0) {
        out.push({
          type: "connector",
          priority: "P2",
          title: `${staleAccounts.length} 个账号指标过期`,
          description: `账号数据超过 7 天未同步：${staleAccounts.slice(0, 3).map((s) => s.accountName).join("、")}${staleAccounts.length > 3 ? " 等" : ""}。请重新导入小豆芽数据。`,
          targetUrl: "/connectors/xiaodouya",
          entityType: "social_accounts",
          entityId: "stale-metrics",
        });
      }
    } catch { /* skip */ }

    // 8. B-2：每日抄数提醒——运营已启用 /screen 抄数后，目标平台当天没有新 manual 快照时提醒
    try {
      const TARGET_PLATFORMS = ["douyin", "xiaohongshu", "bilibili", "wechat_video", "wechat"] as const;
      const PLATFORM_CN: Record<string, string> = { douyin: "抖音", xiaohongshu: "小红书", bilibili: "B站", wechat_video: "视频号", wechat: "公众号" };
      const rows = (await db.execute(sql`
        SELECT DISTINCT s.platform
        FROM account_metric_snapshots am
        JOIN social_accounts s ON s.id = am.social_account_id
        WHERE am.data_source = 'manual' AND am.captured_at >= date_trunc('day', now())
      `)) as unknown as { platform: string }[];
      const capturedToday = new Set(rows.map((r) => r.platform));
      const missing = TARGET_PLATFORMS.filter((p) => !capturedToday.has(p));
      // 只有运营已经开始抄数（存在 manual 快照）才每天提醒；完全没有时不打扰（引导在 /data-import）
      const hasAny = (await db.execute(sql`SELECT 1 FROM account_metric_snapshots WHERE data_source='manual' LIMIT 1`)) as unknown as unknown[];
      if (hasAny.length > 0 && missing.length > 0) {
        out.push({
          type: "connector",
          priority: "P2",
          title: "今日数据尚未抄数",
          description: `待抄平台：${missing.map((p) => PLATFORM_CN[p] ?? p).join("、")}。如何抄数：项目目录打开 Claude Code → 小豆芽切到该平台数据页 → 执行 /screen 抄数 → /data-import 一键导入。`,
          targetUrl: "/data-import",
          entityType: "screen_capture",
          entityId: `daily-${new Date().toISOString().slice(0, 10)}`,
        });
      }
    } catch { /* skip */ }

    return out;
  },

  /** Dashboard 首屏：open 动作按优先级排序 */
  async listOpen(limit = 20) {
    return db
      .select()
      .from(actionItems)
      .where(eq(actionItems.status, "open"))
      .orderBy(actionItems.priority, desc(actionItems.createdAt))
      .limit(limit);
  },

  /** 手动 dismiss（运营判断不需要处理） */
  async dismiss(id: string) {
    await db.update(actionItems).set({ status: "dismissed", resolvedAt: new Date() }).where(eq(actionItems.id, id));
  },

  /** 按来源统计（readiness 页用） */
  async countsByType() {
    const rows = await db
      .select({ type: actionItems.type, n: sql<number>`count(*)::int` })
      .from(actionItems)
      .where(eq(actionItems.status, "open"))
      .groupBy(actionItems.type);
    return rows;
  },
};
