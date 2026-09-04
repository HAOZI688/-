import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentMetrics, conversionEvents, leads, publications, topicPerformances } from "@/lib/db/schema";
import { metricsRepository, topicRepository } from "@/lib/repositories";

/**
 * Topic Performance Service（规格 §45）：数据回流 → 评分 → 推荐 → 下一轮选题反馈。
 * 指标必须绑定 Topic_ID；快照按 period（2026W36）保存，不覆盖历史。
 */
export interface TopicPerformanceResult {
  topicId: string;
  period: string;
  trafficScore: number;
  engagementScore: number;
  leadScore: number;
  conversionScore: number;
  performanceScore: number;
  recommendation: string;
}

export const topicPerformanceService = {
  /** 当前周期（ISO 周，如 2026W36） */
  currentPeriod(date = new Date()): string {
    const y = date.getFullYear();
    const start = new Date(y, 0, 1);
    const days = Math.floor((date.getTime() - start.getTime()) / 86400000);
    const week = Math.ceil((days + start.getDay() + 1) / 7);
    return `${y}W${String(week).padStart(2, "0")}`;
  },

  /**
   * 聚合单个 Topic 的表现：取该 Topic 的 content_metrics 汇总 +
   * leads/conversion_events 数量 → 评分 → upsert topic_performances。
   */
  async computeForTopic(topicId: string, period?: string): Promise<TopicPerformanceResult> {
    const p = period ?? this.currentPeriod();
    const [topic, metricRows, leadRows, conversionRows] = await Promise.all([
      topicRepository.getById(topicId),
      metricsRepository.getMetricsByTopic(topicId),
      db.select().from(leads).where(sql`${leads.topicId} = ${topicId}::uuid`),
      db.select().from(conversionEvents).where(sql`${conversionEvents.topicId} = ${topicId}::uuid`),
    ]);
    if (!topic) throw new Error(`Topic ${topicId} 不存在`);

    const m = metricRows[0]; // V1 取最新一行；多周期聚合可扩展
    const views = Number(m?.views ?? 0);
    const impressions = Number(m?.impressions ?? 0);
    const engagementUnits = Number(m?.commentCount ?? 0) + Number(m?.shareCount ?? 0) + Number(m?.saveCount ?? 0);
    const comments = Number(m?.commentCount ?? 0);
    const shares = Number(m?.shareCount ?? 0);
    const saves = Number(m?.saveCount ?? 0);
    const registrations = Number(m?.registrations ?? 0);
    const consultations = Number(m?.consultations ?? 0);
    const demoRequests = Number(m?.demoRequests ?? 0);
    const salesLeads = Number(m?.salesLeads ?? 0);
    const deals = Number(m?.deals ?? 0);

    // 评分 0-10
    const trafficScore = impressions > 0 ? Math.min(10, (views / impressions) * 10) : views > 0 ? 5 : 0;
    const engagementRate = views > 0 ? engagementUnits / views : 0;
    const engagementScore = Math.min(10, engagementRate * 100);
    const leadScore = Math.min(10, (consultations + demoRequests + salesLeads + leadRows.length) * 2);
    const conversionScore = Math.min(10, (deals + conversionRows.filter((c) => c.eventType === "deal").length) * 5 + registrations * 0.5);

    const performanceScore = Math.round(((trafficScore * 0.25 + engagementScore * 0.25 + leadScore * 0.25 + conversionScore * 0.25) * 10) / 10);

    const recommendation =
      performanceScore >= 7 ? "加大投入" : performanceScore >= 5 ? "继续" : performanceScore >= 3 ? "调整角度" : "暂缓";

    const result: TopicPerformanceResult = {
      topicId,
      period: p,
      trafficScore: Math.round(trafficScore * 10) / 10,
      engagementScore: Math.round(engagementScore * 10) / 10,
      leadScore: Math.round(leadScore * 10) / 10,
      conversionScore: Math.round(conversionScore * 10) / 10,
      performanceScore,
      recommendation,
    };

    await metricsRepository.upsertTopicPerformance({
      topicId,
      period: p,
      trafficScore: String(result.trafficScore),
      engagementScore: String(result.engagementScore),
      leadScore: String(result.leadScore),
      conversionScore: String(result.conversionScore),
      performanceScore: String(result.performanceScore),
      recommendation,
      metrics: {
        views,
        impressions,
        comments: Number(m?.commentCount ?? 0),
        shares: Number(m?.shareCount ?? 0),
        saves: Number(m?.saveCount ?? 0),
        registrations,
        consultations,
        demoRequests,
        salesLeads,
        deals,
        leadCount: leadRows.length,
        conversionCount: conversionRows.length,
      },
    });

    return result;
  },

  /**
   * 下一轮选题反馈（规格 §45→Orchestrator）：返回上周高/低分 Topic。
   * 高分支线延伸（derived），低分 Topic 建议归档或调角度。
   */
  async feedbackForNextRound(period?: string) {
    const p = period ?? this.currentPeriod(new Date(Date.now() - 7 * 86400000)); // 上一周期
    const rows = await metricsRepository.listTopicPerformances(p);
    const top = [...rows].sort((a, b) => Number(b.performanceScore ?? 0) - Number(a.performanceScore ?? 0)).slice(0, 3);
    const bottom = [...rows].sort((a, b) => Number(a.performanceScore ?? 0) - Number(b.performanceScore ?? 0)).slice(0, 3);
    return { period: p, topPerformers: top, bottomPerformers: bottom };
  },

  /** 全量 Topic 表现（页面 /analytics/topics 用） */
  async listAll(period?: string) {
    const p = period ?? this.currentPeriod();
    const rows = await metricsRepository.listTopicPerformances(p);
    const topicIds = rows.map((r) => r.topicId);
    const topics = topicIds.length ? await topicRepository.list() : [];
    const topicMap = new Map(topics.map((t) => [t.id, t]));
    return rows.map((r) => ({ ...r, topic: topicMap.get(r.topicId) ?? null }));
  },
};

/** content_metrics 列名兼容（saveCount/shareCount/commentCount） */
declare module "drizzle-orm" {}
