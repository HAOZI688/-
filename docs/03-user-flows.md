# 03 用户流程（User Flows）

> **状态**：本文件是**用户流程（端到端操作流、页面交互流、人工审核闸门）的正式文档**，供 UI 设计稿、前端数据契约与开发任务（D1-D10 及后续）直接引用。
> **事实源（唯一）**：
> - 需求原文：`docs/_requirements.md`
> - 数据模型：`docs/_canonical-data-model.md`（字段/枚举/表定义）
> - 工作流/状态机：`docs/_canonical-workflow.md`（执行顺序/状态迁移/产能约束）
> - IA/设计：`docs/_canonical-ia.md`（路由/页面区块/设计系统）
> - MVP/路线图：`docs/_canonical-roadmap.md`（范围/阶段/任务/决策）
>
> 本文档**只描述"人在平台上的操作路径"与"系统在路径上的行为"**，不新增任何表字段、不改变任何枚举取值；凡涉及标识符一律与基线完全一致，冲突时以数据模型基线为裁决依据。基线未定义处在本文件以 `[REVIEW]` 标注或列入 §9 Open Questions，不擅自补全。

---

## 目录

1. 总览：端到端主流程全景
2. 周内容计划主流程（F1 → F8）
3. 选题 → 生产 → 发布 → 数据回流全链路
4. Topic Detail 交互流
5. Workflow Run 查看与重跑流
6. 审核闸门流程
7. 异常与边界场景
8. 术语速查（流程相关）
9. Open Questions

---

## 1. 总览：端到端主流程全景

### 1.1 核心闭环（需求最终目标）

平台最终目标是一个可循环的 AI Content Operations OS（需求"最终目标"）：**生成本周内容计划 → 审核 Topic → 点击开始生产 → 四个 AI Workflow 自动运行 → 生成内容 → 人工审核 → 发布 → 回填数据 → 下一周自动优化选题**。

对应本文档的阶段编号：

```
 F1            F2         F3             F4                  F5               F6          F7           F8
生成本周内容计划 → 审核Topic → 确认并开始生产 → 4个工作流生产 → 生成内容+人工审核 → 发布 → 回填数据 → 下周优化
   │             │            │              │                  │              │           │            │
 Dashboard CTA  Topics     Dashboard CTA   workflow_runs     Review 闸门     Publication  metrics     M5 闭环
 Orchestrator   Topic       Orchestrator   (4 子 run)          workflow_    Center      回填          trend_radar
 run(步1-6)     审核闸门     run(步7-12)                        outputs →     人工发布      content_     + next_action
                                                              content_       published    metrics      驱动 F1
                                                              assets 提升                /leads
```

### 1.2 阶段总表

| 阶段 | 中文 | 触发者 | 主页面 | 落库/产物 | 相关状态机 |
|---|---|---|---|---|---|
| F1 | 生成本周内容计划 | **人工**（Dashboard CTA「生成本周内容计划」） | `/dashboard` | Orchestrator run（`workflow_type='orchestrator'`）；`workflow_batches`（`status='planned'`）；`workflow_outputs.output_type='production_plan'` | `batch_status: planned` |
| F2 | 审核 Topic | **人工** | `/topics`、`/topics/[id]` | `topics.status` 推进（`Researching → Ready for Production`）；`audit_log` | `topic_status` |
| F3 | 确认并开始生产 | **人工**（Dashboard CTA「确认并开始生产」） | `/dashboard` | Orchestrator run（步 7-12）；批次 `planned → dispatching → in_progress`；派发 4 种子 run（`parent_run_id`） | `batch_status`、`workflow_run_status` |
| F4 | 四个工作流生产 | Orchestrator 派发（M3 起；定时器 M5 后启用） | `/workflows/runs` | 子 workflow runs + `workflow_tasks` + `workflow_outputs` | `workflow_run_status: queued → running → ...` |
| F5 | 生成内容 + 人工审核 | **人工** | `/workflows/runs`、`/content`、`/content/[id]` | `workflow_outputs`（留痕）→ **人工审核通过后**提升 `content_assets` | `topic_status: Producing → Review → Needs Revision / Ready to Publish`；`workflow_run_status: needs_review → completed` |
| F6 | 发布 | **人工** | `/publications` | `publications.status: planned → ready → published`；回填 `published_date / published_url / published_by` | `publication_status` |
| F7 | 回填数据 | **人工**（M4 起） | `/analytics` | `content_metrics`（18 字段，强制绑定 `topic_id`）；`leads` | — |
| F8 | 下周优化 | Orchestrator / 系统（M5 起） | `/analytics`、`/dashboard` | `trend_radar` 跨周对比；`secondary_candidates` 回写 `event_pool`；`knowledge_topic_bank.next_action` 驱动开采；`system_settings` 权重调优 | 进入下一轮 F1 |

> 说明：F1 与 F3 的 Orchestrator 12 步流水线（工作流基线 §2.1）可在**一次** Orchestrator run 内完成，也可拆分为**两次 run**（F1 执行步 1-6，F3 执行步 7-12）；V1 推荐拆分（两段各自对应一个 Dashboard CTA，`batch_status` 分别为 `planned` / `dispatching`）。

### 1.3 涉及页面与角色

- **角色**：V1 单用户（路线图 DC-06），`audit_log.actor` 为当前用户标识（OQ-04 待确认）。
- **页面**（IA §1.2，14 路由全量保留）：`/dashboard`、`/topics`、`/topics/[id]`、`/workflows`、`/workflows/runs`、`/content`、`/content/[id]`、`/knowledge`、`/github-weekly`、`/sources`、`/assets`、`/publications`、`/analytics`、`/settings`。
- **全局辅助**：⌘K 全局检索（Topic `topic_id`/title、批次、资产、导航、动作）；Topbar 当前内容周选择器；审核待办铃铛（`needs_review` run、`Review` 态资产、`conflict` 证据包、`review_required` 查重项）。

---

## 2. 周内容计划主流程（F1 → F8）

### 2.0 前置条件（进入 F1 前）

| # | 条件 | 依据 |
|---|---|---|
| P1 | 当前内容周已确定（Topbar 周选择器；`content_week` 格式 `2026W36`） | 数据模型 §2.1 |
| P2 | 候选事件已入池：`event_pool`（`candidate_id` 如 `2026W36-AI-CAND-001`，`selection_status='pending'`，`history_dedupe_status='not_checked'`）；V1 候选由人工录入或受限来源导入（OQ-02 待确认） | 工作流 §2.1 步 1 |
| P3 | `workflow_types` / `workflow_templates`（active 版本）/ `ai_prompt_templates` / `workflow_routing_rules` / `system_settings` 权重种子数据就绪 | 路线图 M0、D2 |

