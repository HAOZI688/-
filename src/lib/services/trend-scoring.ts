import { trendRepository } from "@/lib/repositories";

/**
 * Trend Scoring Service（V3 §13）：信号级趋势评分。
 * 信号：Recurrence / Velocity / Source Diversity / Technical Significance / B2B / Content Performance / Conversion / Knowledge Gap。
 * 权重来自 trend_scoring_config（可配置，不写死）；每次计算记录 configVersion 与 breakdown（可复盘）。
 */

export const TREND_SCORING_DEFAULTS = {
  recurrenceWeight: 15,
  velocityWeight: 15,
  sourceDiversityWeight: 10,
  technicalSignificanceWeight: 15,
  b2bWeight: 15,
  contentPerformanceWeight: 10,
  conversionWeight: 10,
  knowledgeGapWeight: 10,
  techKeywords: ["agent", "ai", "llm", "model", "mcp", "rpa", "automation", "rag", "multimodal"],
};

export interface TrendScoringInput {
  trendKey: string;
  title: string;
  category?: string;
  /** 来源事件时间（recurrence / velocity 信号） */
  eventDates: Date[];
  /** 来源类型集合（多样性信号） */
  sourceTypes: string[];
  /** 关联 Topic 的 b2b 分（B2B 信号） */
  b2bValues: number[];
  /** 关联 Topic 的 performanceScore（内容表现信号） */
  performanceValues: number[];
  /** 关联 Topic 的 conversionScore（转化信号） */
  conversionValues: number[];
  /** 知识缺口：关联 Topic 中无内容/未覆盖的数量 */
  knowledgeGapCount: number;
}

export interface TrendSignalBreakdown {
  recurrence: number;
  velocity: number;
  sourceDiversity: number;
  technicalSignificance: number;
  b2b: number;
  contentPerformance: number;
  conversion: number;
  knowledgeGap: number;
}

export interface TrendScoringResult {
  currentScore: number;
  velocityScore: number;
  sourceDiversity: number;
  b2bRelevance: number;
  status: "emerging" | "rising" | "stable" | "declining";
  breakdown: TrendSignalBreakdown;
  configVersion: string;
}

const clamp = (v: number, min = 0, max = 10) => Math.max(min, Math.min(max, Math.round(v * 10) / 10));

export const trendScoringService = {
  async getConfigVersion(): Promise<{ config: typeof TREND_SCORING_DEFAULTS; version: string }> {
    const row = await trendRepository.getActiveConfig();
    if (!row) return { config: TREND_SCORING_DEFAULTS, version: "default" };
    return {
      config: {
        recurrenceWeight: row.recurrenceWeight,
        velocityWeight: row.velocityWeight,
        sourceDiversityWeight: row.sourceDiversityWeight,
        technicalSignificanceWeight: row.technicalSignificanceWeight,
        b2bWeight: row.b2bWeight,
        contentPerformanceWeight: row.contentPerformanceWeight,
        conversionWeight: row.conversionWeight,
        knowledgeGapWeight: row.knowledgeGapWeight,
        techKeywords: parseKeywords(row.techKeywords),
      },
      version: row.name === "default" ? "default" : row.id.slice(0, 8),
    };
  },

  /** 综合评分：8 信号加权 → 0-10 */
  async scoreTrend(input: TrendScoringInput): Promise<TrendScoringResult> {
    const { config, version } = await this.getConfigVersion();
    const now = Date.now();

    // Recurrence：事件数（同周去重按天）
    const days = [...new Set(input.eventDates.map((d) => d.toDateString()))];
    const weeksCovered = Math.max(1, Math.round((Math.max(...days.map((d) => Date.parse(d))) - Math.min(...days.map((d) => Date.parse(d)))) / 604800000));
    const recurrence = clamp(Math.min(10, days.length / weeksCovered * 2.5));

    // Velocity：近 7 天 vs 前 7 天
    const cutoff7 = now - 7 * 86400000;
    const cutoff14 = now - 14 * 86400000;
    const recent = input.eventDates.filter((d) => d.getTime() >= cutoff7).length;
    const previous = input.eventDates.filter((d) => d.getTime() >= cutoff14 && d.getTime() < cutoff7).length;
    const base = previous || recent || 1;
    const velocityRaw = ((recent - previous) / base) * 5;
    const velocity = clamp(Math.max(-10, Math.min(10, velocityRaw)), -10, 10);

    // Source Diversity：独特来源类型数 / 上限 5
    const uniqueTypes = new Set(input.sourceTypes).size;
    const sourceDiversity = clamp(uniqueTypes * 2);

    // Technical Significance：标题/关键词命中
    const text = `${input.title} ${input.category ?? ""}`.toLowerCase();
    const techHits = config.techKeywords.filter((k) => text.includes(k.toLowerCase())).length;
    const technicalSignificance = clamp(techHits * 3.5 + (input.category === "ai" || input.category === "tech" ? 2 : 0));

    // B2B：关联 Topic 平均 b2b（无数据给中性 5）
    const b2b = input.b2bValues.length ? input.b2bValues.reduce((a, b) => a + b, 0) / input.b2bValues.length : 5;

    // Content Performance：平均 performanceScore（无数据给中性 5）
    const perf = input.performanceValues.length ? input.performanceValues.reduce((a, b) => a + b, 0) / input.performanceValues.length : 5;

    // Conversion：平均 conversionScore（无数据给 3 中性偏保守）
    const conv = input.conversionValues.length ? input.conversionValues.reduce((a, b) => a + b, 0) / input.conversionValues.length : 3;

    // Knowledge Gap：无内容/未覆盖 Topic 数 → 分
    const knowledgeGap = clamp(input.knowledgeGapCount * 2);

    const totalWeight = config.recurrenceWeight + config.velocityWeight + config.sourceDiversityWeight + config.technicalSignificanceWeight + config.b2bWeight + config.contentPerformanceWeight + config.conversionWeight + config.knowledgeGapWeight || 100;
    const weighted =
      (recurrence * config.recurrenceWeight + Math.abs(velocity) * config.velocityWeight + sourceDiversity * config.sourceDiversityWeight +
        technicalSignificance * config.technicalSignificanceWeight + b2b * config.b2bWeight + perf * config.contentPerformanceWeight +
        conv * config.conversionWeight + knowledgeGap * config.knowledgeGapWeight) / totalWeight;
    const currentScore = clamp(weighted);

    const status = velocity > 3 ? "rising" : velocity < -3 ? "declining" : input.eventDates.length <= 1 ? "emerging" : "stable";

    return {
      currentScore,
      velocityScore: velocity,
      sourceDiversity: clamp(sourceDiversity),
      b2bRelevance: Math.round(b2b),
      status,
      breakdown: { recurrence, velocity, sourceDiversity, technicalSignificance, b2b, contentPerformance: perf, conversion: conv, knowledgeGap },
      configVersion: version,
    };
  },
};

function parseKeywords(raw: string | null): string[] {
  if (!raw) return TREND_SCORING_DEFAULTS.techKeywords;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.every((x) => typeof x === "string") ? arr : TREND_SCORING_DEFAULTS.techKeywords;
  } catch {
    return TREND_SCORING_DEFAULTS.techKeywords;
  }
}
