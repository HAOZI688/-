import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accountGrowthBaselines,
  attributionResults,
  attributionRuns,
  externalPosts,
  publications,
  topics,
  type AttributionRun,
} from "@/lib/db/schema";

/**
 * Attribution Repository（V3）：涨粉归因 run / 结果 / 账号增长基线。
 * 页面不直接写 Drizzle（规格 §37）。
 */
export const attributionRepository = {
  /* ===== Runs ===== */
  async createRun(input: Partial<Omit<AttributionRun, "id" | "createdAt">> & { socialAccountId: string; periodStart: Date; periodEnd: Date }) {
    const rows = await db.insert(attributionRuns).values(input as typeof attributionRuns.$inferInsert).returning();
    return rows[0];
  },

  async updateRun(id: string, patch: Partial<Omit<AttributionRun, "id" | "createdAt">>) {
    const rows = await db.update(attributionRuns).set(patch).where(eq(attributionRuns.id, id)).returning();
    return rows[0] ?? null;
  },

  async getRun(id: string) {
    const rows = await db.select().from(attributionRuns).where(eq(attributionRuns.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async listRuns(accountId?: string, limit = 30) {
    return db
      .select()
      .from(attributionRuns)
      .where(accountId ? eq(attributionRuns.socialAccountId, accountId) : undefined)
      .orderBy(desc(attributionRuns.createdAt))
      .limit(limit);
  },

  /** 避免重复 run：同账号同周期已有 completed/failed 则返回 */
  async getRunByPeriod(accountId: string, periodStart: Date, periodEnd: Date) {
    const rows = await db
      .select()
      .from(attributionRuns)
      .where(and(eq(attributionRuns.socialAccountId, accountId), eq(attributionRuns.periodStart, periodStart), eq(attributionRuns.periodEnd, periodEnd)))
      .limit(1);
    return rows[0] ?? null;
  },

  /* ===== Results ===== */
  async createResults(inputs: typeof attributionResults.$inferInsert[]) {
    if (!inputs.length) return [];
    return db.insert(attributionResults).values(inputs).returning();
  },

  async listResults(runId: string) {
    return db
      .select({ result: attributionResults, publication: publications, post: externalPosts, topic: topics })
      .from(attributionResults)
      .leftJoin(publications, eq(attributionResults.publicationId, publications.id))
      .leftJoin(externalPosts, eq(attributionResults.externalPostId, externalPosts.id))
      .leftJoin(topics, eq(attributionResults.topicId, topics.id))
      .where(eq(attributionResults.runId, runId))
      .orderBy(desc(attributionResults.attributionScore));
  },

  /** 某 Topic 在周期内的归因粉丝汇总（Topic Performance V2 输入） */
  async sumByTopic(topicId: string, periodStart?: Date, periodEnd?: Date) {
    const rows = await db
      .select({ total: sql<number>`coalesce(sum(${attributionResults.attributedFollowers}), 0)::int` })
      .from(attributionResults)
      .innerJoin(attributionRuns, eq(attributionResults.runId, attributionRuns.id))
      .where(
        and(
          eq(attributionResults.topicId, topicId),
          periodStart ? sql`${attributionRuns.periodStart} >= ${periodStart}` : undefined,
          periodEnd ? sql`${attributionRuns.periodEnd} <= ${periodEnd}` : undefined,
          sql`${attributionResults.attributionType} != 'unattributed'`,
        ),
      );
    return rows[0]?.total ?? 0;
  },

  /* ===== Account Growth Baselines ===== */
  async upsertBaseline(input: typeof accountGrowthBaselines.$inferInsert) {
    const existing = await db
      .select()
      .from(accountGrowthBaselines)
      .where(
        and(
          eq(accountGrowthBaselines.socialAccountId, input.socialAccountId),
          eq(accountGrowthBaselines.periodStart, input.periodStart),
          eq(accountGrowthBaselines.periodEnd, input.periodEnd),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const rows = await db
        .update(accountGrowthBaselines)
        .set({
          avgDailyGrowth: input.avgDailyGrowth,
          medianDailyGrowth: input.medianDailyGrowth,
          stdDev: input.stdDev,
          anomalyDays: input.anomalyDays,
          sampleDays: input.sampleDays,
        })
        .where(eq(accountGrowthBaselines.id, existing[0].id))
        .returning();
      return rows[0];
    }
    const rows = await db.insert(accountGrowthBaselines).values(input).returning();
    return rows[0];
  },

  async getLatestBaseline(accountId: string) {
    const rows = await db
      .select()
      .from(accountGrowthBaselines)
      .where(eq(accountGrowthBaselines.socialAccountId, accountId))
      .orderBy(desc(accountGrowthBaselines.periodEnd))
      .limit(1);
    return rows[0] ?? null;
  },
};
