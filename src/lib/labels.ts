import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

/** 全站状态 → 中文标签 + 徽标颜色的统一映射（数据字典） */

export const TOPIC_TYPE_LABELS: Record<string, string> = {
  hot: "热点",
  evergreen: "常青",
  technical_project: "技术项目",
  scenario: "场景",
  product: "产品",
  conversion: "转化",
  trend: "趋势",
  knowledge: "知识",
};

export const TOPIC_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  researching: "调研中",
  ready_for_production: "可生产",
  producing: "生产中",
  review: "审核中",
  needs_revision: "需修改",
  ready_to_publish: "可发布",
  published: "已发布",
  archived: "已归档",
};

export const TOPIC_STATUS_TONES: Record<string, BadgeVariant> = {
  draft: "default",
  researching: "blue",
  ready_for_production: "blue",
  producing: "orange",
  review: "orange",
  needs_revision: "red",
  ready_to_publish: "green",
  published: "green",
  archived: "default",
};

export const WORKFLOW_TYPE_LABELS: Record<string, string> = {
  orchestrator: "内容总控台",
  ai_weekly: "AI 周报",
  github_weekly: "GitHub 周榜",
  evergreen: "常青知识",
  wechat_deep_dive: "公众号深度专题",
};

export const RUN_STATUS_LABELS: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  needs_review: "待人工复核",
};

export const RUN_STATUS_TONES: Record<string, BadgeVariant> = {
  queued: "default",
  running: "blue",
  completed: "green",
  failed: "red",
  needs_review: "orange",
};

export const VERIFICATION_LABELS: Record<string, string> = {
  unverified: "未核验",
  partially_verified: "部分核验",
  verified: "已核验",
  conflict: "冲突",
  needs_update: "需更新",
};

export const VERIFICATION_TONES: Record<string, BadgeVariant> = {
  unverified: "default",
  partially_verified: "orange",
  verified: "green",
  conflict: "red",
  needs_update: "orange",
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  official: "官方公告",
  github: "GitHub",
  official_docs: "官方文档",
  authoritative_media: "权威媒体",
  tech_media: "科技媒体",
  community: "社区",
  internal: "内部",
};

export const ASSET_TYPE_LABELS: Record<string, string> = {
  ai_weekly_script: "AI 周报口播",
  short_video_script: "短视频口播",
  wechat_article: "公众号文章",
  github_card: "GitHub 图文",
  xiaohongshu: "小红书笔记",
  sales_material: "销售资料",
  infographic: "信息图",
  cover: "封面",
};

export const ASSET_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  in_review: "审核中",
  needs_revision: "需修改",
  ready: "就绪",
  published: "已发布",
  archived: "已归档",
};

export const ASSET_STATUS_TONES: Record<string, BadgeVariant> = {
  draft: "default",
  in_review: "orange",
  needs_revision: "red",
  ready: "blue",
  published: "green",
  archived: "default",
};

export const PLATFORM_LABELS: Record<string, string> = {
  wechat: "公众号",
  douyin: "抖音",
  xiaohongshu: "小红书",
  bilibili: "B站",
  wechat_video: "视频号",
};

export const PUBLICATION_STATUS_LABELS: Record<string, string> = {
  planned: "已计划",
  ready: "待发布",
  published: "已发布",
  failed: "失败",
};

export const PUBLICATION_STATUS_TONES: Record<string, BadgeVariant> = {
  planned: "default",
  ready: "blue",
  published: "green",
  failed: "red",
};

export const KNOWLEDGE_STATUS_LABELS: Record<string, string> = {
  uncovered: "未覆盖",
  partial: "部分覆盖",
  basic_explanation: "基础讲解",
  deep_explanation: "深度讲解",
  needs_update: "需更新",
  mature: "成熟",
};

export const KNOWLEDGE_CONTENT_STATUS_LABELS: Record<string, string> = {
  to_research: "待调研",
  to_produce: "待生产",
  script_done: "口播稿完成",
  wechat_done: "公众号完成",
  graphic_done: "图文完成",
  published: "已发布",
  high_performing: "高表现",
  needs_remake: "需重制",
};

