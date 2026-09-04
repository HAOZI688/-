# 权威工作流引擎与状态机基线（Canonical Workflow Engine & State Machines）

> **状态**：本文件是项目**工作流引擎（Workflow Engine）与状态机（State Machine）的唯一事实源（Single Source of Truth）**。
> 字段命名、类型、枚举取值一律以 `_canonical-data-model.md`（数据模型基线）为准；本文件只在其上定义**行为契约**（执行顺序、状态迁移、产能约束、接口分层），**不新增、不改写任何表字段**。冲突时以数据模型基线为裁决依据，再以本文件补充行为语义。
> 需求明文（`_requirements.md`）中的流程字段一律保留，只追加不删减。
> 技术基线：Next.js + TypeScript + Drizzle ORM + PostgreSQL 15+（Supabase）；AI 调用层三层抽象，见 §9。

---

## 1. 总览：工作流引擎分层

工作流引擎遵循需求四"Orchestrator + 子 Workflow 架构"，四层职责分工，Prompt 不写死在页面/组件：

```
┌──────────────────────────────────────────────────────────────────┐
│  UI / Dashboard（人工审核台）                                      │
│   「生成本周内容计划」→ Orchestrator · 「确认并开始生产」→ 派发子工作流  │
├──────────────────────────────────────────────────────────────────┤
│  内容总控台 Content Orchestrator（workflow_type = 'orchestrator'）  │
│  候选接收 → 查重 → 聚类 → ID → 评分 → 优先级 → 路由 → 产能 → CTA      │
│  → 趋势雷达 → 衍生管理 → Return 回写（详见 §2）                     │
├──────────────────────────────────────────────────────────────────┤
│  4 个子 Workflow（workflow_types 注册表，见 §3）                    │
│  ai_weekly · github_weekly · evergreen_knowledge · wechat_deep_dive│
├──────────────────────────────────────────────────────────────────┤
│  AI 调用层抽象（见 §9）                                             │
│  /lib/ai/providers（模型适配器）→ /lib/ai/orchestrator（编排回写）    │
│  → /lib/ai/workflows（业务子工作流）                                 │
└──────────────────────────────────────────────────────────────────┘
```

**核心表链路**（对应数据模型基线 Domain C）：

```
workflow_types → workflow_templates（版本化定义 + prompt_refs → ai_prompt_templates）
              → workflow_batches（批次聚合根）
              → workflow_runs（父 Orchestrator run + 子 run，parent_run_id 调用树）
              → workflow_tasks（步骤级执行）
              → workflow_outputs（类型化产物，applied 幂等回写）
              → workflow_routing_rules（可审计路由规则）
```

**全局硬性原则（继承数据模型基线 §2.8）**：
- 所有评分、定级、查重、聚类、CTA 判断、路由、状态迁移均由 Orchestrator 作为 `workflow_type='orchestrator'` 的 run 落库（`workflow_runs`）。
- 子 workflow 经 `parent_run_id` 挂父 run，形成可审计调用树。
- 人工审核门禁：V1 绝不自动发布；`workflow_runs.status = needs_review` 为人工门禁吸收态。

---

## 2. 内容总控台 Orchestrator（候选 → 生产计划全链路）

### 2.1 职责清单与执行顺序（流水线 12 步）

Orchestrator 是唯一编排者。一次 Orchestrator run 代表一次"生成本周内容计划"（或"确认并开始生产"派发）。每步落 `workflow_tasks`（`UNIQUE(run_id, sequence)`），关键裁决结果落 `workflow_outputs`。