### 2.1 F1 生成本周内容计划

**入口**：`/dashboard` 核心 CTA 区「生成本周内容计划」（人工触发，落 `workflow_runs` 留痕；可由定时器触发周计划，定时器 M5 后启用，见 OQ-06）。

**执行**：Orchestrator run（`workflow_type='orchestrator'`，`run_number` 如 `2026W36-ORCHESTRATOR-R01`）执行流水线**步 1-6**：

| 步 | task_type（`workflow_tasks`） | 输入 | 输出 / 落库 |
|---|---|---|---|
| 1 候选接收 `candidate_reception` | `fact_check`（证据包预绑定） | 联网扫描后的候选事件 | `event_pool` 入池（`selection_status='pending'`）；证据包 `source_packets` 预绑定 |
| 2 历史查重 `history_dedupe` | `dedupe` | 候选 + 既有 `topics` | `event_pool.history_dedupe_status = unique / clustered / duplicate / merged / review_required` |
| 3 聚类 `topic_clustering` | `cluster` | 查重结果 | `topic_clusters` 收敛到 `canonical_topic_id`；`topics.dedupe_cluster_id` / `dedupe_matched_topic_id` 回填 |
| 4 Topic ID 分配 `topic_id_assignment` | `id_assign` | 入选候选 | `topics.topic_id`（如 `2026W36-001`，周内递增、删除不回收） |
| 5 评分 `scoring` | `score` | 五维 + `business_relevance` | `topics.b2b_relevance / traffic_potential / conversion_potential / timeliness / content_value`（1-10）；`score_rationale`（jsonb）；`score_version` 递增 |
| 6 优先级 `priority_assignment` | `score`（同步） | 评分结果 | `topics.priority = P0 / P1 / P2 / P3`（分档：P0≥8.0 / P1≥6.5 / P2≥5.0 / P3<5.0；`business_relevance` 门控 <4 且非 product/conversion 型封顶 P2；hot/trend 型 `timeliness=10` 兜底 P1） |

**产出**：`workflow_outputs.output_type='production_plan'`（周 Topic 计划列表、批次）→ `/dashboard`「本周内容计划」展示；同时生成 `workflow_batches`（`batch_id` 如 `2026W36-ORCHESTRATOR`，`status='planned'`，`topic_ids` 即 Topic_ID_List）。

**示例（2026W36 一周计划片段）**：

| topic_id | title | topic_type | priority | status | 五维评分摘要 | 路由目标（F3 用） |
|---|---|---|---|---|---|---|
| `2026W36-001` | Agent Skills 生态爆发 | `hot` | P0 | `Draft` | b2b 8 / traffic 9 / conversion 6 / timeliness 10 / value 7 | `ai_weekly` |
| `2026W36-002` | 本周 GitHub 星增 Top10 | `technical_project` | P1 | `Draft` | b2b 7 / traffic 8 / conversion 5 / timeliness 9 / value 6 | `github_weekly` |
| `2026W36-003` | 企业 Agent Skills Library 治理 | `knowledge` | P0 | `Draft` | b2b 9 / traffic 6 / conversion 8 / timeliness 6 / value 9 | `evergreen_knowledge` |
| `2026W36-004` | 销售团队如何落地 AI 工作流 | `scenario` | P1 | `Draft` | b2b 9 / traffic 5 / conversion 9 / timeliness 5 / value 7 | `wechat_deep_dive` |

**异常分支**：

| 场景 | 表现 | 处理 |
|---|---|---|
| 候选不足 | 入选 Topic 少于预期（AI Weekly 选 **5-8 条**，V1 不足 5 条按实际通过数发布） | 批次标 `low_candidate` 提示人工；相关 run 进入 `needs_review` |
| 查重结果 `review_required` | 人工裁决项进入待办审查队列 | F2 人工裁决后 `merged` / `unique` 等 |
| 证据包 `source_consistency='conflict'` | 包级状态 `conflict`，`conflict_fact_ids` 列出冲突事实 | F2 阶段进入逐条裁决（写 `audit_log`） |

### 2.2 F2 审核 Topic

**入口**：`/topics`（过滤 `status='Researching'` 或待办审查队列）→ `/topics/[id]`。

**前置守卫（进入 `Ready for Production` 前，缺失则阻止提交）**：

| 守卫 | 校验 | 依据 |
|---|---|---|
| G1 | 证据包 `source_packets.verification_status >= verified`（包级由明细 rollup，禁止手填与明细不一致） | 工作流 §7 |
| G2 | `topics.primary_cta` **必填**（FK → `ctas.id` 受控词表：`book_demo / download_whitepaper / join_community / contact_sales / follow_account / signup_newsletter` 等，单值） | 数据模型 §2.6 |
| G3 | 五维评分 + `priority` 已定 | 工作流 §7 |

**审核动作（全部写 `audit_log`，`actor = 用户标识`）**：

| 动作 | 状态迁移（`topics.status`） | 说明 |
|---|---|---|
| 审核通过 | `Researching → Ready for Production` | 选题定案，可进入生产 |
| 退回补充 | `Researching`（不迁移，修订后再审） | 补充证据包 / 修改评分 / 调整 CTA |
| 否决归档 | 任意态 → `Archived` | 放弃推进，写 `archived_at` |
| 查重裁决 | 对 `review_required` 候选：裁决 `merged` / `unique` 等 | `topic_clusters.status = open / resolved / merged` 联动 |

### 2.3 F3 确认并开始生产

**入口**：`/dashboard` 核心 CTA「确认并开始生产」（人工触发）。

**执行**：Orchestrator run 执行流水线**步 7-12**：

| 步 | task_type | 输出 / 落库 |
|---|---|---|
| 7 路由 `workflow_routing` | `route` | 命中 `workflow_routing_rules`（默认映射见下表）；可人工覆盖（`overridable=true`） |
| 8 产能控制 `capacity_control` | `capacity_check` | 批次 `planned → dispatching`；按 `capacity_rules` 决定派发批次与串并行 |
| 9 CTA 判断 `cta_assignment` | `cta_assign` | `topics.primary_cta`（若 F2 未填则此处守卫拦截） |
| 10 趋势雷达 `trend_radar_management` | `trend_radar`（管理态） | 管理 `trend_radar` 结果：二次候选回写 `event_pool`、更新 `topic_clusters` |
| 11 衍生管理 `derived_topic_management` | `derived_topic_manage` | `knowledge_derivations` 记账；`checkDerivedTopicBudget` 拦截超限（≤3）并记 `audit_log`（`action='budget_denied'`） |
| 12 Return 回写 `return_writeback` | `return_writeback` | 消费子 run 的 `workflow_outputs`（`applied=true` 幂等）；批次 `status='completed'` |