export const CONTENT_ROLE_LABELS: Record<string, string> = {
  traffic: "流量",
  cognition: "认知",
  scenario: "场景",
  product: "产品",
  conversion: "转化",
};

export const SELECTION_BASIS_LABELS: Record<string, string> = {
  pure_weekly_rank: "纯周榜排名",
  value_filtered: "价值过滤",
  mixed: "混合",
};

export const DEDUPE_LABELS: Record<string, string> = {
  not_checked: "未查重",
  duplicate: "重复",
  related: "相关",
  confirmed_new: "确认新题",
};

/* ===== V3（Production Workbench） ===== */

/** 计划项状态（V2 冻结值 + V3 paused） */
export const ITEM_STATUS_LABELS: Record<string, string> = {
  pending: "待确认",
  approved: "已通过",
  paused: "已暂停",
  rejected: "已拒绝",
  running: "生产中",
  completed: "已完成",
  failed: "失败",
  skipped: "跳过",
};

export const ITEM_STATUS_TONES: Record<string, BadgeVariant> = {
  pending: "orange",
  approved: "blue",
  paused: "default",
  rejected: "red",
  running: "blue",
  completed: "green",
  failed: "red",
  skipped: "default",
};

/** Weekly Plan V2 评分 reason_codes（可解释来源，V3 §23） */
export const REASON_CODE_LABELS: Record<string, string> = {
  RISING_TREND: "趋势上升",
  HIGH_PERFORMANCE: "历史高表现",
  HIGH_CONVERSION: "高转化",
  HIGH_TRAFFIC_LOW_CONVERSION: "高流量低转化",
  KNOWLEDGE_GAP: "知识缺口",
  LOW_PERFORMANCE: "历史低表现",
  STABLE: "表现稳定",
  HIGH_FOLLOWER_IMPACT: "高涨粉影响",
  CONTENT_SATURATION: "内容饱和",
};

/** 通知类型（V3 §27 九种） */
export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  weekly_plan_ready: "周计划已生成",
  workflow_failed: "工作流失败",
  content_needs_review: "内容待审核",
  publication_needs_confirmation: "发布待确认",
  data_sync_failed: "数据同步失败",
  unmatched_external_post: "作品未匹配",
  metrics_stale: "数据过期",
  trend_p0_detected: "P0 趋势",
  attribution_completed: "归因完成",
};

/** 趋势状态 / 覆盖状态（Trend Radar，V3 §13） */
export const TREND_STATUS_LABELS: Record<string, string> = {
  emerging: "新兴",
  rising: "上升",
  stable: "平稳",
  declining: "衰退",
  archived: "已归档",
};

export const TREND_STATUS_TONES: Record<string, BadgeVariant> = {
  emerging: "blue",
  rising: "green",
  stable: "default",
  declining: "orange",
  archived: "default",
};

export const COVERAGE_STATUS_LABELS: Record<string, string> = {
  uncovered: "未覆盖",
  partial: "部分覆盖",
  covered: "已覆盖",
  saturated: "饱和",
};

/** 涨粉归因类型（V3 §35） */
export const ATTRIBUTION_TYPE_LABELS: Record<string, string> = {
  direct: "直接归因",
  high_confidence: "高置信",
  probable: "可能归因",
  assisted: "辅助归因",
  unattributed: "未归因",
};

export const ATTRIBUTION_TYPE_TONES: Record<string, BadgeVariant> = {
  direct: "green",
  high_confidence: "blue",
  probable: "default",
  assisted: "default",
  unattributed: "default",
};

/** 数据新鲜度（Metric Freshness，V3 §48） */
export const FRESHNESS_LABELS: Record<string, string> = {
  fresh: "新鲜",
  aging: "老化",
  stale: "过期",
};

export const FRESHNESS_TONES: Record<string, BadgeVariant> = {
  fresh: "green",
  aging: "orange",
  stale: "red",
};
