import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentAssets, knowledgeTopics, topics } from "@/lib/db/schema";
import { attributionRepository, metricsRepository, topicRepository, trendRepository } from "@/lib/repositories";

/**
 * Topic Performance Service V2（V3 §22）：全维度表现评分。
 * 在 V1（traffic/engagement/lead/conversion）基础上新增：
 * - followerScore：归因涨粉（attribution_results 按 topic 汇总）
 * - trendScore：关联趋势分（trends.current_score 平均）
 * - 综合 performanceScore + recommendation + reason_codes（V3 §23）
 *
 * V1 topic_performances 表保持只增不改（V1 冻结）；V2 明细写入 topic_performance_scores；
 * 同时回写 V1 performanceScore（Orchestrator Topic Feedback 依赖它，保持契约不变）。
 */

export interface TopicPerformanceV2Result {
  topicId: string;
  period: string;
  trafficScore: number;
  engagementScore: number;
  followerScore: number;
  leadScore: number;
  conversionScore: number;
  trendScore: number;
  performanceScore: number;
  recommendation: string;
  reasonCodes: string[];
}

/** V2 综合权重：traffic .2 / engagement .15 / follower .15 / lead .2 / conversion .2 / trend .1 */
export const V2_WEIGHTS = { traffic: 0.2, engagement: 0.15, follower: 0.15, lead: 0.2, conversion: 0.2, trend: 0.1 };

const clamp = (v: number) => Math.max(0, Math.min(10, Math.round(v * 10) / 10));

