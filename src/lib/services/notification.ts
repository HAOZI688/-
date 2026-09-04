import { notificationRepository } from "@/lib/repositories";

/**
 * Notification Service（V3 §27）：基础通知中心。
 * 覆盖：weekly_plan_ready / workflow_failed / content_needs_review /
 * publication_needs_confirmation / data_sync_failed / unmatched_external_post /
 * metrics_stale / trend_p0_detected / attribution_completed。
 * 不做复杂推送；read/unread + link 跳转。
 */

export type NotificationType =
  | "weekly_plan_ready"
  | "workflow_failed"
  | "content_needs_review"
  | "publication_needs_confirmation"
  | "data_sync_failed"
  | "unmatched_external_post"
  | "metrics_stale"
  | "trend_p0_detected"
  | "attribution_completed";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  severity?: "info" | "warning" | "error" | "success";
}

export const notificationService = {
  /** 创建通知（同 type+entity+title 未读去重） */
  async notify(input: NotifyInput) {
    try {
      return await notificationRepository.createDeduped({ ...input, severity: input.severity ?? "info" });
    } catch (e) {
      console.error("notify failed:", e instanceof Error ? e.message : e);
      return null;
    }
  },

  async list(limit = 100) {
    return notificationRepository.list(limit);
  },

  async countUnread() {
    return notificationRepository.countUnread();
  },

  async markRead(id: string) {
    return notificationRepository.markRead(id);
  },

  async markAllRead() {
    return notificationRepository.markAllRead();
  },

  /**
   * 周期性扫掠（Scheduler / 操作后调用，页面不直接写库）：
   * - publication_needs_confirmation：planned/ready 发布计划待确认
   * - metrics_stale：账号最新快照超过 Stale 阈值
   * - trend_p0_detected：current_score >= 9 的未归档趋势
   */
  async sweep() {
    const results: string[] = [];
    try {
      const { db } = await import("@/lib/db");
      const { publications, accountMetricSnapshots, socialAccounts, trends } = await import("@/lib/db/schema");
      const { eq, inArray, desc, or } = await import("drizzle-orm");

      // 1) 待确认发布
      const [pubs, accounts, activeTrends] = await Promise.all([
        db.select().from(publications).where(or(eq(publications.status, "planned"), eq(publications.status, "ready"))).limit(20),
        db.select().from(socialAccounts).limit(50),
        db.select().from(trends).limit(50),
      ]);
      if (pubs.length) {
        await this.notify({
          type: "publication_needs_confirmation",
          title: `${pubs.length} 条发布计划待确认`,
          message: "进入发布确认，完成 Gate 3 人工门禁。",
          link: "/review",
          entityType: "publications",
          severity: "info",
        });
        results.push(`publication x${pubs.length}`);
      }

      // 2) 数据过期（账号最新快照超过 7 天）
      for (const acc of accounts) {
        const rows = await db
          .select()
          .from(accountMetricSnapshots)
          .where(eq(accountMetricSnapshots.socialAccountId, acc.id))
          .orderBy(desc(accountMetricSnapshots.capturedAt))
          .limit(1);
        const latest = rows[0];
        if (!latest) continue;
        const ageDays = (Date.now() - new Date(latest.capturedAt).getTime()) / 86400000;
        if (ageDays > 7) {
          await this.notify({
            type: "metrics_stale",
            title: `账号「${acc.accountName}」数据已过期`,
            message: `最近快照 ${new Date(latest.capturedAt).toLocaleDateString()}，已超过 7 天。请同步小豆芽数据。`,
            link: "/connectors/xiaodouya",
            entityType: "social_accounts",
            entityId: acc.id,
            severity: "warning",
          });
          results.push(`stale:${acc.accountName}`);
        }
      }

      // 3) P0 趋势
      for (const t of activeTrends) {
        if (Number(t.currentScore ?? 0) >= 9 && t.status !== "archived") {
          await this.notify({
            type: "trend_p0_detected",
            title: `P0 趋势「${t.title}」`,
            message: `趋势分 ${t.currentScore}，建议本周生产。`,
            link: `/trend-radar/${t.id}`,
            entityType: "trends",
            entityId: t.id,
            severity: "warning",
          });
          results.push(`trend:${t.title.slice(0, 12)}`);
        }
      }

      return { ok: true, swept: results };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
