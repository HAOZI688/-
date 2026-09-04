import { metricsRepository } from "@/lib/repositories";

/**
 * Metric Normalization Service（规格 §39）：小豆芽原始字段 → 系统标准指标。
 * 规则存 metric_mappings（source_field → metric_key + transform），不写死。
 */
export interface NormalizedMetric {
  impressions?: number;
  views?: number;
  reads?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  completionRate?: number;
  fiveSecondRetention?: number;
  profileVisits?: number;
}

export const metricNormalizationService = {
  /**
   * 规范化单条原始指标行。
   * @param connectorId 连接器（小豆芽/CSV）
   * @param raw 原始行 {字段名: 值}
   * @param fallbackMappings 内置映射（未配置 connector 时使用）
   */
  async normalize(connectorId: string | null | undefined, raw: Record<string, unknown>, fallbackMappings?: Record<string, string>): Promise<NormalizedMetric> {
    let mappings: Record<string, string> = fallbackMappings ?? DEFAULT_XIAODOOUYA_MAPPINGS;

    if (connectorId) {
      const rows = await metricsRepository.listMappings(connectorId);
      if (rows.length) {
        mappings = {};
        for (const m of rows) {
          mappings[m.sourceField] = m.metricKey;
        }
      }
    }

    const out: NormalizedMetric = {};
    for (const [sourceField, key] of Object.entries(mappings)) {
      if (!(sourceField in raw)) continue;
      const value = raw[sourceField];
      if (typeof value !== "string" && typeof value !== "number") continue;

      const num = typeof value === "number" ? value : Number(value.replace(/[^\d.\-]/g, ""));
      if (Number.isNaN(num)) continue;

      const final = applyTransform(num, key);
      switch (key) {
        case "impressions": out.impressions = final; break;
        case "views": out.views = final; break;
        case "reads": out.reads = final; break;
        case "likes": out.likes = final; break;
        case "comments": out.comments = final; break;
        case "shares": out.shares = final; break;
        case "saves": out.saves = final; break;
        case "completion_rate": out.completionRate = final; break;
        case "five_second_retention": out.fiveSecondRetention = final; break;
        case "profile_visits": out.profileVisits = final; break;
        default: break;
      }
    }
    return out;
  },

  /** 确保标准指标定义存在（启动/导入前调用） */
  async ensureStandardDefinitions() {
    for (const def of STANDARD_METRICS) {
      await metricsRepository.ensureMetricDefinition(def);
    }
  },
};

/** 百分比字段保持原值（CSV 中可能已是 0-100），计数取整 */
function applyTransform(num: number, key: string): number {
  if (key === "completion_rate" || key === "five_second_retention") {
    return Math.round(num * 100) / 100;
  }
  return Math.round(num);
}

/** 小豆芽 CSV 导出常见字段名 → 标准指标 key（无映射配置时的兜底） */
export const DEFAULT_XIAODOOUYA_MAPPINGS: Record<string, string> = {
  播放量: "views",
  plays: "views",
  曝光量: "impressions",
  impressions: "impressions",
  阅读量: "reads",
  reads: "reads",
  点赞数: "likes",
  likes: "likes",
  评论数: "comments",
  comments: "comments",
  分享数: "shares",
  shares: "shares",
  收藏数: "saves",
  saves: "saves",
  完播率: "completion_rate",
  completion_rate: "completion_rate",
  "5秒完播率": "five_second_retention",
  five_second_retention: "five_second_retention",
  主页访问: "profile_visits",
  profile_visits: "profile_visits",
};

/** 标准指标主档（规格 §39：key/label/category/unit） */
export const STANDARD_METRICS: (typeof import("@/lib/db/schema").metricDefinitions.$inferInsert)[] = [
  { key: "impressions", label: "曝光量", category: "content", unit: "count" },
  { key: "views", label: "播放量/阅读量", category: "content", unit: "count" },
  { key: "reads", label: "阅读量(图文)", category: "content", unit: "count" },
  { key: "likes", label: "点赞数", category: "content", unit: "count" },
  { key: "comments", label: "评论数", category: "content", unit: "count" },
  { key: "shares", label: "分享数", category: "content", unit: "count" },
  { key: "saves", label: "收藏数", category: "content", unit: "count" },
  { key: "completion_rate", label: "完播率", category: "content", unit: "percent" },
  { key: "five_second_retention", label: "5秒完播率", category: "content", unit: "percent" },
  { key: "profile_visits", label: "主页访问", category: "content", unit: "count" },
  { key: "followers", label: "粉丝数", category: "account", unit: "count" },
  { key: "new_followers", label: "新增粉丝", category: "account", unit: "count" },
  { key: "engagements", label: "互动量", category: "account", unit: "count" },
];