export const topicPerformanceV2Service = {
  /** 周期起止（period 2026W36 → 周一~周日，简化：以周为单位） */
  periodRange(period: string): { start: Date; end: Date } {
    const m = /^(\d{4})W(\d{2})$/.exec(period);
    if (!m) return { start: new Date(Date.now() - 7 * 86400000), end: new Date() };
    const [year, week] = [Number(m[1]), Number(m[2])];
    const jan4 = new Date(year, 0, 4);
    const monday = new Date(jan4.getTime() + (week - 1) * 7 * 86400000);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const end = new Date(monday.getTime() + 7 * 86400000);
    return { start: monday, end };
  },

  /** 计算单 Topic 全维度表现 + 落库（V2 表 + V1 表兼容回写） */
  async computeForTopic(topicId: string, period?: string): Promise<TopicPerformanceV2Result> {
    const p = period ?? currentPeriod();
    const { start, end } = this.periodRange(p);
    const topic = await topicRepository.getById(topicId);
    if (!topic) throw new Error(`Topic ${topicId} 不存在`);

    const [metricRows, leadRows, attributed, trendIds, assets, knowledge] = await Promise.all([
      metricsRepository.getMetricsByTopic(topicId),
      db.select().from(dbSchemaLeads()).where(eq(dbSchemaLeads().topicId, topicId)),
      attributionRepository.sumByTopic(topicId, start, end),
      trendRepository.listTrendIdsByTopic(topicId),
      db.select().from(contentAssets).where(eq(contentAssets.topicId, topicId)),
      db.select().from(knowledgeTopics).where(eq(knowledgeTopics.topicId, topicId)),
    ]);

    const m = metricRows[0];
    const views = Number(m?.views ?? 0);
    const impressions = Number(m?.impressions ?? 0);
    const engagementUnits = Number(m?.commentCount ?? 0) + Number(m?.shareCount ?? 0) + Number(m?.saveCount ?? 0);
    const registrations = Number(m?.registrations ?? 0);
    const consultations = Number(m?.consultations ?? 0);
    const demoRequests = Number(m?.demoRequests ?? 0);
    const salesLeads = Number(m?.salesLeads ?? 0);
    const deals = Number(m?.deals ?? 0);

    const trafficScore = impressions > 0 ? clamp((views / impressions) * 10) : views > 0 ? 5 : 0;
    const engagementScore = views > 0 ? clamp((engagementUnits / views) * 100) : 0;
    const leadScore = clamp((consultations + demoRequests + salesLeads + leadRows.length) * 2);
    const conversionScore = clamp((deals + registrations * 0.5) * 5 + leadScore * 0.3);

    // Follower Impact：归因涨粉（无数据给 0；100 粉以上给高分）
    const followerScore = attributed > 0 ? clamp(Math.min(10, attributed / 50)) : 0;

    // Trend Score：关联趋势平均
    let trendScore = 0;
    if (trendIds.length) {
      const trends = await Promise.all(trendIds.map((id) => trendRepository.getTrend(id)));
      const scores = trends.filter((t) => t && t.status !== "archived").map((t) => Number(t?.currentScore ?? 0));
      trendScore = scores.length ? clamp(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    }

    const performanceScore = clamp(
      trafficScore * V2_WEIGHTS.traffic +
        engagementScore * V2_WEIGHTS.engagement +
        followerScore * V2_WEIGHTS.follower +
        leadScore * V2_WEIGHTS.lead +
        conversionScore * V2_WEIGHTS.conversion +
        trendScore * V2_WEIGHTS.trend,
    );

    const { recommendation, reasonCodes } = this.recommend({
      trafficScore, conversionScore, followerScore, trendScore, performanceScore,
      assetCount: assets.length,
      publishedAssets: assets.filter((a) => a.status === "published").length,
      knowledgeUncovered: knowledge.length === 0 || knowledge.some((k) => k.knowledgeStatus === "uncovered" || k.knowledgeStatus === "partial"),
    });

    // 落库：V2 全维度
    await metricsRepository.upsertTopicPerformanceScore({
      topicId, period: p,
      trafficScore: String(trafficScore), engagementScore: String(engagementScore), followerScore: String(followerScore),
      leadScore: String(leadScore), conversionScore: String(conversionScore), trendScore: String(trendScore),
      performanceScore: String(performanceScore), recommendation,
      reasonCodes,
      metrics: { views, impressions, engagementUnits, attributedFollowers: attributed, leadCount: leadRows.length, assetCount: assets.length },
      configVersion: "v2.1",
    });

    // 兼容回写：V1 topic_performances（Orchestrator Topic Feedback 读它）
    await metricsRepository.upsertTopicPerformance({
      topicId, period: p,
      trafficScore: String(trafficScore), engagementScore: String(engagementScore),
      leadScore: String(leadScore), conversionScore: String(conversionScore),
      performanceScore: String(performanceScore), recommendation,
      metrics: { views, impressions, attributedFollowers: attributed, leadCount: leadRows.length },
    });

    return {
      topicId, period: p, trafficScore, engagementScore, followerScore, leadScore, conversionScore, trendScore, performanceScore, recommendation, reasonCodes,
    };
  },

  /** 推荐动作 + reason_codes（V3 §23，每个 code 都有可解释来源） */
  recommend(input: { trafficScore: number; conversionScore: number; followerScore: number; trendScore: number; performanceScore: number; assetCount: number; publishedAssets: number; knowledgeUncovered: boolean }): { recommendation: string; reasonCodes: string[] } {
    const codes: string[] = [];
    if (input.conversionScore >= 7) codes.push("HIGH_CONVERSION");
    if (input.trendScore >= 7) codes.push("RISING_TREND");
    if (input.followerScore >= 7) codes.push("HIGH_FOLLOWER_IMPACT");
    if (input.trafficScore >= 7 && input.conversionScore < 4) codes.push("HIGH_TRAFFIC_LOW_CONVERSION");
    if (input.publishedAssets >= 3) codes.push("CONTENT_SATURATION");
    if (input.performanceScore < 3) codes.push("LOW_PERFORMANCE");
    if (input.knowledgeUncovered || input.assetCount === 0) codes.push("KNOWLEDGE_GAP");

    let recommendation = "Maintain";
    if (codes.includes("LOW_PERFORMANCE")) recommendation = "Pause";
    else if (codes.includes("CONTENT_SATURATION")) recommendation = "Saturated";
    else if (codes.includes("HIGH_TRAFFIC_LOW_CONVERSION")) recommendation = "Traffic Only";
    else if (codes.includes("RISING_TREND") && codes.includes("HIGH_CONVERSION")) recommendation = "Increase Investment";
    else if (codes.includes("HIGH_CONVERSION")) recommendation = "Conversion Focus";
    else if (codes.includes("RISING_TREND")) recommendation = "Continue";
    else if (codes.includes("KNOWLEDGE_GAP")) recommendation = "Refresh";
    else if (input.performanceScore >= 6.5) recommendation = "Continue";
    return { recommendation, reasonCodes: codes };
  },

  /** 周期内全部 Topic 表现 V2（页面用） */
  async listAll(period?: string) {
    const p = period ?? currentPeriod();
    const rows = await metricsRepository.listTopicPerformanceScores(p);
    const topicIds = rows.map((r) => r.topicId);
    const topicsMap = new Map((await topicRepository.list()).map((t) => [t.id, t]));
    return rows.map((r) => ({ ...r, topic: topicsMap.get(r.topicId) ?? null }));
  },
};

/** 避免顶部 import 循环：leads 表延迟引用 */
function dbSchemaLeads() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { leads } = require("@/lib/db/schema") as typeof import("@/lib/db/schema");
  return leads;
}

function currentPeriod(date = new Date()): string {
  const y = date.getFullYear();
  const start = new Date(y, 0, 1);
  const days = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${y}W${String(week).padStart(2, "0")}`;
}
