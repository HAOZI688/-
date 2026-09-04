/**
 * AI Prompt 目录说明
 * ------------------
 * 平台约定：Prompt 不写死在页面组件里，统一收编到 /ai-prompts 目录，
 * 由 workflow_templates.prompt_file 字段引用。AI 调用层只负责加载与执行。
 *
 * 目录结构：
 *   ai-prompts/
 *     orchestrator/      内容总控台（候选接收/查重/聚类/评分/路由/CTA/趋势雷达）
 *       main.md
 *     ai-weekly/         AI 周报工作流
 *       main.md          候选事件池→核验→评分→选 5-8 条→90秒口播→提纲→趋势雷达→二次候选
 *     github-weekly/     GitHub 周榜工作流
 *       main.md          快照→Value Filter→选榜
 *     evergreen/         常青知识工作流
 *       main.md          一次一个主 Topic，完成后最多新增 3 个衍生 Topic
 *     wechat-deep-dive/  公众号深度专题工作流
 *       main.md          Content Role 定义 → 12 段结构 → 配图计划
 */
export const AI_PROMPTS_DIR = "ai-prompts";

export const WORKFLOW_KEYS = {
  orchestrator: "orchestrator",
  aiWeekly: "ai_weekly",
  githubWeekly: "github_weekly",
  evergreen: "evergreen",
  wechatDeepDive: "wechat_deep_dive",
} as const;
