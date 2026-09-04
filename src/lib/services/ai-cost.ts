/**
 * V4 AI 成本统计（规格 §39）：每周每工作流成本 + 总成本 + 平均单篇已发布内容成本。
 * 数据来源：ai_usage_logs（run 级 token/cost 留痕）+ workflow_runs（workflowType）。
 */
import { db } from "@/lib/db";
import { aiUsageLogs, workflowRuns, publications } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export interface WorkflowCostRow {
  workflowType: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  avgLatencyMs: number;
  retryRate: number;
}

function weekStart(now = new Date()): Date {
  const d = new Date(now);
  const day = d.getDay() === 0 ? 7 : d.getDay(); // 周一为一周开始
  d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export const aiCostService = {
  /** 本周每工作流成本汇总 */
  async weeklyByWorkflow(periodStart?: Date): Promise<WorkflowCostRow[]> {
    const since = periodStart ?? weekStart();
    const rows = await db
      .select({
        workflowType: workflowRuns.workflowType,
        calls: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${aiUsageLogs.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiUsageLogs.outputTokens}), 0)::int`,
        costUsd: sql<number>`coalesce(sum(${aiUsageLogs.cost}), 0)::float`,
        avgLatencyMs: sql<number>`coalesce(avg(${aiUsageLogs.latency}), 0)::float`,
        retries: sql<number>`coalesce(sum(${aiUsageLogs.retryCount}), 0)::int`,
      })
      .from(aiUsageLogs)
      .innerJoin(workflowRuns, eq(aiUsageLogs.workflowRunId, workflowRuns.id))
      .where(gte(aiUsageLogs.createdAt, since))
      .groupBy(workflowRuns.workflowType);

    return rows.map((r) => ({
      ...r,
      avgLatencyMs: Math.round(r.avgLatencyMs),
      retryRate: r.calls > 0 ? r.retries / r.calls : 0,
    }));
  },

  /** 本周总成本 + 平均单篇已发布内容成本（published 的 publication 数） */
  async weeklyTotal(periodStart?: Date) {
    const since = periodStart ?? weekStart();
    const [cost] = await db
      .select({
        calls: sql<number>`count(*)::int`,
        costUsd: sql<number>`coalesce(sum(${aiUsageLogs.cost}), 0)::float`,
        inputTokens: sql<number>`coalesce(sum(${aiUsageLogs.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiUsageLogs.outputTokens}), 0)::int`,
      })
      .from(aiUsageLogs)
      .where(gte(aiUsageLogs.createdAt, since));

    const [pubCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(publications)
      .where(and(eq(publications.status, "published"), gte(publications.updatedAt, since)));

    const published = pubCount?.n ?? 0;
    const costUsd = cost?.costUsd ?? 0;
    return {
      calls: cost?.calls ?? 0,
      inputTokens: cost?.inputTokens ?? 0,
      outputTokens: cost?.outputTokens ?? 0,
      costUsd,
      publishedAssets: published,
      avgCostPerPublished: published > 0 ? costUsd / published : null,
    };
  },
};