**路由默认映射（权威，工作流 §2.4）**：

| match_field | match_value | workflow_type_key |
|---|---|---|
| `topic_type` | `hot` / `trend` | `ai_weekly` |
| `topic_type` | `technical_project` | `github_weekly` |
| `topic_type` | `knowledge` / `evergreen` | `evergreen_knowledge` |
| `topic_type` | `scenario` / `product` / `conversion` | `wechat_deep_dive` |

**派发**：按批次生成 4 种子 run（`workflow_runs.parent_run_id = 本 Orchestrator run`），状态 `queued`；批次 `dispatching → in_progress`；`topics.status = Ready for Production → Producing`（由 Orchestrator 派发触发）。

### 2.4 F4 四个工作流生产

每个子 run 的流转（run 级）：`queued → running →（步骤序列）→ completed / failed / needs_review`。**全工作流产能约束**：`concurrency_limit=1, serial_mode=true`（工作流基线 §3）。

#### 2.4.1 `ai_weekly`（AI 周报）

| 项 | 值 |
|---|---|
| 触发 | 每周一 09:00 定时（`scheduling='weekly'`，M5 后启用；M3 起手动触发）；统计口径 = 上一完整自然周（周一 00:00 – 周日 23:59，`week_start` / `week_end` 显式存 `workflow_batches`）；入池过滤键 = `event_pool.event_date`（不用 `created_at`） |
| 批次 | `batch_id = 2026W36-AI-WEEKLY`（同周重跑追加 `-NN`：`2026W36-AI-WEEKLY-02`）；`run_number = 2026W36-AI-WEEKLY-R01` |
| 步骤 | `fact_check → score → select（选 5-8 条）→ script_generate（90 秒中文口播）→ outline_generate（极简提纲）→ trend_radar → secondary_candidates → return_writeback` |
| 产能 | `weekly_quota: {min:5, max:8}`；不足 5 条按实际通过数发布，批次标 `low_candidate` 触发人工 `needs_review` |
| 落库 | 入选事件 `event_pool.selection_status='selected'`，`elimination_reason`（淘汰必填）；五维评估（行业影响 `industry_impact` / 用户感知 `user_perception` / 技术变化 `tech_change` / 应用价值 `application_value` / 传播潜力 `propagation_potential`）落 `event_pool`，同时以 `event_assessment` jsonb 挂 `source_packet_items`；入选提升为 `topics`（`topic_type='hot'/'trend'`，`event_pool.derived_topic_id` 回填） |

#### 2.4.2 `github_weekly`（GitHub 周榜）

| 项 | 值 |
|---|---|
| 触发 | 每周一抓取上一自然周 GitHub Trending Weekly（V1 人工粘贴 + 半自动解析，OQ-03 待确认） |
| 批次 | `batch_id = 2026W36-GITHUB`；`snapshot_id = 2026W36-GH-ORIGINAL-PURE`（周-类型-口径） |
| 步骤 | `snapshot_capture（建立 Snapshot）→ fact_check → select → script_generate（GitHub 图文卡片）→ return_writeback` |
| 快照不可变 | `UNIQUE(week, snapshot_type, selection_basis)`；`status: captured → frozen`（frozen 后触发器禁改删）；`selection_basis ∈ pure_weekly_rank / value_filtered / mixed`；Replay（`snapshot_type='replay'`）一律**新建行**，`source_item_id` 指向 Original，**永不覆盖** |
| 捕获列冻结 | `rank / repository / project_name / weekly_growth / total_stars / repo_url` 不可变；运营列 `verification_status / selected / elimination_reason` 可变更并记 `audit_log` |
| 选中落 Topic | `github_snapshot_items.selected=true` → 落 `topics`（`topic_type='technical_project'/'trend'`） |

#### 2.4.3 `evergreen_knowledge`（常青知识）

| 项 | 值 |
|---|---|
| 触发 | Orchestrator 路由（按 `knowledge_topic_bank.next_action` 选择开采概念）或人工点单（`/knowledge`「开采操作」入口） |
| 批次 | `batch_id = 2026W36-EVERGREEN` |
| 步骤 | `select（选定概念）→ fact_check → knowledge_topic 建库（`knowledge_topic_bank` + 1:1 `topics` 行，`topic_type='knowledge'`）→ 内容生产（script_generate / outline_generate）→ derived_topics（≤3）→ return_writeback` |
| 一次一主 | 一次生产 = **一个 `workflow_runs` run**，恰 1 个主 Topic（`knowledge_derivations.main_topic_id`）；完成后最多新增 3 个衍生 Topic（`parent_topic_id = main_topic_id`，`round_index ∈ 1..3`） |
| 双保险 | 数据库 `UNIQUE(workflow_run_id, round_index)` + 应用层守卫 `checkDerivedTopicBudget`（超限拦截 + `audit_log`） |
| 状态联动 | `knowledge_status`（uncovered / partial / basic_explanation / deep_explanation / needs_update / mature）与 `content_status`（to_research / to_produce / script_done / wechat_done / graphic_done / published / high_performing / needs_remake）由本工作流推进；逐资产真实状态以 `content_asset_versions.status` 为准 |

#### 2.4.4 `wechat_deep_dive`（公众号 / 深度专题）

| 项 | 值 |
|---|---|
| 触发 | Orchestrator 路由到 `scenario` / `product` / `conversion` 型 Topic，或人工指定 |
| 批次 | `batch_id = 2026W36-WECHAT` |
| 步骤 | 定义 **Content Role**（单值，`traffic / cognition / scenario / product / conversion`，写作前必选且只选一个）→ Target User / Core User Problem / Decision User Needs to Make / Primary CTA → 蓝图 `deep_dive_plans`（12 段默认结构：Title / Intro / User Problem / Why It Happens / What Changed / Why Existing Solution Fails / Core Problem / Framework-Solution / Real Product Path / Who It Fits / Conclusion / CTA）→ 配图计划 `deep_dive_image_plans` → 成文 → return_writeback |
| 蓝图状态机 | `deep_dive_plans.status: drafting → review →（needs_revision ⇄）approved → archived`；`version` 退回重做递增 |
| 硬约束 | 每篇一个主 CTA（`deep_dive_plans.primary_cta` 默认继承 `topics.primary_cta`，审核校验 `plan.primary_cta == topic.primary_cta`）；配图优先级 `image_type_priorities`（真实产品截图=1 > 真实UI=2 > 结构信息图=3 > 流程图=4 > 数据图=5 > 概念图=6 > 装饰图=7）；真实截图/UI 必须 `from_brand_asset` 或 `from_verified_source`；Logo 禁止 AI 重绘（`ai_policy='reference_only'`） |