| 序号 | 职责（中文） | 英文标识 | 输入 | 输出 / 落库 | task_type 映射（workflow_tasks） |
|---|---|---|---|---|---|
| 1 | **候选接收** | `candidate_reception` | 联网扫描后的候选事件（本周事件池） | `event_pool` 入池，`selection_status='pending'`、`history_dedupe_status='not_checked'` | `fact_check`（证据包预绑定） |
| 2 | **历史查重** | `history_dedupe` | 候选 + 既有 topics | `event_pool.history_dedupe_status` 置 `unique` / `clustered` / `duplicate` / `merged` / `review_required` | `dedupe`（扩展值） |
| 3 | **聚类** | `topic_clustering` | 查重结果 | `topic_clusters` 收敛相似候选到 `canonical_topic_id`；`topics.dedupe_cluster_id` 指向所属簇；`dedupe_matched_topic_id` 记录被并入既有 Topic | `cluster`（扩展值） |
| 4 | **Topic ID 分配** | `topic_id_assignment` | 入选候选 | `topics.topic_id`（`2026W36-001`，规则见 §2.2）；同批 Topic_ID_List 即本周分配 ID 集合 | `id_assign`（扩展值） |
| 5 | **评分** | `scoring` | 五维 + business_relevance | `topics.b2b_relevance/traffic_potential/conversion_potential/timeliness/content_value` 落库；`score_rationale`（jsonb）记推导依据；`score_version` 递增 | `score` |
| 6 | **优先级** | `priority_assignment` | 评分结果 | `topics.priority`（P0-P3，分档与门控见 §2.3） | `score`（同步） |
| 7 | **Workflow 路由** | `workflow_routing` | Topic 类型 / 趋势标签 | `workflow_routing_rules` 命中 → 指定子 workflow（映射见 §2.4）；可人工覆盖（`overridable`） | `route`（扩展值） |
| 8 | **产能控制** | `capacity_control` | 当前批次产能配额 | 生成 `workflow_batches`（`status='dispatching'`）；按 `capacity_rules` 决定派发批次与串并行 | `capacity_check`（扩展值） |
| 9 | **CTA 判断** | `cta_assignment` | business_relevance + topic_type | `topics.primary_cta`（FK→`ctas.id` 受控词表，单值）；进入 `Ready for Production` 前必填守卫 | `cta_assign`（扩展值） |
| 10 | **趋势雷达** | `trend_radar_management` | 各子工作流回传信号 | 管理 `trend_radar` 结果：二次候选回写 `event_pool`、更新 `topic_clusters`；**生成在 workflow，管理在 orchestrator** | `trend_radar`（管理态） |
| 11 | **衍生管理** | `derived_topic_management` | Evergreen 回传衍生 Topic | `knowledge_derivations` 记账；守卫函数 `checkDerivedTopicBudget` 拦截超限（≤3），记 `audit_log` | `derived_topic_manage`（扩展值） |
| 12 | **Return 回写** | `return_writeback` | 各子 run 的 `workflow_outputs` | 消费产物（`applied=true` 幂等）：提升 Topic、更新 Source Packet、落资产引用、刷新趋势雷达；批次 `status='completed'` | `return_writeback` |

> 第 1-6 步构成"候选 → 本周内容计划"（对应 Dashboard CTA「生成本周内容计划」）；第 7-12 步构成"确认并开始生产"的派发与回写（对应 CTA「确认并开始生产」）。两段可在一次 Orchestrator run 内完成，也可拆分为两次 run（`batch_status` 分别为 `planned` / `dispatching`）。

### 2.2 Topic ID 分配规则（执行细节，继承数据模型 §2.1）

- 格式 `YYYY Www - NNN`，正例 `2026W36-001`，正则 `^[0-9]{4}W[0-9]{2}-[0-9]{3}$`。
- 周语义取**目标内容周**（与 `batch_id` 前缀一致），不取创建周；`content_week` 列显式存储。
- 序号按周唯一、周内递增分配、**删除不回收**；分配由 Orchestrator `id_assign` 步骤执行并回写 `topics.topic_id`。

### 2.3 评分 → priority 映射（执行细节，继承数据模型 §2.5）

- 五维均 1-10；加权 `priority_score = Σ(w_i × dim_i)`，权重按 `topic_type` 用不同画像（存 `system_settings`，配置驱动，不硬编码）。
- 分档：`P0 ≥ 8.0`；`P1 ≥ 6.5`；`P2 ≥ 5.0`；`P3 < 5.0`。
- 门控：`business_relevance` 不参与加权，<4 且非 product/conversion 型**封顶 P2**；hot/trend 型 `timeliness=10` 兜底至少 P1。
- 审计：结果落 `topics.priority`，依据落 `score_rationale`（jsonb），`score_version` 变更即递增，落 `workflow_runs` 留痕。

### 2.4 路由规则（workflow_routing_rules 默认映射）

| match_field | match_value | workflow_type_key |
|---|---|---|
| `topic_type` | `hot` / `trend` | `ai_weekly` |
| `topic_type` | `technical_project` | `github_weekly` |
| `topic_type` | `knowledge` / `evergreen` | `evergreen_knowledge` |
| `topic_type` | `scenario` / `product` / `conversion` | `wechat_deep_dive` |

所有规则 `overridable=true`（允许人工覆盖路由），命中即按 `priority` 取最高优先规则。

---

## 3. workflow_templates 注册表（5 个工作流定义）

