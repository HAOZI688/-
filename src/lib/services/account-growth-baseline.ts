import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { accountMetricSnapshots } from "@/lib/db/schema";
import { attributionRepository } from "@/lib/repositories";

/**
 * Account Growth Baseline Service（V3 §20）：
 * 每个 Social Account 计算过去 28 天滚动日均自然增长基线。
 * 排除异常增长日（> 2σ 或单日爆发，如发布爆款当天），避免把内容驱动的增长算进基线。
 */
export const accountGrowthBaselineService = {
  /**
   * 计算并落库基线（幂等 upsert：同账号同周期覆盖）。
   * 无足够快照（< 3 天）时返回 null（调用方降级处理）。
   */
  async computeBaseline(socialAccountId: string, windowDays = 28) {
    const now = new Date();
    const start = new Date(now.getTime() - windowDays * 86400000);

    const snaps = await db
      .select()
      .from(accountMetricSnapshots)
      .where(and(eq(accountMetricSnapshots.socialAccountId, socialAccountId), gte(accountMetricSnapshots.capturedAt, start), lte(accountMetricSnapshots.capturedAt, now)))
      .orderBy(asc(accountMetricSnapshots.capturedAt));

    if (snaps.length < 3) return null;

    // 日增长序列（快照间 delta / 天数）
    const daily: number[] = [];
    for (let i = 1; i < snaps.length; i++) {
      const prev = snaps[i - 1];
      const cur = snaps[i];
      const days = Math.max(1, (cur.capturedAt.getTime() - prev.capturedAt.getTime()) / 86400000);
      const delta = cur.followers - prev.followers;
      if (days <= 7) daily.push(delta / days);
    }
    if (daily.length < 2) return null;

    const mean = daily.reduce((a, b) => a + b, 0) / daily.length;
    const variance = daily.reduce((a, b) => a + (b - mean) ** 2, 0) / daily.length;
    const std = Math.sqrt(variance);

    // 排除异常日：|x − mean| > 2σ 或单日 > 5×median（爆发日）
    const sorted = [...daily].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const normal = daily.filter((d) => Math.abs(d - mean) <= 2 * std && d <= Math.max(1, median * 5));

    const avgDaily = normal.length ? normal.reduce((a, b) => a + b, 0) / normal.length : mean;
    const normalSorted = [...normal].sort((a, b) => a - b);
    const normalMedian = normalSorted.length ? normalSorted[Math.floor(normalSorted.length / 2)] : median;
    const normalStd = normal.length ? Math.sqrt(normal.reduce((a, b) => a + (b - avgDaily) ** 2, 0) / normal.length) : std;

    return attributionRepository.upsertBaseline({
      socialAccountId,
      periodStart: start,
      periodEnd: now,
      avgDailyGrowth: String(Math.round(avgDaily * 100) / 100),
      medianDailyGrowth: String(Math.round(normalMedian * 100) / 100),
      stdDev: String(Math.round(normalStd * 100) / 100),
      anomalyDays: daily.length - normal.length,
      sampleDays: daily.length,
    });
  },

  /** 全部账号补算基线（Scheduler / action 入口） */
  async computeAll() {
    const { socialAccountRepository } = await import("@/lib/repositories");
    const accounts = await socialAccountRepository.list();
    const results: { account: string; ok: boolean }[] = [];
    for (const acc of accounts) {
      try {
        const baseline = await this.computeBaseline(acc.id);
        results.push({ account: acc.accountName, ok: !!baseline });
      } catch (e) {
        results.push({ account: acc.accountName, ok: false });
      }
    }
    return results;
  },
};
