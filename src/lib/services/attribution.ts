import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accountMetricSnapshots,
  attributionResults,
  externalPosts,
  postMetricSnapshots,
  publications,
  topics,
  type AttributionResult,
} from "@/lib/db/schema";
import { attributionRepository, metricsRepository, socialAccountRepository } from "@/lib/repositories";
import { notificationService } from "@/lib/services/notification";

/**
 * Follower Attribution Engine（V3 §17-§20）：V1 可解释规则模型，不依赖 LLM 猜测。
 *
 * 原则：
 * - Expected Growth = 28 天滚动日均自然增长基线（排除异常日）
 * - Incremental = Observed − Expected（只分配增量，不把自然增长算给内容）
 * - 平台直接提供 followers_from_post → direct；否则按信号分数分级 high_confidence/probable/assisted
 * - 每个结果带 evidence（时间窗口 / 播放分位 / 互动 / 主页访问 / 同期作品数）
 */

export const ATTRIBUTION_MODEL_VERSION = "v1";

/** 归因信号权重（模型配置 v1，可复盘） */
export const ATTRIBUTION_WEIGHTS = {
  viewPercentile: 0.4,
  engagementRate: 0.3,
  profileVisits: 0.2,
  recency: 0.1,
};

export interface AttributionCandidate {
  publication: (typeof publications.$inferSelect) & { topicTitle?: string };
  post: (typeof externalPosts.$inferSelect) | null;
  score: number;
  signal: { viewPercentile: number; engagementRate: number; profileVisitsScore: number; recencyScore: number; samePeriodPosts: number };
}

