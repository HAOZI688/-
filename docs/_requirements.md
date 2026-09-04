# AI 社交内容运营平台 — 原始需求（Source of Truth）

> 本文件是需求原文，供所有设计 agent 读取。设计文档必须与本节内容对齐；不一致处按"设计决策清单"处理。

## 项目定位

面向 AI / B2B 内容运营团队的 Content Operations OS。核心目标不是单纯生成文章，而是完整管理：

内容机会发现 → Topic 形成 → 事实核验 → AI 工作流分发 → 内容生产 → 人工审核 → 多平台内容资产 → 发布管理 → 数据追踪 → 线索转化 → 数据反哺下一轮选题。

平台当前来源于一套已人工验证过的内容生产体系，现有 5 个核心角色：

- 00 内容总控台
- 01 AI 周报工作流
- 02 GitHub 周榜工作流
- 03 AI 常青知识工作流
- 04 公众号 / 深度专题工作流

现在要将它们产品化为一个统一 Web 平台。

## 一、产品核心原则

1. **Topic 是整个系统最核心的数据实体。** 不要以"文章"为核心建模。一个 Topic 可衍生：AI 周报事件、短视频口播、GitHub 图文、常青知识、公众号文章、小红书内容、销售资料、其他内容资产。**Topic 与 Content Asset 必须严格分开。**

2. **所有内容需要有来源和事实核验能力。** 每个 Topic 关联 Source_Packet，至少支持：来源名称、来源 URL、来源类型、发布时间、Event_Date、Disclosure_Date、核心事实、关键数字、数字测试条件、核验状态、核验时间、备注。

3. **支持 Topic 血缘。** Topic_ID、Parent_Topic_ID、Source_Topic_IDs。示例：AI 新闻 → Agent Skills 趋势 → 什么是 Agent Skills → 企业为什么需要 Agent Skills Library → 企业 Agent Skills Governance。前端需可查看 Topic Lineage。

4. **AI 工作流采用 Orchestrator + 子 Workflow 架构。** 不把 Prompt 写死在页面组件里。独立：Orchestrator、AI Weekly Workflow、GitHub Weekly Workflow、Evergreen Knowledge Workflow、WeChat Deep Dive Workflow。

5. **所有 AI 工作流必须保留执行记录。** 记录：Workflow Run、输入、使用的 Topic、Source Packet、状态、生成结果、衍生 Topic、错误、执行时间。

6. **平台第一版必须有人类审核环节。** AI 不允许自动无条件发布内容。状态至少包括：Draft、Researching、Ready for Production、Producing、Review、Needs Revision、Ready to Publish、Published、Archived。

## 二、核心 Topic 数据模型

`topics` 表，至少包含：

- `id`
- `topic_id`（业务 ID，例：2026W36-001）
- `title`
- `description`
- `parent_topic_id`
- `source_topic_ids`
- `topic_type`
- `trend_tags`
- `b2b_relevance`（1-10）
- `traffic_potential`（1-10）
- `conversion_potential`（1-10）
- `timeliness`（1-10）
- `content_value`（1-10）
- `priority`（P0 / P1 / P2 / P3）
- `status`
- `primary_cta`
- `business_relevance`
- `history_dedupe_status`
- `created_at`
- `updated_at`

Topic 类型：`hot`、`evergreen`、`technical_project`、`scenario`、`product`、`conversion`、`trend`、`knowledge`。

## 三、Source Packet

设计 `sources`、`source_packets`、`source_packet_items`，支持一个 Topic 对应多个来源。

来源类型：`official`、`github`、`official_docs`、`authoritative_media`、`tech_media`、`community`、`internal`。

核验状态：`unverified`、`partially_verified`、`verified`、`conflict`、`needs_update`。

来源数据冲突时，标记 `Source_Consistency = Conflict`。

## 四、内容总控台 Orchestrator