注册表主体为 `workflow_types`（key/name/scheduling/capacity_rules）与 `workflow_templates`（版本化 input_schema / output_schema / prompt_refs / step_definition）。下表为**权威注册内容**（基线值），落库时 `workflow_types` 一行 + 每类型 `workflow_templates` 至少一个 active 版本。

### 3.1 Orchestrator（workflow_type = `orchestrator`）

| 项 | 值 |
|---|---|
| 触发方式 `scheduling` | `manual`（Dashboard CTA「生成本周内容计划」/「确认并开始生产」；可由定时器触发周计划） |
| 入参契约 `input_schema` | `{ batch_id?, week, candidate_ids[]?, topic_id_list[], include_routing:boolean, include_production_dispatch:boolean }` |
| 出参契约 `output_schema` | `output_type ∈ {production_plan, selected_events, trend_report, secondary_candidates, derived_topics, source_packet_update, knowledge_topic}` |
| 产能规则 `capacity_rules` | `{ concurrency_limit: 1, serial_mode: true }`（编排串行，避免状态竞争） |
| 职责 | 执行 §2 流水线 12 步；派发子 run 并经 `parent_run_id` 建立调用树 |

### 3.2 AI Weekly（workflow_type = `ai_weekly`）

| 项 | 值 |
|---|---|
| 触发方式 | `weekly`（**每周一** 09:00 定时；统计口径 = 上一完整自然周 周一 00:00 – 周日 23:59） |
| 入参契约 | `{ batch_id: "2026W36-AI-WEEKLY", week, topic_id_list: Topic_ID_List, source_packet_ids[], event_pool_ids[] }` |
| 出参契约 | `output_type ∈ {selected_events, outline, content_asset(ai_weekly_script), trend_report, secondary_candidates, source_packet_update}` |
| 产能规则 | `{ concurrency_limit: 1, weekly_quota: {min:5, max:8}, serial_mode: true }`（选 **5-8 条**；V1 不足 5 条按实际通过数发布并在批次标 `low_candidate` 提示人工） |
| 流程步骤 | 候选事件池 → 事实核验（`fact_check`）→ 评分（`score`）→ 选 5-8 条（`select`）→ 90 秒中文口播脚本（`script_generate`）→ 极简提纲（`outline_generate`）→ 趋势雷达（`trend_radar`）→ 二次内容候选（`secondary_candidates`）→ Workflow Return（`return_writeback`） |

**事件必达字段**（`event_pool`，需求五）：Topic_ID、发布时间（`published_at`）、来源、行业影响（`industry_impact`）、用户感知（`user_perception`）、技术变化（`tech_change`）、应用价值（`application_value`）、传播潜力（`propagation_potential`）、入选状态（`selection_status`）、淘汰原因（`elimination_reason`）。五维评估同时以 `event_assessment` jsonb 挂 `source_packet_items`，使评估与证据同源。

### 3.3 GitHub Weekly（workflow_type = `github_weekly`）

| 项 | 值 |
|---|---|
| 触发方式 | `weekly`（**每周一** 抓取上一自然周 GitHub Trending Weekly） |
| 入参契约 | `{ batch_id: "2026W36-GITHUB", week, snapshot_week }` |
| 出参契约 | `output_type ∈ {content_asset(github_card), selected_events, source_packet_update}` |
| 产能规则 | `{ concurrency_limit: 1, serial_mode: true }` |
| 流程步骤 | 抓取周榜（`snapshot_capture`）→ 建立 Snapshot（`github_snapshots`，不可变）→ 核验（`fact_check`）→ 评分选中（`select`）→ GitHub 图文卡片（`script_generate`/资产提升）→ Return |

**Snapshot 不可变（继承数据模型 §2.4）**：`UNIQUE(week, snapshot_type, selection_basis)` + `status='frozen'` 触发器禁改删 + Replay 新建行（`source_item_id` 血缘）。`selection_basis ∈ {pure_weekly_rank, value_filtered, mixed}`。捕获列（rank/repository/project_name/weekly_growth/total_stars/repo_url）冻结；运营列（verification_status/selected/elimination_reason）可变并记 `audit_log`。

### 3.4 Evergreen Knowledge（workflow_type = `evergreen_knowledge`）