### 2.5 F5 生成内容 + 人工审核

**产物边界（权威）**：AI 原始产出一律先进 `workflow_outputs` 留痕（`output_type ∈ production_plan / selected_events / trend_report / secondary_candidates / derived_topics / content_asset / source_packet_update / outline / knowledge_topic / deep_dive_plan / image_plan`）；**仅人工审核通过后提升为 `content_assets`**。

**流转**：

```
子 run 完成 → workflow_runs.status = completed / needs_review
   → topics.status: Producing → Review
   → 人工审核（/workflows/runs 审查队列 或 /content 待审核队列）
       ├─ 通过 → 提升 content_assets（asset_status = Ready to Publish）→ topics.status: Review → Ready to Publish
       └─ 退回 → topics.status: Review → Needs Revision
                 →（人工确认后）Needs Revision → Producing（同 run 重跑 attempt_count+1 或新 run）
```

**审核操作落点（全部写 `audit_log`）**：Approve / Needs Revision / Ready to Publish（IA §2.7 `/content/[id]` 审核操作；`workflow_runs.status: needs_review → completed` 人工通过路径）。

**示例：AI Weekly 脚本审核**（`asset_type='ai_weekly_script'`）：

| 对象 | 审核前 | 动作 | 审核后 |
|---|---|---|---|
| `workflow_runs`（`2026W36-AI-WEEKLY-R01`） | `needs_review` | Approve | `completed` |
| `workflow_outputs`（`output_type='content_asset'`） | `applied=false` | 提升资产 | `applied=true`，`asset_id` 回填 |
| `content_assets`（`asset_key='2026W36-001:ai_weekly_script:wechat_video'`） | — | 新建 | `status='Ready to Publish'`，`current_version_id` 指向 v1 |
| `topics`（`2026W36-001`） | `Producing` | 审核通过 | `Ready to Publish` |

### 2.6 F6 发布（Publication Center）

**原则（数据模型 §2.8）**：**V1 绝不自动发布**。系统/工作流只生成 `planned → ready`；`publications.status='published'` **仅人工触发**（DB 触发器/应用层权限禁止 workflow 直写），且 `topics.status = Published` 需**存在 `publications` 记录**才能进入。

**步骤**（`/publications`，M4 阶段）：

| 步骤 | 动作 | 落库 |
|---|---|---|
| 1 | 从 `Ready to Publish` 资产创建发布计划（粒度 = 资产 × 平台 × 一次发布） | `publications`（`topic_id`、`asset_id`、`asset_version_id`、`platform` ∈ wechat / douyin / xiaohongshu / bilibili / wechat_video、`scheduled_date`），`status='planned'` |
| 2 | 排期确认 | `status: planned → ready`（系统可生成） |
| 3 | 人工到平台执行发布（不接平台 OpenAPI，OQ-08 待确认） | 人工回填 `published_date / published_url / published_by` → `status: ready → published`；`audit_log` 记 `action='published'` |
| 4 | 失败处理 | `status='failed'`，可重排 |

**示例**：`2026W36-001` 的 AI 周报口播脚本计划周三发布于 `wechat_video`，`scheduled_date = 2026-09-02T09:00:00Z`；人工发布后回填 `published_url = https://...`、`published_date`、`published_by = "ops-lead"`。

### 2.7 F7 回填数据

**内容**（M4 阶段，`/analytics` + 人工发布后）：

| 数据 | 落库 | 说明 |
|---|---|---|
| 平台指标 | `content_metrics`（18 字段全量：impressions / views / reads / completion_rate / five_second_retention / save_count / share_count / comment_count / profile_visits / cta_clicks / dm_count / registrations / material_downloads / demo_requests / consultations / sales_leads / deals / revenue） | **所有数据必须绑定 `topic_id`**；`platform`、`metric_date`、`publication_id` 关联发布 |
| 线索 | `leads`（`lead_type ∈ product_inquiry / feature_request / usage_issue / cooperation / industry_opinion / negative / invalid`；`lead_status ∈ new / assigned / contacted / closed`；`suggested_reply` AI 建议回复**仅建议、不自动回复**） | Dashboard KPI（本周 Leads / Demo / Consultation）数据源 |
| 发布回填 | `publications.published_date / published_url / published_by` | 见 F6 |

**录入方式**：表单录入或文件导入（路线图 §7 D15 概要"表单/导入"），具体形态见 OQ-03 本文件（UF-OQ-03）。

### 2.8 F8 下周优化（M5 优化闭环）

| 机制 | 落库/联动 | 作用 |
|---|---|---|
| 趋势雷达跨周对比 | `trend_radar`（`signal_strength / velocity / novelty_score` 均 1-10） | 下一轮 F1 选题依据 |
| 二次候选回写 | `secondary_candidates` → 回写 `event_pool`、更新 `topic_clusters` | 直接补充下周候选池 |
| 知识开采驱动 | `knowledge_topic_bank.next_action` 驱动 Orchestrator 路由 | 常青内容持续补充 |
| 评分权重调优 | `system_settings`（scoring.weights.* / scoring.threshold.*）配置驱动，不硬编码 | 校准优先级推导 |
| 知识状态推进 | `content_status: published → high_performing / needs_remake` | 触发重做或再开采 |
| 定时调度 | `scheduling='weekly'`（每周一 09:00）M5 启用 | F1/F4 自动化触发 |

**闭环验收（路线图 MS-5）**：演示完整周循环——"生成本周内容计划 → 审核 → 生产 → 审核 → 发布 → 回填 → 下一周选题可见数据反馈"。

---

## 3. 选题 → 生产 → 发布 → 数据回流全链路

### 3.1 数据链路总览

```
候选池               查重聚类            正式 Topic          执行              产物                资产
event_pool ────────→ topic_clusters ──→ topics ─────────→ workflow_runs ──→ workflow_outputs ──→ content_assets
(candidate_id)      (canonical_topic)   (2026W36-001)    (parent/子 run)    (11 种 output_type)   (8 类 asset_type)
   ▲                      │                                                                          │
   │                      │ selected/eliminated                                                        │
   │                      ▼                                                                          ▼
   └──── event_pool 二次候选 ◄──────── trend_radar ◄──── trend_radar ────┐                    publications
         (secondary_candidates)      (signal_strength/    (趋势雷达任务)   │                    (planned→ready→published)
                                      velocity/novelty)                     │                            │
                                                                           │                            ▼
        knowledge_topic_bank.next_action ── 驱动开采 ──┐                    │                    content_metrics
                                                        │                   │                    (18 字段, 强制 topic_id)
                                                        ▼                   │                            │
        system_settings 权重调优 ◄───────── 评分回读 ◄──┴── conversion_funnel 视图 ◄──────────────────┘
                                                                leads（线索池）
```

