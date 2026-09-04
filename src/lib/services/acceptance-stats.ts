/**
 * V4 内容验收统计（规格 §38）：AI Content Acceptance Rate。
 *
 * 按 workflow + 周期（周）聚合：generated / approved_directly / approved_after_edit /
 * rejected / revision_count。支撑 Acceptance Rate = (approved_directly + approved_after_edit) / generated。
 * 数据来源：Review Workbench 审核动作（approveAssetAction / revisionAssetAction / 内容页修改后通过）。
 */
import { db } from "@/lib/db";
import { contentAcceptanceStats, workflowRuns, contentAssets } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

/** 当前周期（ISO 周，如 2026W36） */
export function currentPeriod(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  const week = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}W${String(week).padStart(2, "0")}`;
}

/** 从 content_asset 反查生产它的 workflow（通过 workflow_tasks.output → contentAssetId 或 run 关联） */
async function workflowTypeOfAsset(assetId: string): Promise<string | null> {
  // 路径：workflow_runs.topicId → content_assets.topicId；用 run 的 workflowType
  const asset = await db.select({ topicId: contentAssets.topicId }).from(contentAssets).where(eq(contentAssets.id, assetId)).limit(1);
  if (!asset[0]) return null;
  const runs = await db
    .select({ workflowType: workflowRuns.workflowType })
    .from(workflowRuns)
    .where(eq(workflowRuns.topicId, asset[0].topicId))
    .orderBy(desc(workflowRuns.createdAt))
    .limit(1);
  return runs[0]?.workflowType ?? null;
}

export interface AcceptanceRecord {
  /** 至少一项 */
  approvedDirectly?: number;
  approvedAfterEdit?: number;
  rejected?: number;
  revisionCount?: number;
  /** 默认 0 */
  generated?: number;
  period?: string;
}

export const acceptanceStatsService = {
  /** AI 生成资产数（writeback 时记录） */
  async recordGenerated(workflowType: string, count: number, period?: string) {
    const p = period ?? currentPeriod();
    const existing = await db
      .select()
      .from(contentAcceptanceStats)
      .where(and(eq(contentAcceptanceStats.workflowType, workflowType), eq(contentAcceptanceStats.period, p)))
      .limit(1);
    if (existing[0]) {
      await db.update(contentAcceptanceStats).set({ generated: existing[0].generated + count }).where(eq(contentAcceptanceStats.id, existing[0].id));
    } else {
      await db.insert(contentAcceptanceStats).values({ workflowType, period: p, generated: count });
    }
  },

  async record(asset: { id: string; assetType?: string | null }, input: AcceptanceRecord) {
    const workflowType = (await workflowTypeOfAsset(asset.id)) ?? "unknown";
    const period = input.period ?? currentPeriod();

    const existing = await db
      .select()
      .from(contentAcceptanceStats)
      .where(and(eq(contentAcceptanceStats.workflowType, workflowType), eq(contentAcceptanceStats.period, period)))
      .limit(1);

    if (existing[0]) {
      await db
        .update(contentAcceptanceStats)
        .set({
          approvedDirectly: existing[0].approvedDirectly + (input.approvedDirectly ?? 0),
          approvedAfterEdit: existing[0].approvedAfterEdit + (input.approvedAfterEdit ?? 0),
          rejected: existing[0].rejected + (input.rejected ?? 0),
          revisionCount: existing[0].revisionCount + (input.revisionCount ?? 0),
        })
        .where(eq(contentAcceptanceStats.id, existing[0].id));
    } else {
      await db.insert(contentAcceptanceStats).values({
        workflowType,
        period,
        generated: input.generated ?? 0,
        approvedDirectly: input.approvedDirectly ?? 0,
        approvedAfterEdit: input.approvedAfterEdit ?? 0,
        rejected: input.rejected ?? 0,
        revisionCount: input.revisionCount ?? 0,
      });
    }
  },

  /** 本周各 workflow 验收汇总（生成/通过/打回/通过率/平均修订次数） */
  async weeklySummary(period?: string) {
    const p = period ?? currentPeriod();
    const rows = await db
      .select()
      .from(contentAcceptanceStats)
      .where(eq(contentAcceptanceStats.period, p))
      .orderBy(desc(contentAcceptanceStats.generated));
    return rows.map((r) => ({
      workflowType: r.workflowType,
      generated: r.generated,
      approvedDirectly: r.approvedDirectly,
      approvedAfterEdit: r.approvedAfterEdit,
      rejected: r.rejected,
      revisionCount: r.revisionCount,
      acceptanceRate: r.generated > 0 ? ((r.approvedDirectly + r.approvedAfterEdit) / r.generated) * 100 : null,
      avgRevisions: r.approvedAfterEdit > 0 ? r.revisionCount / (r.approvedDirectly + r.approvedAfterEdit) : 0,
    }));
  },
};
