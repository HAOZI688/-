import { topicRepository } from "@/lib/repositories";

/**
 * Topic Score Service（规格 §12）：五维评分 → 加权总分 → 优先级。
 * 权重来自 topic_scoring_config（不写死），默认 B2B 25 / Traffic 20 / Conversion 20 / Timeliness 15 / Content 20。
 */
export interface TopicScoreInput {
  b2bRelevance: number;
  trafficPotential: number;
  conversionPotential: number;
  timeliness: number;
  contentValue: number;
}

export const DEFAULT_WEIGHTS = {
  b2bWeight: 25,
  trafficWeight: 20,
  conversionWeight: 20,
  timelinessWeight: 15,
  contentValueWeight: 20,
};

/** 总分 → 优先级映射（规格 §6：P0/P1/P2/P3） */
export function scoreToPriority(score: number): "P0" | "P1" | "P2" | "P3" {
  if (score >= 8) return "P0";
  if (score >= 6.5) return "P1";
  if (score >= 5) return "P2";
  return "P3";
}

export const topicScoreService = {
  /** 计算加权总分（0-10） */
  compute(input: TopicScoreInput, weights = DEFAULT_WEIGHTS): number {
    const total = weights.b2bWeight + weights.trafficWeight + weights.conversionWeight + weights.timelinessWeight + weights.contentValueWeight;
    if (total <= 0) return 0;
    return (
      (input.b2bRelevance * weights.b2bWeight +
        input.trafficPotential * weights.trafficWeight +
        input.conversionPotential * weights.conversionWeight +
        input.timeliness * weights.timelinessWeight +
        input.contentValue * weights.contentValueWeight) /
      total
    );
  },

  /**
   * 评分并持久化：写入 topics 五维 + topic_score + priority，并留审计。
   * 返回 { topicScore, priority }。
   */
  async scoreTopic(
    topicId: string,
    input: TopicScoreInput,
    opts?: { actor?: string; source?: "manual" | "orchestrator" | "ai_weekly" },
  ) {
    const topic = await topicRepository.getById(topicId);
    if (!topic) throw new Error(`Topic ${topicId} 不存在`);

    const config = await topicRepository.getScoringConfig();
    const weights = config
      ? {
          b2bWeight: config.b2bWeight,
          trafficWeight: config.trafficWeight,
          conversionWeight: config.conversionWeight,
          timelinessWeight: config.timelinessWeight,
          contentValueWeight: config.contentValueWeight,
        }
      : DEFAULT_WEIGHTS;

    const topicScore = this.compute(input, weights);
    const priority = scoreToPriority(topicScore);

    const updated = await topicRepository.updateScores(topicId, {
      b2bRelevance: input.b2bRelevance,
      trafficPotential: input.trafficPotential,
      conversionPotential: input.conversionPotential,
      timeliness: input.timeliness,
      contentValue: input.contentValue,
      topicScore: String(Math.round(topicScore * 10) / 10),
    });
    if (!updated) throw new Error(`Topic ${topicId} 更新失败`);

    const after = { ...updated, priority };
    await topicRepository.update(topicId, { priority });

    return { topicScore: Math.round(topicScore * 10) / 10, priority, weights, config: !!config };
  },
};