### 3.2 候选提升链路（选题段）

1. 候选入池：`event_pool`（`selection_status='pending'`、`history_dedupe_status='not_checked'`、`week`、`event_date` 入池过滤键）。
2. 查重聚类（Orchestrator 步 2-3）：`unique / clustered / duplicate / merged / review_required`；`topic_clusters` 收敛（`canonical_topic_id`）。
3. ID 分配与评分定级（步 4-6）：`topics.topic_id`、五维分、`priority`、`score_rationale`。
4. 入选提升：`event_pool.derived_topic_id` 回填正式 `topics` 行；`topics.created_by_run_id` 指向来源 run（审计）。
5. 血缘登记：`parent_topic_id`（单父衍生树）+ `source_topic_ids`（多对多）+ `topic_relations` 边（`lineage service` 单事务同写，读取走 `WITH RECURSIVE`，防环双保险，深度 3-5 层）。

### 3.3 生产链路（生产段）

- `topics`（`Ready for Production`）→ Orchestrator 路由（§2.4 映射表）→ 子 run 派发（`parent_run_id` 调用树）。
- 子 run 步骤执行（`workflow_tasks`，`UNIQUE(run_id, sequence)`）→ 产物落 `workflow_outputs`（`applied=false` 留痕）。
- 人工审核通过 → 提升 `content_assets`（`asset_key = {topic_id}:{asset_type}:{platform}`，`status='Ready to Publish'`，版本 v1）；`workflow_outputs.applied=true`（幂等，只消费一次）。
- 版本演化：`content_asset_versions` 历史全保留（version 从 1 递增，`is_current` 切换），不覆盖删除。

### 3.4 发布链路（发布段）

- `content_assets`（`status='Ready to Publish'`）→ `publications` 计划（`planned`）→ 排期（`ready`）→ 人工发布（`published` + 回填 `published_date / published_url / published_by`）。
- `topics.status: Ready to Publish → Published`（需存在 `publications` 记录）。
- 同一资产可多平台发布：每平台一条 `publications`（`platform` 唯一枚举 5 个）。

### 3.5 数据回流链路（回流段）

1. 指标事实：`content_metrics` 强制绑定 `topic_id`，按 `platform × metric_date` 每日/周期录入。
2. 漏斗派生：`conversion_funnel` SQL 视图：`Read=reads`（视频另看 `views`）→ `CTA Click=cta_clicks` → `Lead=registrations + dm_count` → `Registration=registrations` → `Demo=demo_requests` → `Sales Lead=sales_leads` → `Deal=deals` → `Revenue=revenue`。**不新增非需求字段，映射固化在视图**。
3. 线索池：`leads` 按 Topic 挂接（`topic_id` NOT NULL），`lead_status: new → assigned → contacted → closed`（V1 仅基础列表与分类，不做 CRM 工作流）。
4. 反哺选题：
   - `trend_radar`（信号来源 `trend_source ∈ ai_weekly / github_weekly / evergreen_knowledge / manual`）跨周聚合 → Dashboard 趋势雷达图；
   - AI Weekly `trend_radar` 任务产出 `secondary_candidates` → Orchestrator 回写 `event_pool` + 更新 `topic_clusters`（**生成在 workflow，管理在 orchestrator**）；
   - `knowledge_topic_bank.next_action` → Orchestrator 路由开采；
   - 指标表现（`high_performing` / `needs_remake`）→ 知识状态推进与重做触发。

### 3.6 全链路守恒约束

| 约束 | 强制机制 |
|---|---|
| 一次生产一个主 Topic，最多 3 个衍生 | `knowledge_derivations UNIQUE(workflow_run_id, round_index)` + `checkDerivedTopicBudget` |
| 每个 Topic 一个主 CTA，每资产仅一个 | `ctas` 受控词表单值 FK；资产级覆盖仅改文案不改动作 |
| 快照不可变 | frozen 触发器 + Replay 新建行 |
| 产物边界 | AI 产出先进 `workflow_outputs`，人工审核后才提升 `content_assets` |
| 发布仅人工 | `publications.published` 禁 workflow 直写；`topics.Published` 需 publications 记录 |
| 审计全覆盖 | 所有评分/定级/查重/聚类/CTA/路由/状态迁移落 `workflow_runs` + `audit_log` |

---

## 4. Topic Detail 交互流（`/topics/[id]`）

### 4.1 进入路径

| 来源 | 动作 | 目标 |
|---|---|---|
| `/topics` 列表 | 点击行（`topic_id` + title 双显） | `/topics/[id]` |
| `/topics/[id]` 血缘图 | 点击 Parent / Source / Derived Topic 节点 | 对应 `/topics/[id]`（可连续跳转形成浏览轨迹） |
| `/content/[id]` 关联 Topic | 点击"关联 Topic" | `/topics/[id]` |
| ⌘K Command Menu | 检索 `topic_id` / title | `/topics/[id]` |
| `/workflows/runs` 审查队列 | 点击 run 关联的 `topic_id` | `/topics/[id]` |

### 4.2 14 区块顺序（硬性要求，IA §3，不得重排/删节）

