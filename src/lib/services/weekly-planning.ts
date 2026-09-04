import { topicRepository } from "@/lib/repositories";

/**
 * Weekly Planning Service（规格 §63）：每周选题 + 产能检查。
 * Orchestrator 每周入口：把 ready_for_production/producing 的 Topic 按优先级排产，
 * 并基于本周已运行 workflow run 数量做产能限制（V1 简单计数，可扩展为表）。
 */
export interface WeeklyPlanItem {
  topicId: string;
  title: string;
  priority: string;
  topicScore: string | null;
  workflowType: "ai_weekly" | "github_weekly" | "evergreen" | "wechat_deep_dive";
}

export const weeklyPlanningService = {
  /**
   * 计算本周已用产能：本周 workflow_runs 中指定 workflow 类型数量。
   */
  async capacityUsed(weekPrefix: string): Promise<number> {
    const runs = await listRunsThisWeek(weekPrefix);
    return runs;
  },

  /**
   * 生成本周排产计划。
   * @param weekPrefix 如 2026W36
   * @param capacity 本周产能上限（V1 常量，后续可配置）
   */
  async planWeek(weekPrefix: string, capacity = 5): Promise<{ plan: WeeklyPlanItem[]; capacityUsed: number; capacity: number }> {
    const [pool, capacityUsed] = await Promise.all([
      topicRepository.listByStatus("ready_for_production"),
      this.capacityUsed(weekPrefix),
    ]);

    // 按 priority(P0→P3) 升序、topicScore 降序排序（numeric 列以字符串返回，转数值比较）
    const ordered = [...pool].sort((a, b) => {
      const pa = a.priority === "P0" ? 0 : a.priority === "P1" ? 1 : a.priority === "P2" ? 2 : 3;
      const pb = b.priority === "P0" ? 0 : b.priority === "P1" ? 1 : b.priority === "P2" ? 2 : 3;
      if (pa !== pb) return pa - pb;
      return Number(b.topicScore ?? 0) - Number(a.topicScore ?? 0);
    });

    const remaining = Math.max(0, capacity - capacityUsed);
    const plan: WeeklyPlanItem[] = ordered.slice(0, remaining).map((t) => ({
      topicId: t.id,
      title: t.title,
      priority: t.priority,
      topicScore: t.topicScore,
      workflowType: pickWorkflowType(t),
    }));

    return { plan, capacityUsed, capacity };
  },
};

/** 按 Topic 类型/标签选工作流（V1 启发式，可接评分 config） */
function pickWorkflowType(topic: { topicType: string; trendTags?: string[] | null }): WeeklyPlanItem["workflowType"] {
  if (topic.topicType === "technical_project") return "github_weekly";
  if (topic.topicType === "knowledge" || topic.topicType === "evergreen") return "evergreen";
  if (topic.trendTags?.some((t) => /微信|公众号|深度/.test(t))) return "wechat_deep_dive";
  return "ai_weekly";
}

import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflowRuns } from "@/lib/db/schema";

async function listRunsThisWeek(weekPrefix: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workflowRuns)
    .where(sql`${workflowRuns.batchId} like ${weekPrefix + "%"}`);
  return rows[0]?.count ?? 0;
}