| 项 | 值 |
|---|---|
| 触发方式 | `manual`（Orchestrator 路由，按 `knowledge_topic_bank.next_action` 选择开采概念；或人工点单） |
| 入参契约 | `{ batch_id: "2026W36-EVERGREEN", main_topic_id?, concept_id?, topic_id_list[] }` |
| 出参契约 | `output_type ∈ {knowledge_topic, derived_topics, content_asset(ai_weekly_script/wechat_article/...), source_packet_update}` |
| 产能规则 | `{ concurrency_limit: 1, serial_mode: true }`（串行；**一次一主 Topic**） |
| 流程步骤 | 选定概念（`select`）→ 事实核验（`fact_check`）→ 建立 Knowledge Topic（`knowledge_topic` 产出 + 1:1 topics 行）→ 内容生产（`script_generate`/`outline_generate`）→ 衍生 Topic 生成（`derived_topics`，≤3）→ Return |

**衍生预算（继承数据模型 §2.7）**：一次生产 = 一个 `workflow_runs` run，恰 1 个主 Topic（`knowledge_derivations.main_topic_id`）；完成后最多新增 3 个衍生 Topic（`parent_topic_id = main_topic_id`，`round_index ∈ 1..3`）。数据库兜底 `UNIQUE(workflow_run_id, round_index)` + 应用层守卫 `checkDerivedTopicBudget` 双保险。

### 3.5 WeChat Deep Dive（workflow_type = `wechat_deep_dive`）

| 项 | 值 |
|---|---|
| 触发方式 | `manual`（Orchestrator 路由到 scenario/product/conversion 型 Topic；或人工指定） |
| 入参契约 | `{ batch_id: "2026W36-WECHAT", topic_id, source_packet_id, content_role?, target_user?, ... }` |
| 出参契约 | `output_type ∈ {deep_dive_plan, image_plan, outline, content_asset(wechat_article), source_packet_update}` |
| 产能规则 | `{ concurrency_limit: 1, serial_mode: true }` |
| 流程步骤 | 定义 **Content Role**（单值，`traffic/cognition/scenario/product/conversion`）→ Target User / Core User Problem / Decision User Needs to Make / Primary CTA → 蓝图 `deep_dive_plans`（12 段默认结构）→ 配图计划 `deep_dive_image_plans`（`image_type_priorities` 优先级约束）→ 成文 → Return |

**Deep Dive 约束（继承需求八）**：写作前必选且只选一个 `content_role`（单值列 + CHECK 强制）；每篇只有一个主 CTA（`deep_dive_plans.primary_cta`，默认继承 `topics.primary_cta` 需人工确认）；真实产品截图/UI 配图必须 `from_brand_asset` 或 `from_verified_source`（Logo 禁止 AI 重绘，`ai_policy='reference_only'`）。

---

## 4. workflow_runs 生命周期与状态机

### 4.1 Run 状态机（`workflow_run_status`）

```
                      ┌────────────────────────────┐
                      │         queued            │  入队（模板+输入已定格）
                      └────────────┬───────────────┘
                                   │ 调度器取出（capacity_control 放行）
                                   ▼
                      ┌────────────────────────────┐
            ┌────────│         running            │────────┐
            │        └────────────┬───────────────┘        │
            │ retry               │                        │ 异常/校验失败
            │ (attempt_count+1)   │ 正常结束               ▼
            │                     ▼              ┌────────────────────────────┐
            │          ┌────────────────────┐    │          failed           │
            │          │     completed      │    └────────────────────────────┘
            │          └────────────────────┘
            │                     ▲
            │        ┌────────────────────┐    │ 人工门禁（产物需审核）
            │        │   needs_review     │◄───┘
            │        └─────────┬──────────┘
            │                  │ 人工退回：同 run 重跑（attempt_count+1）或标记 needs_revision
            └──────────────────┴──────────────────────────────────────────┘
```

**迁移路径（权威定义，继承数据模型 §3.3）**：

| 迁移 | 触发者 | 动作 |
|---|---|---|
| `queued → running` | Orchestrator / 调度器 | `capacity_control` 放行；写 `started_at` |
| `running → completed` | Workflow 引擎 | 全部子任务完成，`completed_at` 落库，`output` 汇总 |
| `running → failed` | Workflow 引擎 | 异常/守卫拦截；`error`（jsonb）记原因；可 retry |
| `running → needs_review` | Workflow 引擎 | 产物需人工审核（如低候选 `low_candidate`、`review_required` 查重、Deep Dive 蓝图、涉敏感信息） |
| `needs_review → completed` | **人工** | 审核通过；可联动 `topics.status = Ready to Publish` |
| `needs_review → queued/running` | **人工** | 审核退回：同 run 重跑（`attempt_count + 1`，不新建 run） |
| `failed → queued` | **人工** | retry（重跑递增 `attempt_count`，模板/输入不变） |