| # | 区块 | 展示（字段以数据模型列名为准） | 用户可执行动作 |
|---|---|---|---|
| 1 | 基础信息 Basic Info | `topic_id`、`content_week`、`title`、`description`、`topic_type`（8 类徽标）、`status`（9 态徽标）、`created_by_run_id`、`created_at` / `updated_at` / `archived_at` | 编辑 title/description（落 audit） |
| 2 | 评分 Scoring | 五维条（`b2b_relevance / traffic_potential / conversion_potential / timeliness / content_value` 1-10 进度条 + 数值）、门控项 `business_relevance`（标注"门控不参与加权"）、`priority_score` 推导、`score_rationale`（jsonb）、`score_version` | 🔸 重新评分（触发 Orchestrator 评分 run，落 `workflow_runs`） |
| 3 | Priority | `priority` 徽标（P0 红 / P1 橙 / P2 蓝 / P3 灰） | 点击徽标展开 `score_rationale` 分档依据 |
| 4 | Tags | `trend_tags`（text[]）标签组 + `topic_type` 常驻徽标 | 添加/移除标签（落 audit） |
| 5 | Parent | `parent_topic_id` → 父 `topic_id` + title | 跳转父 Topic；空态显示"无父 Topic（顶层选题）" |
| 6 | Source Topics | `source_topic_ids`（uuid[]）列表 | 逐项跳转；🔸 追加来源 Topic |
| 7 | Lineage 可视化 | `topic_relations`（`relation_type ∈ parent/source`）递归 CTE 双向遍历（深度 3-5 层）；节点 = topic_id + title + priority 色边；parent 实线 / source 虚线 | 点击节点跳转；高亮当前 Topic |
| 8 | Source Packet | `source_packets` 包级头（`packet_id`、`verification_status` 五态、`source_consistency`、`conflict_fact_ids`、`verified_by` / `verified_at`、notes）+ `source_packet_items` 明细（`core_fact`、`key_numbers`、`number_test_conditions`、`item_verification_status`、`event_assessment`） | `conflict` 时展开逐条裁决（写 `audit_log`）；逐条核验操作 |
| 9 | Workflow Runs | `workflow_runs WHERE topic_id = 本 Topic`；父子调用树（`parent_run_id`）、`status` 徽标、`batch_id`、`attempt_count`、产物 `workflow_outputs`（output_type + applied） | 展开 run Drawer 查看 `workflow_tasks` 步骤时间线（详见 §5） |
| 10 | Content Assets | `content_assets`（`asset_key`、`asset_type` 徽标、platform、content_role、cta、status、current_version） | 点击跳转 `/content/[id]` |
| 11 | Derived Topics | `topics WHERE parent_topic_id = 本 Topic.id` | 逐项跳转 |
| 12 | Metrics | `content_metrics WHERE topic_id = 本 Topic`（18 字段全量可切平台/日期）；`conversion_funnel` 视图；KPI 小卡 + 漏斗条 + Sparkline | 平台/周维度切换 |
| 13 | CTA | `topics.primary_cta` → `ctas`（key、label、`cta_type ∈ sales/content/community/brand`、target_url_template）；资产级覆盖列表 | 修改主 CTA（`Ready for Production` 前必填守卫） |
| 14 | 历史记录 History | `audit_log`（`entity_type='topic' AND action='status_changed'` 视图 `topic_status_history`）Timeline：`from_status → to_status`、actor（用户或 `ai:run-xxx`）、`workflow_run_id`、note、created_at | 只读回溯；🔸 并入包级核验记录（`source_packet_verifications` 视图） |

### 4.3 关键交互详述

**a. 血缘图浏览（区块 7）**：默认展示以当前 Topic 为中心的上游（父/源）+ 下游（衍生）双向；实线 `parent`（单父衍生）、虚线 `source`（多源促成）；点击任意节点在当前页面导航至该 Topic（保持区块结构不变）。

**b. 证据包冲突裁决（区块 8）**：`source_consistency='conflict'` 时区块展开冲突面板；用户逐条查看 `conflict_fact_ids` 对应事实，裁决后写 `audit_log`（`action='conflict_resolved'`），包级 `verification_status` 由明细 rollup 自动重算（禁止手填与明细不一致）。

**c. 重新评分（区块 2，🔸 追加）**：点击"重新评分"触发 Orchestrator 评分 run（落 `workflow_runs` 留痕），返回后刷新五维条、`priority`、`score_version`、`score_rationale`。

**d. CTA 修改（区块 13）**：`topics.primary_cta` 单值选择（受控词表）；进入 `Ready for Production` 前必填守卫（F2 G2）；若已有资产继承，提示"资产级 CTA 可在 `/content/[id]` 覆盖（仅改文案不改动作）"。

**e. 审核操作（跨区块联动）**：当 `topics.status ∈ Review / Needs Revision / Ready to Publish` 时，页面顶部（或区块 9/10）出现审核操作（Approve / Needs Revision / Ready to Publish），动作落 `audit_log` 并在区块 14 时间线即时出现新条目。

---

## 5. Workflow Run 查看与重跑流

### 5.1 查看流

```
/workflows（引擎概览）
  ├─ 工作流类型卡片（5 类：orchestrator / ai_weekly / github_weekly / evergreen_knowledge / wechat_deep_dive）
  ├─ 模板版本表（workflow_templates）
  ├─ 路由规则表（workflow_routing_rules）
  └─ 批次列表（workflow_batches：batch_id、week、status、topic_ids 摘要）
        │ 点击批次
        ▼
/workflows/runs（执行记录）
  ├─ 过滤栏：workflow_type_key / status / batch_id / week / Topic
  ├─ Runs 表格：run_number、workflow_type_key、batch_id、topic_id、status 徽标、attempt_count、started_at / completed_at、错误摘要
  └─ 审查队列：needs_review 批次集中处理
        │ 点击行（🔸 L3 详情用 Drawer 承载，不新增路由，保持 14 路由不变）
        ▼
Run 详情 Drawer
  ├─ workflow_tasks 步骤时间线（sequence / status / error）
  ├─ workflow_outputs 产物（output_type + content + applied）
  ├─ parent_run_id 调用树（父子 run 展开）
  └─ error（失败/需复核原因）
```

**父子调用树示例（一次 F1+F3 拆分的完整树）**：

```
2026W36-ORCHESTRATOR-R01（orchestrator，步1-6，status=completed）
└── 2026W36-ORCHESTRATOR-R02（orchestrator，步7-12，status=completed）—— F3 派发
    ├── 2026W36-AI-WEEKLY-R01（ai_weekly，status=needs_review）
    ├── 2026W36-GITHUB-R01（github_weekly，status=completed）
    ├── 2026W36-EVERGREEN-R01（evergreen_knowledge，status=completed）
    └── 2026W36-WECHAT-R01（wechat_deep_dive，status=needs_review）
```

### 5.2 Run 状态机与人工操作

```
queued → running → completed / failed / needs_review
needs_review ──人工通过──→ completed（可联动 topics.status = Ready to Publish）
needs_review ──人工退回──→ queued / running（同 run 重跑，attempt_count + 1，不新建 run）
failed ──人工 retry──→ queued（attempt_count + 1，模板/输入不变）
```