Content Orchestrator 负责：联网信息扫描后的候选 Topic 接收、历史查重、Topic 聚类、Topic ID 分配、评分、优先级、Workflow 路由、产能控制、CTA 判断、趋势雷达、衍生 Topic 管理、Workflow Return 回写。

Dashboard 至少显示：当前周、AI 周报状态、GitHub 周榜状态、常青知识状态、公众号状态、P0 Topic 数、P1 Topic 数、待审核内容、待发布内容、已发布内容、本周 Leads、Demo 数、Consultation 数。

核心 CTA：生成本周内容计划、确认并开始生产。

## 五、AI Weekly Workflow

统计口径：上一个完整自然周（周一 00:00 至周日 23:59），每周一生产。

支持 `Batch_ID`，例如 `2026W36-AI-WEEKLY`，以及 `Topic_ID_List`。

流程：候选事件池 → 事实核验 → 评分 → 选 5-8 条 → 90 秒中文口播 → 极简提纲 → 趋势雷达 → 二次内容候选 → Workflow Return。

每个事件必须支持：Topic_ID、发布时间、来源、行业影响、用户感知、技术变化、应用价值、传播潜力、入选状态、淘汰原因。

## 六、GitHub Weekly Workflow

统计口径同样是上一个完整自然周，每周一抓取上一自然周 GitHub Trending Weekly。

必须建立 Snapshot。数据模型：

`github_snapshots`：snapshot_id、snapshot_type（Original / Replay）、week、capture_time、selection_basis、created_at。

`github_snapshot_items`：snapshot_id、rank、repository、project_name、weekly_growth、total_stars、repo_url、verification_status、selected、elimination_reason。

正式榜单需支持 `Selection_Basis`：`Pure_Weekly_Rank`、`Value_Filtered`、`Mixed`。

Snapshot 建立后不能被未来数据覆盖（不可变）。

## 七、AI Evergreen Knowledge

建立 AI Knowledge Topic Bank。知识 Topic 字段：Topic_ID、concept、category、knowledge_status、content_status、b2b_relevance、user_learning_cost、long_term_value、current_heat、upstream_concepts、related_concepts、downstream_concepts、existing_content、next_action。

知识状态：`uncovered`、`partial`、`basic_explanation`、`deep_explanation`、`needs_update`、`mature`。

内容状态：`to_research`、`to_produce`、`script_done`、`wechat_done`、`graphic_done`、`published`、`high_performing`、`needs_remake`。

默认一次生产一个主 Topic，完成后最多新增 3 个衍生 Topic。

## 八、公众号 / Deep Dive Workflow

正式写作前必须定义 **Content Role**，只允许选一个：`traffic`、`cognition`、`scenario`、`product`、`conversion`。

还需：Target User、Core User Problem、Decision User Needs to Make、Primary CTA。

每篇文章只能有一个主要 CTA。

默认结构：Title、Intro、User Problem、Why It Happens、What Changed、Why Existing Solution Fails、Core Problem、Framework / Solution、Real Product Path、Who It Fits、Conclusion、CTA。

支持输出配图计划。图片类型优先级：真实产品截图、真实 UI、结构信息图、流程图、数据图、概念图、装饰图。

## 九、Workflow Engine

统一 workflow engine。核心表：`workflow_templates`、`workflow_runs`、`workflow_tasks`、`workflow_outputs`。

每个 Workflow Run 记录：workflow_type、topic_id、batch_id、input_payload、source_packet、status、started_at、completed_at、output、error。

支持：`queued`、`running`、`completed`、`failed`、`needs_review`。

支持未来接入 LLM Provider。AI 调用层必须抽象。建议：`/lib/ai/providers`、`/lib/ai/orchestrator`、`/lib/ai/workflows`。不把模型 SDK 散落在业务代码中。

## 十、Content Assets

`content_assets`：id、topic_id、asset_type、platform、title、content、content_role、cta、status、version、created_at、updated_at。

asset_type：`ai_weekly_script`、`short_video_script`、`wechat_article`、`github_card`、`xiaohongshu`、`sales_material`、`infographic`、`cover`。