> 说明：`attempt_count` 同 run 重跑递增不新建；同一批重跑如需新批次则新建 `workflow_batches`（batch_id 追加 `-NN`）。所有迁移写 `audit_log`（`actor = 用户标识 或 ai:run-xxx`）。

### 4.2 批次（workflow_batches）与 Run 的关系

- `workflow_batches` 是批次聚合根，`batch_id` 如 `2026W36-AI-WEEKLY`；同周重跑/多批追加 `-NN`（`2026W36-AI-WEEKLY-02`）。
- 批次状态机 `batch_status ∈ {planned, dispatching, in_progress, needs_review, completed, failed}`：
  - `planned`（Orchestrator 评分定级后生成）→ `dispatching`（确认并开始生产）→ `in_progress`（子 run 派发中）→ `completed`；含待审产物 → `needs_review`；异常 → `failed`。
- 一个批次含多个 `workflow_runs`（每个 run 一个 Topic 粒度或 Orchestrator 粒度），`workflow_runs.batch_id` 指回批次。

---

## 5. workflow_tasks 子任务拆分

`workflow_tasks` 记录步骤级执行（`UNIQUE(run_id, sequence)`）。**权威 task_type 取值**（`text`，可扩展，Orchestrator 步骤见 §2.1 映射）：

| task_type | 中文 | 归属工作流 | 说明 |
|---|---|---|---|
| `fact_check` | 事实核验 | ai_weekly / github_weekly / evergreen / orchestrator | 执行 `source_packet_items.number_test_conditions`，逐条更新核验状态 |
| `score` | 评分 | ai_weekly / github_weekly / orchestrator | 五维评分 + priority 推导 |
| `select` | 入选筛选 | ai_weekly（5-8 条）/ github_weekly | 更新 `selection_status = selected/eliminated`，记 `elimination_reason` |
| `script_generate` | 脚本/图文生成 | ai_weekly / evergreen / github_weekly | 产出脚本 → `workflow_outputs.content_asset` |
| `outline_generate` | 提纲生成 | ai_weekly / wechat_deep_dive | 极简提纲 / 深度文章提纲 |
| `trend_radar` | 趋势雷达 | ai_weekly | 产出 `trend_report`（管理在 orchestrator） |
| `secondary_candidates` | 二次内容候选 | ai_weekly | 趋势雷达派生的二次候选 → 回写 `event_pool` |
| `snapshot_capture` | 快照抓取 | github_weekly | 抓取 GitHub Trending Weekly → `github_snapshots` |
| `image_plan` | 配图计划 | wechat_deep_dive | 产出 `image_plan`（按 `image_type_priorities`） |
| `return_writeback` | Return 回写 | 全部 | 幂等消费 `workflow_outputs`（`applied=true`） |
| `dedupe` / `cluster` / `id_assign` / `route` / `capacity_check` / `cta_assign` / `derived_topic_manage` | Orchestrator 内建步骤（扩展值） | orchestrator | §2.1 第 2/3/4/7/8/9/11 步 |

步骤状态 `workflow_task_status ∈ {queued, running, completed, failed, skipped}`（比 run 多 `skipped`：前置失败或条件不满足时跳过并记原因）。`provider_class` 记录实际调用的 Provider 适配器类，用于成本/延迟审计。

---

## 6. workflow_outputs 产物契约

`workflow_outputs` 是 Workflow Return 回写的中转站：**AI 原始产出一律先进此表留痕，仅人工审核通过后提升为 `content_assets`**。两表边界 = "原始产出 vs 审核后资产"。

| output_type | 中文 | 内容（content jsonb） | 消费去向（Orchestrator return_writeback） |
|---|---|---|---|
| `production_plan` | 本周内容计划 | 周 Topic 计划列表、批次 | Dashboard「本周内容计划」展示；生成 `workflow_batches` |
| `selected_events` | 入选事件 | 事件列表（Topic_ID/入选状态/淘汰原因） | 入选提升为 `topics`（`event_pool.derived_topic_id`） |
| `trend_report` | 趋势雷达报告 | 信号/强度/新颖度/速度 | 写 `trend_radar`；二次候选回写 `event_pool` |
| `secondary_candidates` | 二次内容候选 | 派生候选列表 | 回写 `event_pool`、更新 `topic_clusters` |
| `derived_topics` | 衍生 Topic | 衍生概念列表（≤3） | 建 `topics`（parent）+ 写 `knowledge_derivations` 记账 |
| `content_asset` | 资产产出（文本） | 脚本/图文/文章正文 | 审核后提升 `content_assets`（`asset_id` 回填） |
| `source_packet_update` | 证据包更新 | 核验结论、新事实、`event_assessment` | 更新 `source_packet_items` / `source_packets` |
| `outline` | 提纲 | 极简/深度提纲 | 供审核与后续成文 |
| `knowledge_topic` | 知识 Topic | 概念、分类、知识状态 | 建 `knowledge_topic_bank` + 1:1 topics 行 |
| `deep_dive_plan` | 深度蓝图 | Content Role/12 段结构/CTA | 写 `deep_dive_plans`（`drafting → review`） |
| `image_plan` | 配图计划 | 各段配图类型/来源链 | 写 `deep_dive_image_plans` |