| 迁移 | 触发者 | 动作 | 审计 |
|---|---|---|---|
| `queued → running` | Orchestrator / 调度器 | `capacity_control` 放行；写 `started_at` | `audit_log` |
| `running → completed` | Workflow 引擎 | 全部子任务完成，`completed_at` 落库，`output` 汇总 | `audit_log` |
| `running → failed` | Workflow 引擎 | 异常/守卫拦截；`error`（jsonb）记原因 | `audit_log` |
| `running → needs_review` | Workflow 引擎 | 产物需人工审核（`low_candidate`、`review_required` 查重、Deep Dive 蓝图、涉敏感信息） | `audit_log` |
| `needs_review → completed` | **人工** | 审核通过；可联动 `topics.status = Ready to Publish` | `audit_log`（`action='review_approved'`） |
| `needs_review → queued/running` | **人工** | 审核退回：同 run 重跑（`attempt_count + 1`） | `audit_log`（`action='review_rejected'`） |
| `failed → queued` | **人工** | retry（重跑递增 `attempt_count`） | `audit_log` |

### 5.3 重跑 / 重试流（三种级别）

| 级别 | 场景 | 机制 | 标识示例 |
|---|---|---|---|
| Run 级 | 单 run 失败 / 审核退回 | 同 run `attempt_count + 1`，模板/输入不变，**不新建 run** | `2026W36-AI-WEEKLY-R01`（attempt 2） |
| 批次级 | 同周重跑 / 多批 | 新建 `workflow_batches`，batch_id 追加 `-NN` | `2026W36-AI-WEEKLY-02` |
| 快照级 | GitHub Replay | 新建 `github_snapshots` 行（`snapshot_type='replay'`，`source_item_id` 指向 Original） | `2026W36-GH-REPLAY-MIXED`（示意，命名规则见数据模型 §2.2：周-类型-口径） |

> 重跑入口：`/workflows` 批次操作区"新建/重跑批次"（生成 `2026W36-AI-WEEKLY`，重跑加 `-02` 后缀）；`/workflows/runs` 审查队列对 `needs_review` run 提供"通过/退回"；`failed` run 提供"重试"。

### 5.4 批次状态机（F3/F4 联动）

```
planned → dispatching → in_progress → completed
                                      ├→ needs_review（含待审产物）
                                      └→ failed（异常）
```

---

## 6. 审核闸门流程（Human Review Gate）

### 6.1 门禁总原则（硬性原则，任何阶段不得违反）

1. **V1 绝不自动发布**：`publications.status='published'` 仅人工触发并回填 `published_date / published_url / published_by`；系统/工作流只生成 `planned → ready`。
2. **产物边界**：AI 原始产出一律先进 `workflow_outputs`，**仅人工审核通过后提升为 `content_assets`**。
3. **审计全覆盖**：所有评分、定级、查重、聚类、CTA 判断、路由、状态迁移均有 `workflow_runs` 留痕；所有人工审核动作与状态变更写 `audit_log`（`actor = 用户标识 或 ai:run-xxx`）；UI 上审核/发布动作必须有显性"人工"标识，无绕过路径。

### 6.2 全链路审核点汇总

| # | 审核点 | 对象 | 审核内容 | 通过动作 | 退回动作 | 落库 |
|---|---|---|---|---|---|---|
| A1 | 候选裁决 | `history_dedupe_status='review_required'` 的候选 | 查重聚类结果 | 裁决 `unique` / `merged` | 归档 | `audit_log`（`action='dedupe_merged'` 等） |
| A2 | 证据包冲突 | `source_consistency='conflict'` 的包 | 逐条核心事实与关键数字 | 逐条裁决 `conflict_resolved` | 标记 `needs_update` | `audit_log` |
| A3 | Topic 定案 | `topics.status ∈ Researching` | 评分/priority/CTA/核验（守卫 G1-G3） | `Researching → Ready for Production` | 退回补充 / 归档 | `audit_log` |
| A4 | Run 产物 | `workflow_runs.status = needs_review` | `workflow_outputs` 各产物 | `needs_review → completed`，联动 `topics.status → Ready to Publish` | `needs_review → queued`（重跑 attempt_count+1） | `audit_log` |
| A5 | Deep Dive 蓝图 | `deep_dive_plans.status = review` | Content Role / 12 段结构 / `plan.primary_cta == topic.primary_cta` / 配图来源链 | `approved` → 产出 `content_assets(wechat_article)` | `needs_revision`（version+1） | `audit_log` |
| A6 | 内容资产 | `content_assets.status ∈ Review / Needs Revision` | 正文/脚本质量 | Approve → `Ready to Publish` | Needs Revision | `audit_log` |
| A7 | 发布执行 | `publications.status = ready` | 排期与内容确认 | 人工发布 → `published` + 回填三字段 | 重排 / `failed` | `audit_log`（`action='published'`） |
| A8 | 发布后复核 | `topics.status = Ready to Publish` | 发布前最后复核 | `Ready to Publish → Published`（需 publications 记录） | `Ready to Publish → Needs Revision` | `audit_log` |

### 6.3 审核动作与状态迁移矩阵

| 对象 | 状态枚举 | 通过路径 | 退回路径 |
|---|---|---|---|
| `topics.status` | Draft / Researching / Ready for Production / Producing / Review / Needs Revision / Ready to Publish / Published / Archived | `Review → Ready to Publish`；`Ready to Publish → Published`（人工 + publications 记录） | `Review → Needs Revision → Producing`；`Ready to Publish → Needs Revision` |
| `workflow_runs.status` | queued / running / completed / failed / needs_review | `needs_review → completed` | `needs_review → queued/running`（attempt_count+1）；`failed → queued`（retry） |
| `asset_status` | Draft / Producing / Review / Needs Revision / Ready to Publish / Published / Archived（= `topic_status` 子集） | `Review → Ready to Publish` | `Review → Needs Revision` |
| `deep_dive_plans.status` | drafting / review / needs_revision / approved / archived | `review → approved` | `review → needs_revision`（version 递增） |
| `publication_status` | planned / ready / published / failed | `ready → published`（仅人工） | `ready → failed`（可重排） |

### 6.4 待办审查队列（Dashboard 第 4 区块，IA §2.1）

聚合展示：`needs_review` 的 run、`Review` 态资产、`conflict` 证据包、`review_required` 查重项。点击任一待办跳转对应处理面（Run Drawer / `/content/[id]` / `/sources` / `/topics/[id]`），处理后队列即时刷新（审计视图驱动）。

---

## 7. 异常与边界场景

