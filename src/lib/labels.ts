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
