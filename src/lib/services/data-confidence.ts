/**
 * V4 Data Confidence（规格 §25 冷启动保护）：
 * - insufficient / low / medium / high 四档，按真实（非 seed）数据量计算
 * - 数据不足时 Weekly Plan 显示「数据不足，当前建议主要依据趋势与内容价值」
 * - 阈值可配置（DATA_CONFIDENCE_THRESHOLDS env JSON）
 */
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export type DataConfidence = "insufficient" | "low" | "medium" | "high";

const DEFAULT_THRESHOLDS = { low: 5, medium: 20, high: 50 };

function thresholds() {
  const raw = process.env.DATA_CONFIDENCE_THRESHOLDS;
  if (!raw) return DEFAULT_THRESHOLDS;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_THRESHOLDS>;
    return { ...DEFAULT_THRESHOLDS, ...parsed };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export interface DataConfidenceResult {
  level: DataConfidence;
  realPostSnapshots: number;
  realTopicPerformances: number;
  realPublications: number;
  /** 给运营的提示文案 */
  message: string;
}

/** 真实数据量（排除 seed；historical_import 计入但权重减半不区分，保持简单） */
export async function computeDataConfidence(): Promise<DataConfidenceResult> {
  const rows = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM post_metric_snapshots WHERE data_source <> 'seed')::int AS real_post_snapshots,
      (SELECT count(*) FROM topic_performance_scores WHERE data_source <> 'seed')::int AS real_topic_performances,
      (SELECT count(*) FROM publications WHERE data_source <> 'seed')::int AS real_publications
  `)) as unknown as { real_post_snapshots: number; real_topic_performances: number; real_publications: number }[];
  const snap = rows[0];

  const realPostSnapshots = Number(snap?.real_post_snapshots ?? 0);
  const realTopicPerformances = Number(snap?.real_topic_performances ?? 0);
  const realPublications = Number(snap?.real_publications ?? 0);

  // 综合信号量：快照为主，表现/发布为辅
  const signal = realPostSnapshots + realTopicPerformances * 2 + realPublications * 3;
  const t = thresholds();
  const level: DataConfidence = signal === 0 ? "insufficient" : signal < t.low ? "low" : signal < t.medium ? "medium" : "high";

  const message =
    level === "insufficient"
      ? "数据不足：还没有真实回流数据，当前建议主要依据趋势与内容价值。"
      : level === "low"
        ? "真实数据较少：当前建议主要依据趋势与内容价值，表现权重有限。"
        : level === "medium"
          ? "真实数据积累中：表现反馈已部分参与推荐。"
          : "数据充足：完整反馈闭环参与推荐（趋势 + 上周表现 + 转化）。";

  return { level, realPostSnapshots, realTopicPerformances, realPublications, message };
}