| # | 场景 | 系统表现 | 人工处理 |
|---|---|---|---|
| E1 | AI Weekly 候选不足 5 条 | 批次标 `low_candidate`，run 进入 `needs_review` | 确认按实际通过数发布，或补充候选重跑 |
| E2 | 查重 `duplicate` / `merged` 误判 | 候选被并入既有 Topic（`dedupe_matched_topic_id`） | 在 `review_required` 裁决面板改判 |
| E3 | 来源数据冲突（`conflict`） | 包级 `source_consistency='conflict'`，`conflict_fact_ids` 列出 | 逐条裁决或标 `needs_update` 要求补充来源 |
| E4 | 证据包核验不足进入生产 | 守卫 G1 拦截（`verification_status < verified`） | 补充核验后再提交 |
| E5 | `primary_cta` 未填进入生产 | 守卫 G2 拦截 | 在区块 13 选择主 CTA |
| E6 | 衍生 Topic 超限（>3） | `checkDerivedTopicBudget` 拦截 + `audit_log`（`action='budget_denied'`） | 拆分为下一次 run 开采 |
| E7 | run 失败（LLM 超时/校验失败） | `failed` + `error` jsonb | Retry（`failed → queued`） |
| E8 | 审核退回后重跑 | 同 run `attempt_count+1` | 修改 `workflow_outputs` 的输入后再确认重跑 |
| E9 | 快照冻结后误改 | DB 触发器拒绝 UPDATE/DELETE | UI 显示锁标识，仅允许新增 Replay 行 |
| E10 | 未审核产出直发 | 无绕过路径：`published` 仅人工触发 + 产物边界约束 | 违反即缺陷（验收硬性 Exit 约束） |
| E11 | 发布失败（平台拒绝/链接失效） | `publications.status='failed'` | 重排 `scheduled_date` 后重新发布 |
| E12 | 跨 ISO 周漂移 | `content_week` 显式列（如 2026-12-28 属 `2027W01`） | `topic_id` 与 `batch_id` 前缀取目标内容周，避免错配 |

---

## 8. 术语速查（流程相关）

| 英文标识符 | 中文 | 枚举/取值 |
|---|---|---|
| `workflow_run_status` | Run 状态 | queued / running / completed / failed / needs_review |
| `batch_status` | 批次状态 | planned / dispatching / in_progress / needs_review / completed / failed |
| `topic_status` | Topic 全局状态 | Draft / Researching / Ready for Production / Producing / Review / Needs Revision / Ready to Publish / Published / Archived |
| `workflow_output_type` | 产物类型 | production_plan / selected_events / trend_report / secondary_candidates / derived_topics / content_asset / source_packet_update / outline / knowledge_topic / deep_dive_plan / image_plan |
| `publication_status` | 发布状态 | planned / ready / published / failed |
| `publication_platform` | 平台 | wechat / douyin / xiaohongshu / bilibili / wechat_video |
| `workflow_type` | 工作流类型 | orchestrator / ai_weekly / github_weekly / evergreen_knowledge / wechat_deep_dive |
| `history_dedupe_status` | 查重状态 | not_checked / unique / clustered / duplicate / merged / review_required |
| `selection_status` | 候选入选状态 | pending / selected / eliminated |
| `source_verification_status` | 核验状态 | unverified / partially_verified / verified / conflict / needs_update |
| `source_consistency` | 来源一致性 | consistent / conflict / partial |
| `content_role` | 内容角色 | traffic / cognition / scenario / product / conversion（单值） |
| `asset_type` | 资产类型 | ai_weekly_script / short_video_script / wechat_article / github_card / xiaohongshu / sales_material / infographic / cover |
| `batch_id` | 批次 ID | `2026W36-AI-WEEKLY`；重跑加 `-NN`；`run_number` 加 `-R01` |
| `topic_id` | Topic 业务 ID | `2026W36-001`（正则 `^[0-9]{4}W[0-9]{2}-[0-9]{3}$`，周内递增不回收） |

---

## 9. Open Questions

> 本文档（用户流程）悬而未决的问题，编号 `UF-OQ-xx`。与路线图基线 §5（OQ-01…OQ-11）同域的问题做交叉引用；确认后更新本文档或由对应基线裁决。

| 编号 | 问题 | 影响流程环节 | 推荐方案 |
|---|---|---|---|
| UF-OQ-01 | 候选事件如何进入 `event_pool`（手动录入 / RSS / 邮件导入 / 受限源半自动采集）？V1 不做实时全网爬虫 | F1 起点、D4 候选池 Drawer | 沿用路线图 OQ-02：V1 手动录入 + 受限源半自动导入 |
| UF-OQ-02 | 定时调度启用时机：`scheduling='weekly'`（每周一 09:00）在 M3 还是 M5 启用？主流程自动化程度不同 | F1/F4 触发方式 | 沿用路线图 OQ-06：M3 手动触发为主、M5 启用定时器 |
| UF-OQ-03 | `content_metrics` 数据回填的录入方式（逐字段表单 vs CSV 批量导入）？18 字段按平台/日期的录入频率？ | F7、M4 D15 | 路线图 §7 D15 概要为"表单/导入"，推荐表单为主 + CSV 导入为辅 |
| UF-OQ-04 | Topic 级"审核 Topic"（F2）与资产级审核（F5）在 UI 上的落点划分：同一页面（`/topics/[id]`）是否同时承担两类审核操作？Deep Dive 蓝图审核（A5）与资产审核（A6）是否合并为一个审批流？ | F2、F5、A5/A6 | 推荐蓝图审核独立于资产审核（蓝图 `approved` 后才成文产出资产），在 `/topics/[id]` 区块 9/10 集中入口 |
| UF-OQ-05 | Run 退回重跑（`needs_review → queued`）时，`topics.status` 的联动规则：退回是否一律回到 `Producing`，还是保持 `Review` 直到重跑完成？ | F5、§5.2 | 推荐退回即 `Review → Needs Revision`，重跑开始时 `Needs Revision → Producing`（与工作流 §7 权威迁移一致） |
| UF-OQ-06 | 一个 Topic 多资产多平台发布（如 8 类资产 × 5 平台）的 `scheduled_date` 编排规则（同日/错峰）与发布顺序约束？ | F6 | 推荐按平台与资产类型错峰，具体排期规则待 `/publications` 设计稿确定 |
| UF-OQ-07 | Leads 处理流（`new → assigned → contacted → closed`）的 UI 载体：`/analytics` Leads 池是否承担分配/跟进操作，还是仅展示？ | F7、M4 | 推荐 `/analytics` 基础列表与分类（V1 不做 CRM 工作流），`assigned/owner` 字段人工维护 |
| UF-OQ-08 | 趋势雷达图表粒度与刷新策略（Dashboard 按周/跨周？刷新时机？） | F8、M5 | 沿用路线图 OQ-09：Dashboard 当前周 + M5 增加跨周对比 |