回写幂等机制：`applied`（boolean，默认 false）标记 Orchestrator 是否已消费；`applied_at` 记录时间；同一产物只消费一次。

---

## 7. Topic 全局状态机（`topic_status` 9 态）

Topic 是系统最核心实体，其 9 态为**全局唯一状态机**（需求一、数据模型 §1.1）。`content_assets.status` 为 `topic_status` 的子集（Draft/Producing/Review/Needs Revision/Ready to Publish/Published/Archived）。下表为**权威迁移定义**，每条标注触发者（AI / 人工 / Orchestrator）。

```
Draft → Researching → Ready for Production → Producing → Review
    → Needs Revision → Ready to Publish → Published → Archived
```

| 迁移 | 触发者 | 前置条件 / 守卫 | 动作说明 |
|---|---|---|---|
| `Draft → Researching` | Orchestrator / AI | `source_packet_id` 可空 | 候选提升为 Topic 或人工建 Topic 后进入调研；证据包开始聚合 |
| `Researching → Ready for Production` | **人工**（或 Orchestrator 自动评估） | 证据包核验 ≥ `verified`；`primary_cta` **必填**（守卫校验）；五维评分 + `priority` 已定 | 事实核验完成、选题定案，可进入生产 |
| `Ready for Production → Producing` | **人工**（确认并开始生产）或 Orchestrator 派发 | 路由规则已命中、产能放行 | 子 workflow 开始生产内容资产 |
| `Producing → Review` | AI（子 workflow 完成） | `workflow_runs.status = completed` 或 `needs_review`；产物已落 `workflow_outputs` | 生产完成，进入人工审核门禁 |
| `Review → Needs Revision` | **人工** | 审核不通过 | 退回修改；`workflow_runs.attempt_count+1` 重跑，或 Deep Dive 蓝图 `needs_revision` |
| `Needs Revision → Producing` | **人工** | 退回原因已确认 | 重新生产（同 run 重跑或新 run） |
| `Review → Ready to Publish` | **人工** | 审核通过；资产状态同步为 `Ready to Publish` | 待发布，等待 Publication Center 排期 |
| `Ready to Publish → Published` | **人工** | **必须存在 `publications` 记录**（DB 触发器/应用层禁止 workflow 直写 `published`） | 发布成功，回填 `published_date / published_url / published_by` |
| `Ready to Publish → Needs Revision` | **人工** | 发布前复核不通过 | 退回生产/修改 |
| `Published → Archived` | **人工** | — | 内容下架/归档，写 `archived_at` |
| `Ready to Publish → Archived`（或任意非 Published 态 → Archived） | **人工** | — | 放弃/停止推进，直接归档 |

> 关键门禁（继承数据模型 §2.8）：
> 1. **V1 绝不自动发布**：`topics.status = Published` 只能人工确认且需存在 `publications` 记录。
> 2. `primary_cta` 在 `Ready for Production` 前必填。
> 3. 所有状态迁移写 `audit_log`；`topic_status_history` = 对 `audit_log` 的视图，供 Topic Detail Timeline。

---

## 8. 各子工作流的状态流转与产能约束

### 8.1 AI Weekly（每周一 · 5-8 条）

- **触发**：每周一定时；统计口径 = 上一完整自然周（`week_start`/`week_end` 显式存 `workflow_batches`）；入池过滤键 = `event_pool.event_date`（不用 `created_at`）。
- **流转**（run 级）：`queued → running（fact_check → score → select → script_generate → outline_generate → trend_radar → secondary_candidates → return_writeback）→ completed`。
- **产能约束**：`weekly_quota 5-8 条`；V1 不足 5 条按实际通过数发布，批次标 `low_candidate` 触发人工 `needs_review`。`concurrency_limit=1, serial_mode=true`。
- **事件入选**：写 `event_pool.selection_status=selected`，提升生成 `topics`（`topic_type='hot'/'trend'`，`derived_topic_id` 回填）。