export interface AttributionRunInput {
  socialAccountId: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface AttributionRunOutput {
  runId: string;
  observed: number;
  expected: number;
  incremental: number;
  unattributed: number;
  candidates: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const attributionService = {
  /** 幂等：同账号同周期已完成则跳过 */
  async compute(input: AttributionRunInput): Promise<AttributionRunOutput> {
    const { socialAccountId, periodStart, periodEnd } = input;
    const existing = await attributionRepository.getRunByPeriod(socialAccountId, periodStart, periodEnd);
    if (existing && (existing.status === "completed" || existing.status === "failed")) {
      return {
        runId: existing.id,
        observed: existing.observedGrowth,
        expected: existing.expectedGrowth,
        incremental: existing.incrementalGrowth,
        unattributed: existing.unattributed,
        candidates: 0,
      };
    }

    const run = await attributionRepository.createRun({
      socialAccountId,
      periodStart,
      periodEnd,
      modelVersion: ATTRIBUTION_MODEL_VERSION,
      configVersion: "v1",
      status: "running",
    });

    try {
      // 1) 观察增长
      const observed = await this.observedGrowth(socialAccountId, periodStart, periodEnd);

      // 2) 预期自然增长（28 天基线，无基线降级）
      const expected = await this.expectedGrowth(socialAccountId, periodStart, periodEnd);

      const incremental = Math.max(0, observed - expected);

      // 3) 候选作品
      const candidates = await this.candidates(socialAccountId, periodStart, periodEnd);

      // V4 冷启动保护（规格 §25）：数据不足 → insufficient_data（不是失败，也不产生误导性归因）
      // 阈值可配置：ATTRIBUTION_MIN_SNAPSHOTS（默认 2）/ ATTRIBUTION_MIN_CANDIDATES（默认 1）
      const minSnapshots = Number(process.env.ATTRIBUTION_MIN_SNAPSHOTS ?? 2);
      const minCandidates = Number(process.env.ATTRIBUTION_MIN_CANDIDATES ?? 1);
      const periodSnapshots = await this.periodSnapshotCount(socialAccountId, periodStart, periodEnd);
      if (periodSnapshots < minSnapshots || candidates.length < minCandidates) {
        await attributionRepository.updateRun(run.id, {
          status: "insufficient_data",
          completedAt: new Date(),
          observedGrowth: observed,
          expectedGrowth: expected,
          incrementalGrowth: 0,
          unattributed: 0,
          error: `数据不足（冷启动保护）：周期内账号快照 ${periodSnapshots}/${minSnapshots}，候选作品 ${candidates.length}/${minCandidates}。补足真实数据后重跑。`,
        });
        return { runId: run.id, observed, expected, incremental: 0, unattributed: 0, candidates: candidates.length };
      }

      // 4) 概率分配 + 证据
      const totalScore = candidates.reduce((a, c) => a + c.score, 0);
      const results: typeof attributionResults.$inferInsert[] = [];
      let distributed = 0;

      for (const c of candidates) {
        const share = totalScore > 0 ? c.score / totalScore : 0;
        const followers = incremental * share;
        distributed += followers;
        const type = this.classify(c);
        results.push({
          runId: run.id,
          publicationId: c.publication.id,
          externalPostId: c.post?.id ?? null,
          topicId: c.publication.topicId,
          attributedFollowers: String(Math.round(followers * 10) / 10),
          attributionScore: String(Math.round(c.score * 1000) / 1000),
          attributionType: type,
          evidence: {
            viewPercentile: `${Math.round(c.signal.viewPercentile * 100)}%`,
            engagementRate: c.signal.engagementRate,
            profileVisitsScore: c.signal.profileVisitsScore,
            recencyScore: c.signal.recencyScore,
            samePeriodPosts: c.signal.samePeriodPosts,
            viewEvidence: this.viewEvidence(c.signal.viewPercentile),
            profileEvidence: this.profileEvidence(c.signal.profileVisitsScore),
            recencyEvidence: this.recencyEvidence(c.signal.recencyScore, c.signal.samePeriodPosts),
            platformDirect: Boolean(c.post?.rawData && (c.post.rawData as Record<string, unknown>)?.followers_from_post),
          },
        });
      }
      if (results.length) await attributionRepository.createResults(results as never[]);
      const unattributed = Math.max(0, Math.round((incremental - distributed) * 10) / 10);
      const finalUnattributed = candidates.length ? Math.round(unattributed) : Math.round(incremental);

      await attributionRepository.updateRun(run.id, {
        status: "completed",
        completedAt: new Date(),
        observedGrowth: observed,
        expectedGrowth: expected,
        incrementalGrowth: Math.round(incremental),
        unattributed: finalUnattributed,
      });

      await notificationService.notify({
        type: "attribution_completed",
        title: `涨粉归因完成：${observed} − 基线 ${expected} = +${Math.round(incremental)}`,
        message: `${candidates.length} 条候选作品，${results.filter((r) => r.attributionType === "high_confidence" || r.attributionType === "direct").length} 条高置信。`,
        link: "/analytics/attribution",
        entityType: "attribution_runs",
        entityId: run.id,
        severity: "info",
      });

      return { runId: run.id, observed, expected, incremental: Math.round(incremental), unattributed: finalUnattributed, candidates: candidates.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await attributionRepository.updateRun(run.id, { status: "failed", error: msg, completedAt: new Date() });
      throw e;
    }
  },

  /** V4：周期内账号快照数（冷启动判断用） */
  async periodSnapshotCount(socialAccountId: string, periodStart: Date, periodEnd: Date): Promise<number> {
    const snaps = await db
      .select({ id: accountMetricSnapshots.id })
      .from(accountMetricSnapshots)
      .where(and(eq(accountMetricSnapshots.socialAccountId, socialAccountId), gte(accountMetricSnapshots.capturedAt, periodStart), lte(accountMetricSnapshots.capturedAt, periodEnd)));
    return snaps.length;
  },

  /** 观察增长：周期内账号快照 new_followers 合计（无则用 followers delta） */
  async observedGrowth(socialAccountId: string, periodStart: Date, periodEnd: Date): Promise<number> {
    const snaps = await db
      .select()
      .from(accountMetricSnapshots)
      .where(and(eq(accountMetricSnapshots.socialAccountId, socialAccountId), gte(accountMetricSnapshots.capturedAt, periodStart), lte(accountMetricSnapshots.capturedAt, periodEnd)))
      .orderBy(asc(accountMetricSnapshots.capturedAt));
    const sumNew = snaps.reduce((a, s) => a + s.newFollowers, 0);
    if (sumNew > 0) return sumNew;
    if (snaps.length >= 2) return Math.max(0, snaps[snaps.length - 1].followers - snaps[0].followers);
    return 0;
  },

  /** 预期自然增长：最新 28 天基线日均 × 周期天数 */
  async expectedGrowth(socialAccountId: string, periodStart: Date, periodEnd: Date): Promise<number> {
    const days = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000));
    const baseline = await attributionRepository.getLatestBaseline(socialAccountId);
    if (baseline) return Math.round(Number(baseline.avgDailyGrowth ?? 0) * days);
    // 降级：周期内日均 × 0.5（保守，避免高估自然增长）
    const snaps = await db
      .select()
      .from(accountMetricSnapshots)
      .where(and(eq(accountMetricSnapshots.socialAccountId, socialAccountId), gte(accountMetricSnapshots.capturedAt, periodStart), lte(accountMetricSnapshots.capturedAt, periodEnd)));
    const daily = snaps.length ? snaps.reduce((a, s) => a + s.newFollowers, 0) / snaps.length : 0;
    return Math.round(daily * 0.5 * days);
  },

  /** 候选：周期内发布的作品（publishedDate 在窗口内的 publication + 外部作品） */
  async candidates(socialAccountId: string, periodStart: Date, periodEnd: Date): Promise<AttributionCandidate[]> {
    const account = await socialAccountRepository.getById(socialAccountId);
    if (!account) return [];

    const pubs = await db
      .select({ pub: publications, topic: topics })
      .from(publications)
      .innerJoin(topics, eq(publications.topicId, topics.id))
      .where(and(eq(publications.socialAccountId, socialAccountId), gte(publications.publishedDate ?? new Date(0), periodStart), lte(publications.publishedDate ?? new Date(0), periodEnd)))
      .orderBy(asc(publications.publishedDate));

    const samePeriodTotal = await db
      .select({ count: db.$count(publications) })
      .from(publications)
      .where(and(eq(publications.socialAccountId, socialAccountId), gte(publications.publishedDate ?? new Date(0), periodStart), lte(publications.publishedDate ?? new Date(0), periodEnd)));

    const candidates: AttributionCandidate[] = [];
    for (const { pub, topic } of pubs) {
      const posts = await db.select().from(externalPosts).where(eq(externalPosts.publicationId, pub.id)).limit(1);
      const post = posts[0] ?? null;
      const snap = post ? await metricsRepository.getLatestPostSnapshot(post.id) : null;

      // 播放分位（周期内全部快照）
      const allRows = await db
        .select({ views: postMetricSnapshots.views })
        .from(postMetricSnapshots)
        .where(gte(postMetricSnapshots.capturedAt, periodStart));
      const viewsArr = allRows.map((r) => r.views).filter((v) => v > 0).sort((a, b) => a - b);
      const myViews = snap?.views ?? 0;
      const viewPercentile = viewsArr.length ? viewsArr.filter((v) => v <= myViews).length / viewsArr.length : 0;

      const engagement = (snap?.likes ?? 0) + (snap?.comments ?? 0) + (snap?.shares ?? 0);
      const engagementRate = snap && snap.views > 0 ? Math.min(1, engagement / snap.views) : 0;
      const profileVisitsScore = clamp01((snap?.profileVisits ?? 0) / 500);
      const pubAt = pub.publishedDate ?? new Date(pub.scheduledDate ?? periodEnd);
      const recencyScore = this.recency(pubAt, periodEnd);

      const score = clamp01(
        viewPercentile * ATTRIBUTION_WEIGHTS.viewPercentile +
          engagementRate * 5 * ATTRIBUTION_WEIGHTS.engagementRate +
          profileVisitsScore * ATTRIBUTION_WEIGHTS.profileVisits +
          recencyScore * ATTRIBUTION_WEIGHTS.recency,
      );

      candidates.push({
        publication: { ...pub, topicTitle: topic.title },
        post,
        score,
        signal: {
          viewPercentile,
          engagementRate,
          profileVisitsScore,
          recencyScore,
          samePeriodPosts: samePeriodTotal[0]?.count ?? 1,
        },
      });
    }
    return candidates;
  },

  /** 分级：platform 直接提供 followers_from_post → direct；否则按分数 */
  classify(c: AttributionCandidate): AttributionResult["attributionType"] {
    if (c.post?.rawData && (c.post.rawData as Record<string, unknown>)?.followers_from_post) return "direct";
    if (c.score >= 0.6) return "high_confidence";
    if (c.score >= 0.35) return "probable";
    return "assisted";
  },

  /** T+1/T+3/T+7 时间窗口衰减 */
  recency(publishedAt: Date, periodEnd: Date): number {
    const hours = Math.max(0, (periodEnd.getTime() - publishedAt.getTime()) / 3600000);
    if (hours <= 24) return 1;
    if (hours <= 72) return 0.7;
    if (hours <= 168) return 0.4;
    return 0.1;
  },

  viewEvidence(p: number): string {
    if (p >= 0.95) return "作品播放 Top 5%";
    if (p >= 0.8) return "作品播放 Top 20%";
    if (p >= 0.5) return "作品播放中上水平";
    return "播放处于中下水平";
  },

  profileEvidence(s: number): string {
    if (s >= 0.6) return "发布后主页访问明显提高";
    if (s >= 0.3) return "主页访问略有上升";
    return "主页访问无显著变化";
  },

  recencyEvidence(r: number, samePeriod: number): string {
    const parts: string[] = [];
    if (r >= 0.9) parts.push("涨粉峰值与发布时间高度重合（24h 内）");
    else if (r >= 0.6) parts.push("发布时间距周期末较近（T+3 窗口）");
    if (samePeriod <= 1) parts.push("同期只有 1 条内容");
    else parts.push(`同期共 ${samePeriod} 条内容`);
    return parts.join("；");
  },
};