## 十一、Brand Asset Library

`brand_assets`：name、type、file_url、version、usage_notes、active。

支持：Logo、模板、产品截图、背景、CTA 卡片、UI Screenshot、Visual Reference。

AI 生成图片时禁止自动重绘正式 Logo。Logo 必须从 Brand Asset Library 获取。

## 十二、发布管理

第一版不自动发布。Publication Center。

`publications`：topic_id、asset_id、platform、scheduled_date、published_date、published_url、status。

平台：`wechat`、`douyin`、`xiaohongshu`、`bilibili`、`wechat_video`。

状态：`planned`、`ready`、`published`、`failed`。

## 十三、Metrics

`content_metrics` 字段：impressions、views、reads、completion_rate、five_second_retention、save_count、share_count、comment_count、profile_visits、cta_clicks、dm_count、registrations、material_downloads、demo_requests、consultations、sales_leads、deals、revenue。

所有数据必须绑定 Topic_ID。基础 Conversion Funnel：Read → CTA Click → Lead → Registration → Demo → Sales Lead → Deal。

## 十四、页面结构

`/dashboard`、`/topics`、`/topics/[id]`、`/workflows`、`/workflows/runs`、`/content`、`/content/[id]`、`/knowledge`、`/github-weekly`、`/sources`、`/assets`、`/publications`、`/analytics`、`/settings`。

## 十五、Topic Detail 页面

重点页面，包含：Topic 基础信息、评分、Priority、Tags、Parent Topic、Source Topics、Topic Lineage、Source Packet、Workflow Runs、Content Assets、Derived Topics、Metrics、CTA、历史记录。

## 十六、技术栈

Next.js、TypeScript、Tailwind CSS、shadcn/ui。数据库 PostgreSQL（推荐 Supabase：Database/Auth/Storage）。ORM 可选 Drizzle 或 Prisma，优先保持结构简单。

## 十七、项目目录

`/app`、`/components`、`/lib`、`/lib/ai`、`/lib/ai/orchestrator`、`/lib/ai/providers`、`/lib/ai/workflows`、`/lib/db`、`/lib/workflows`、`/types`、`/docs`、`/ai-prompts`。

需创建 13 份文档：`/docs/00-product-vision.md` … `/docs/12-roadmap.md`。

## 十八、开发原则

第一阶段只实现：Dashboard、Topic Center、Topic Detail、Source Packet、Workflow 基础结构、Knowledge Topic Bank、GitHub Snapshot、Content Asset 基础管理。先完成完整数据结构和核心页面。

不要优先实现：自动发布、复杂 CRM、视频生成、自动剪辑、多租户、复杂 RBAC、实时全网爬虫。

## 十九、UI 风格

AI / B2B / 内容运营 / 数据驱动 / 专业工作台。参考 Linear、Vercel、Notion、现代 SaaS Dashboard。信息密度高、留白适中、减少大面积装饰。大量使用 Card、Table、Badge、Tabs、Drawer、Command Menu、Timeline。颜色以白色、深灰、蓝色为主。Priority：P0 红色、P1 橙色、P2 蓝色。状态要明显。

## 二十、当前任务（本迭代）

1. 分析需求；2. 创建完整 docs；3. 输出信息架构；4. 输出数据库 ERD；5. 输出核心状态机；6. 输出 V1 MVP Scope；7. 输出开发 Roadmap；8. 拆分前 10 个 Development Tasks；9. 等用户确认。

**本迭代禁止**：实现完整 AI Workflow、开始自动发布、擅自删减核心 Topic / Source / Workflow 数据模型。

发现设计冲突或需求不清晰时：先列出问题和推荐方案。

## 最终目标

用户可以做到："生成本周内容计划" → 审核 Topic → 点击开始生产 → 四个 AI Workflow 自动运行 → 生成内容 → 人工审核 → 发布 → 回填数据 → 下一周自动优化选题 的 AI Content Operations OS。