### 8.2 GitHub Weekly（每周一 · Snapshot 不可变）

- **触发**：每周一抓取上一自然周 GitHub Trending Weekly。
- **流转**（run 级）：`queued → running（snapshot_capture → fact_check → select → 图文生成 → return_writeback）→ completed`。
- **快照冻结**：`github_snapshots.status: captured → frozen`（frozen 后触发器禁改删）；同口径同周唯一；Replay 新建行（`source_item_id` 血缘）**永不覆盖 Original**。
- **选中落 Topic**：`github_snapshot_items.selected=true` → 落 `topics`（`topic_type='technical_project'/'trend'`，`topic_id` 回填）。
- **产能约束**：`concurrency_limit=1, serial_mode=true`；`selection_basis` 每次抓取显式声明。

### 8.3 Evergreen Knowledge（一次一主 · 衍生 ≤3）

- **触发**：Orchestrator 按 `knowledge_topic_bank.next_action` 或人工点单；每次调用恰 1 个主 Topic。
- **流转**（run 级）：`queued → running（select → fact_check → knowledge_topic 建库 → 内容生产 → derived_topics(≤3) → return_writeback）→ completed`。
- **产能约束（双保险）**：数据库 `knowledge_derivations UNIQUE(workflow_run_id, round_index)`（CHECK round_index 1-3）+ 应用层守卫 `checkDerivedTopicBudget`；超限拦截并记 `audit_log`（`action='budget_denied'`）。
- **知识状态联动**：`knowledge_topic_bank.knowledge_status`（uncovered → partial → basic_explanation → deep_explanation → needs_update → mature）与 `content_status`（to_research → to_produce → script_done → wechat_done → graphic_done → published → high_performing → needs_remake）由本工作流推进，最终逐资产真实状态以 `content_asset_versions.status` 为准。

### 8.4 WeChat Deep Dive（单 Content Role · 单主 CTA）

- **触发**：Orchestrator 路由到 scenario/product/conversion 型 Topic，或人工指定。
- **流转**：`deep_dive_plans.status: drafting → review →（needs_revision ⇄）approved → archived`；`approved` 后产出 `content_assets(wechat_article)`，进入 §7 全局 Topic 状态机（Producing → Review → …）。
- **产能约束**：`concurrency_limit=1, serial_mode=true`；蓝图版本 `version` 退回重做递增。
- **硬约束**：单值 `content_role`（CHECK）；单主 CTA（`deep_dive_plans.primary_cta` 默认继承 `topics.primary_cta`，审核校验 `plan.primary_cta == topic.primary_cta`）；配图真实截图/UI 必须 `from_brand_asset`/`from_verified_source`。

---

## 9. AI 调用层抽象（三层职责与接口）

遵循需求九"AI 调用层必须抽象、不把模型 SDK 散落在业务代码"。目录：`/lib/ai/providers`、`/lib/ai/orchestrator`、`/lib/ai/workflows`。

### 9.1 三层职责

| 层 | 目录 | 职责 | 禁止事项 |
|---|---|---|---|
| **Providers（模型适配器）** | `/lib/ai/providers` | 封装模型供应商 SDK（LLM Provider）；统一 `call()` 接口，负责 token 计数、重试、成本审计、结构化输出解析 | 禁止包含业务 Prompt 与工作流逻辑；禁止业务代码直接 `import` 供应商 SDK |
| **Orchestrator（编排回写层）** | `/lib/ai/orchestrator` | 执行 §2 流水线 12 步；读 `workflow_templates.step_definition` 编排子 workflow；调用 Providers；消费 `workflow_outputs` 回写（幂等 `applied`）；管理批次/产能/路由 | 禁止内联业务 Prompt（Prompt 只存 `ai_prompt_templates`） |
| **Workflows（业务子工作流）** | `/lib/ai/workflows` | 实现 4 个子 workflow（ai-weekly / github-weekly / evergreen / wechat-deep-dive）的具体步骤序列；生成 `workflow_outputs`；调用 Orchestrator 暴露的 Providers | 禁止直接调用供应商 SDK；禁止写 `topics` 主表状态（状态迁移统一由 §7 守卫处理） |

### 9.2 核心接口契约（TypeScript，TS strict）

```typescript
// /lib/ai/providers/types.ts — Provider 统一接口
interface AIProvider {
  readonly id: string;                  // "anthropic" | "openai" | "deepseek" | ...
  call(req: AIRequest): Promise<AIResponse>;
}

interface AIRequest {
  promptKey: string;                    // 对应 ai_prompt_templates.key，如 "ai-weekly/event-assessment/v1"
  params: Record<string, unknown>;      // prompt 模板参数（由 workflow 填充，无散落 Prompt）
  outputSchema?: ZodType | JSONSchema;  // 结构化输出契约
  maxTokens?: number;
  temperature?: number;
}

interface AIResponse {
  content: unknown;                     // 解析后的结构化结果
  usage: { promptTokens: number; completionTokens: number; costCents: number };
}
```

```typescript
// /lib/ai/orchestrator/orchestrator.ts — 编排入口
type OrchestratorInput = {
  week: string;
  batchId?: string;
  candidateIds?: string[];              // 候选接收（event_pool 入池）
  topicIdList?: string[];               // Topic_ID_List
  includeRouting?: boolean;             // 是否执行路由/派发
  includeProductionDispatch?: boolean;  // 是否「确认并开始生产」
};
async function runOrchestrator(input: OrchestratorInput): Promise<WorkflowRunId>;
// 返回 orchestrator workflow_runs.id；内部按 §2 顺序执行 12 步，
// 派发子 run（parent_run_id = 本 run），收集 workflow_outputs 后 return_writeback。
```

```typescript
// /lib/ai/workflows/*.ts — 子工作流入口（每个返回 output 数组）
interface SubWorkflowRunner {
  readonly workflowType: WorkflowType;   // ai_weekly | github_weekly | evergreen_knowledge | wechat_deep_dive
  run(ctx: RunContext): Promise<WorkflowOutput[]>;
}
interface RunContext {
  runId: string;                        // 本子 run id
  template: WorkflowTemplate;           // 版本化定义（input_schema/output_schema/step_definition）
  batchId: string;
  topicId?: string;
  sourcePacketId?: string;
  provider: AIProvider;                 // 由 Orchestrator 注入，业务层不得自行选择供应商
}
```

### 9.3 Prompt 与模板的取用链路

```
workflow_templates.prompt_refs ──► ai_prompt_templates.key（DB 单一来源）
    或 ──► /ai-prompts/*.md（源文件导入来源）
workflow_templates.step_definition ──► [task_type, provider_class, params]
```

- Prompt 单一来源 = `ai_prompt_templates`（DB 版本化，`UNIQUE(key, version)`）。
- `workflow_templates` 版本化（`UNIQUE(workflow_type_key, version)`）；`workflow_runs` 快照 `template_id + template_version`，保证历史 run 可复现。
- **禁止**：把 Prompt 写死在页面组件；业务代码 `import` 模型 SDK。

---

## 10. 与 13 份正式文档的引用关系

- `_canonical-workflow.md`（本文件）为行为契约唯一事实源；数据字段唯一事实源为 `_canonical-data-model.md`。
- 后续文档（00-product-vision … 12-roadmap）、状态机图、页面数据契约引用本文件 §2/§4/§7/§8 时，**以英文标识符为准**，中文仅作说明。
- 发现设计冲突或需求不清晰时：先列出问题与推荐方案，不擅自删减需求字段。

---

## 附录 A：术语速查（英文 → 中文）

| 英文标识符 | 中文 | 枚举/取值 |
|---|---|---|
| `workflow_type` | 工作流类型 | orchestrator / ai_weekly / github_weekly / evergreen_knowledge / wechat_deep_dive |
| `workflow_run_status` | Run 状态 | queued / running / completed / failed / needs_review |
| `workflow_task_status` | 步骤状态 | queued / running / completed / failed / skipped |
| `workflow_output_type` | 产物类型 | production_plan / selected_events / trend_report / secondary_candidates / derived_topics / content_asset / source_packet_update / outline / knowledge_topic / deep_dive_plan / image_plan |
| `batch_status` | 批次状态 | planned / dispatching / in_progress / needs_review / completed / failed |
| `topic_status` | Topic 全局状态 | Draft / Researching / Ready for Production / Producing / Review / Needs Revision / Ready to Publish / Published / Archived |
| `capacity_rules` | 产能规则 | { concurrency_limit, weekly_quota, serial_mode }；AI Weekly quota 5-8，Evergreen serial_mode=true |
| `content_role` | 内容角色 | traffic / cognition / scenario / product / conversion（单值） |
