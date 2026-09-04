# 06 · 工作流引擎（Workflow Engine）

> **状态**：正式设计文档（落地级）。本文档面向实现者，字段、枚举、路由、状态一律以基线为唯一事实源，可据此直接编码。
> **事实源引用**：
> - 需求原文：`docs/_requirements.md`（第四/五/六/七/八/九节）
> - 数据模型基线：`docs/_canonical-data-model.md`（§1.3 Workflow 域枚举、§2.1/§2.2 ID 规则、§3.3 Domain C、§3.8 trend_radar）
> - 工作流基线：`docs/_canonical-workflow.md`（§2 Orchestrator、§3 注册表、§4 Run 状态机、§5 tasks、§6 outputs、§9 AI 抽象）
> - IA 基线：`docs/_canonical-ia.md`（`/workflows`、`/workflows/runs` 页面）
> - 路线图基线：`docs/_canonical-roadmap.md`（M2/M3 阶段、D9/D10 任务）
> **约定**：中文撰写；标识符、枚举、表/列名一律使用基线英文原值；本文件不新增、不改写任何表字段。

---

## 1. 架构总览

遵循需求四"Orchestrator + 子 Workflow 架构"：**不把 Prompt 写死在页面组件里**。工作流引擎自下而上四层分工（对应 `_canonical-workflow.md` §1）：

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
│  AI 调用层抽象（见 §8）                                             │
│  /lib/ai/providers（模型适配器）→ /lib/ai/orchestrator（编排回写）    │
│  → /lib/ai/workflows（业务子工作流）                                 │
└──────────────────────────────────────────────────────────────────┘
```

**核心表链路**（`_canonical-data-model.md` §3.3 Domain C，34 表建表顺序第 3-16 位）：

```
workflow_types → workflow_templates（版本化定义 + prompt_refs → ai_prompt_templates）
              → workflow_batches（批次聚合根，Batch_ID 生命周期）
              → workflow_runs（父 Orchestrator run + 子 run，parent_run_id 调用树）
              → workflow_tasks（步骤级执行，UNIQUE(run_id, sequence)）
              → workflow_outputs（类型化产物，applied 幂等回写）
              → workflow_routing_rules（可审计路由规则）
```

**全局硬性原则**（继承 `_canonical-workflow.md` §1 / `_canonical-data-model.md` §2.8）：

1. 所有评分、定级、查重、聚类、CTA 判断、路由、状态迁移均由 Orchestrator 作为 `workflow_type='orchestrator'` 的 run 落库（`workflow_runs`），子 workflow 经 `parent_run_id` 挂父 run，形成可审计调用树。
2. 人工审核门禁：V1 绝不自动发布；`workflow_runs.status = needs_review` 为人工门禁吸收态。
3. 任何人工审核动作与状态变更写 `audit_log`（`actor = 用户标识 或 ai:run-xxx`）。

---

## 2. 内容总控台 Orchestrator（职责与流水线）

### 2.1 职责清单与执行顺序（流水线 12 步）

Orchestrator 是唯一编排者，一次 Orchestrator run 代表一次「生成本周内容计划」或「确认并开始生产」派发。每步落 `workflow_tasks`（`UNIQUE(run_id, sequence)`），关键裁决结果落 `workflow_outputs`。

| 序号 | 职责（中文） | 英文标识 | 输入 | 输出 / 落库 | task_type 映射 |
|---|---|---|---|---|---|
| 1 | 候选接收 | `candidate_reception` | 联网扫描后的候选事件（本周事件池） | `event_pool` 入池，`selection_status='pending'`、`history_dedupe_status='not_checked'` | `fact_check`（证据包预绑定） |
| 2 | 历史查重 | `history_dedupe` | 候选 + 既有 topics | `event_pool.history_dedupe_status` 置 `unique` / `clustered` / `duplicate` / `merged` / `review_required` | `dedupe`（扩展值） |
| 3 | 聚类 | `topic_clustering` | 查重结果 | `topic_clusters` 收敛相似候选到 `canonical_topic_id`；`topics.dedupe_cluster_id` 指向所属簇；`dedupe_matched_topic_id` 记录被并入既有 Topic | `cluster`（扩展值） |
| 4 | Topic ID 分配 | `topic_id_assignment` | 入选候选 | `topics.topic_id`（如 `2026W36-001`）；同批 Topic_ID_List 即本周分配 ID 集合 | `id_assign`（扩展值） |
| 5 | 评分 | `scoring` | 五维 + business_relevance | `topics.b2b_relevance/traffic_potential/conversion_potential/timeliness/content_value` 落库；`score_rationale`（jsonb）记推导依据；`score_version` 递增 | `score` |
| 6 | 优先级 | `priority_assignment` | 评分结果 | `topics.priority`（P0-P3，分档与门控见 §2.3） | `score`（同步） |
| 7 | Workflow 路由 | `workflow_routing` | Topic 类型 / 趋势标签 | `workflow_routing_rules` 命中 → 指定子 workflow（映射见 §2.4）；可人工覆盖（`overridable`） | `route`（扩展值） |
| 8 | 产能控制 | `capacity_control` | 当前批次产能配额 | 生成 `workflow_batches`（`status='dispatching'`）；按 `capacity_rules` 决定派发批次与串并行（详见 §5） | `capacity_check`（扩展值） |
| 9 | CTA 判断 | `cta_assignment` | business_relevance + topic_type | `topics.primary_cta`（FK→`ctas.id` 受控词表，单值）；进入 `Ready for Production` 前必填守卫 | `cta_assign`（扩展值） |
| 10 | 趋势雷达 | `trend_radar_management` | 各子工作流回传信号 | 管理 `trend_radar` 结果：二次候选回写 `event_pool`、更新 `topic_clusters`；**生成在 workflow，管理在 orchestrator** | `trend_radar`（管理态） |
| 11 | 衍生管理 | `derived_topic_management` | Evergreen 回传衍生 Topic | `knowledge_derivations` 记账；守卫函数 `checkDerivedTopicBudget` 拦截超限（≤3），记 `audit_log`（`action='budget_denied'`） | `derived_topic_manage`（扩展值） |
| 12 | Return 回写 | `return_writeback` | 各子 run 的 `workflow_outputs` | 消费产物（`applied=true` 幂等）：提升 Topic、更新 Source Packet、落资产引用、刷新趋势雷达；批次 `status='completed'`（详见 §7） | `return_writeback` |

> 第 1-6 步构成「候选 → 本周内容计划」（对应 Dashboard CTA「生成本周内容计划」）；第 7-12 步构成「确认并开始生产」的派发与回写（对应 CTA「确认并开始生产」）。两段可在一次 Orchestrator run 内完成，也可拆分为两次 run（`batch_status` 分别为 `planned` / `dispatching`）。

### 2.2 Topic ID 分配规则

- 格式 `YYYY Www - NNN`，正例 `2026W36-001`，正则 `^[0-9]{4}W[0-9]{2}-[0-9]{3}$`。
- **周语义**：取目标内容周（与 `batch_id` 前缀一致），不取创建周；`topics.content_week` 列显式存储（如 `2026-12-28` 属 `2027W01`，避免 ISO 跨年漂移）。
- 序号**按周唯一**、周内递增分配、**删除不回收**，保证血缘与历史引用稳定。
- 分配由 Orchestrator `id_assign` 步骤执行并回写 `topics.topic_id`。

### 2.3 评分 → priority 映射

- 五维均 `smallint CHECK 1-10`：`b2b_relevance` / `traffic_potential` / `conversion_potential` / `timeliness` / `content_value`。
- 加权：`priority_score = Σ(w_i × dim_i)`，权重按 `topic_type` 使用**不同权重画像**（配置驱动，存 `system_settings`，如 `scoring.weights.default` / `scoring.weights.hot` / `scoring.weights.evergreen` / `scoring.weights.conversion`，不硬编码）：
  - 通用默认：`0.20 / 0.20 / 0.25 / 0.20 / 0.15`；
  - `hot`/`trend`：`timeliness` 提权（如 0.35）；
  - `evergreen`/`knowledge`：`content_value` 提权（如 0.35）；
  - `conversion`/`product`：`conversion_potential` 提权（如 0.40）。
- **分档**：`P0 ≥ 8.0`；`P1 ≥ 6.5`；`P2 ≥ 5.0`；`P3 < 5.0`（阈值存 `system_settings`：`scoring.threshold.p0/p1/p2`）。
- **门控与兜底**：`business_relevance`（1-10）不参与加权——<4 且非 `product`/`conversion` 型**封顶 P2**；`hot`/`trend` 型 `timeliness=10` 时兜底至少 `P1`。
- **审计**：结果落 `topics.priority`，依据落 `topics.score_rationale`（jsonb，含各维分值、权重、阈值判定、business_relevance 门控结论），`score_version` 变更即递增；由 Orchestrator 评分职责执行并写 `workflow_runs` 留痕。

### 2.4 路由规则（workflow_routing_rules 默认映射）

| match_field | match_value | workflow_type_key |
|---|---|---|
| `topic_type` | `hot` / `trend` | `ai_weekly` |
| `topic_type` | `technical_project` | `github_weekly` |
| `topic_type` | `knowledge` / `evergreen` | `evergreen_knowledge` |
| `topic_type` | `scenario` / `product` / `conversion` | `wechat_deep_dive` |

- 所有规则 `overridable=true`（允许人工覆盖路由，`/workflows` 页面提供开关）；命中时按 `priority` 取最高优先规则。
- 匹配字段支持 `topic_type` 或 `trend_tag` 两种（`match_field`）。

---

## 3. 工作流注册表（workflow_types + workflow_templates）

注册表主体为 `workflow_types`（key/name/scheduling/capacity_rules/enabled）与 `workflow_templates`（版本化 input_schema / output_schema / prompt_refs / step_definition）。落库时：`workflow_types` 一行 + 每类型 `workflow_templates` 至少一个 active 版本（`UNIQUE(workflow_type_key, version)`）。种子数据在 M0（D2）写入。

### 3.0 注册表公共结构

```jsonc
// workflow_types 示例行（ai_weekly）
{
  "key": "ai_weekly",
  "name": "AI 周报工作流",
  "scheduling": "weekly",
  "capacity_rules": { "concurrency_limit": 1, "weekly_quota": { "min": 5, "max": 8 }, "serial_mode": true },
  "enabled": true
}
```

```jsonc
// workflow_templates v1 示例（ai_weekly）
{
  "workflow_type_key": "ai_weekly",
  "version": 1,
  "input_schema":  { "batch_id": "2026W36-AI-WEEKLY", "week": "2026W36", "topic_id_list": [], "source_packet_ids": [], "event_pool_ids": [] },
  "output_schema": { "allowed_output_types": ["selected_events", "outline", "content_asset", "trend_report", "secondary_candidates", "source_packet_update"] },
  "prompt_refs":   { "fact_check": "ai-weekly/fact-check/v1", "score": "ai-weekly/event-assessment/v1", "script_generate": "ai-weekly/script/v1", "outline_generate": "ai-weekly/outline/v1", "trend_radar": "ai-weekly/trend-radar/v1", "secondary_candidates": "ai-weekly/secondary-candidates/v1" },
  "step_definition": [ { "task_type": "fact_check", "provider_class": "AnthropicProvider", "params": {} }, ... ]
}
```

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
| 触发方式 | `weekly`（**每周一 09:00** 定时；统计口径 = 上一完整自然周 周一 00:00 – 周日 23:59） |
| 入参契约 | `{ batch_id: "2026W36-AI-WEEKLY", week, topic_id_list: Topic_ID_List, source_packet_ids[], event_pool_ids[] }` |
| 出参契约 | `output_type ∈ {selected_events, outline, content_asset(ai_weekly_script), trend_report, secondary_candidates, source_packet_update}` |
| 产能规则 | `{ concurrency_limit: 1, weekly_quota: {min:5, max:8}, serial_mode: true }`（选 **5-8 条**；V1 不足 5 条按实际通过数发布并在批次标 `low_candidate` 提示人工，触发 `needs_review`） |
| 流程步骤 | 候选事件池 → 事实核验（`fact_check`）→ 评分（`score`）→ 选 5-8 条（`select`）→ 90 秒中文口播脚本（`script_generate`）→ 极简提纲（`outline_generate`）→ 趋势雷达（`trend_radar`）→ 二次内容候选（`secondary_candidates`）→ Workflow Return（`return_writeback`） |

**事件必达字段**（`event_pool`，需求五）：`topic_id`（提升后回填 `derived_topic_id`）、发布时间（`published_at`）、来源（`source_name`/`source_url`/`source_type`）、行业影响（`industry_impact`）、用户感知（`user_perception`）、技术变化（`tech_change`）、应用价值（`application_value`）、传播潜力（`propagation_potential`）、入选状态（`selection_status`）、淘汰原因（`elimination_reason`）。五维评估同时以 `event_assessment` jsonb 挂 `source_packet_items`，使评估与证据同源。

**入选落库**：`event_pool.selection_status='selected'` → 提升生成 `topics`（`topic_type='hot'/'trend'`，`derived_topic_id` 回填）；`eliminated` 时 `elimination_reason` 必填。

### 3.3 GitHub Weekly（workflow_type = `github_weekly`）

| 项 | 值 |
|---|---|
| 触发方式 | `weekly`（每周一抓取上一自然周 GitHub Trending Weekly） |
| 入参契约 | `{ batch_id: "2026W36-GITHUB", week, snapshot_week }` |
| 出参契约 | `output_type ∈ {content_asset(github_card), selected_events, source_packet_update}` |
| 产能规则 | `{ concurrency_limit: 1, serial_mode: true }` |
| 流程步骤 | 抓取周榜（`snapshot_capture`）→ 建立 Snapshot（`github_snapshots`，不可变）→ 核验（`fact_check`）→ 评分选中（`select`）→ GitHub 图文卡片（`script_generate`/资产提升）→ Return |

**Snapshot 不可变（三重保障 + 按字段域冻结）**：
1. `UNIQUE(week, snapshot_type, selection_basis)` —— 同口径同周只能一个快照；
2. `status='frozen'` 后 `BEFORE UPDATE / BEFORE DELETE` 触发器拒绝任何修改/删除；软删除策略 = 不提供物理删除，仅新增 Replay 行；
3. Replay（`snapshot_type='replay'`）一律新建行，`source_item_id` 指向 Original 行，永不覆盖 Original。

- `selection_basis ∈ {pure_weekly_rank, value_filtered, mixed}`；`snapshot_id` 格式 `2026W36-GH-ORIGINAL-PURE`（周-类型-口径）。
- 捕获列（`rank/repository/project_name/weekly_growth/total_stars/repo_url`）冻结；运营列（`verification_status/selected/elimination_reason`）可变更并记 `audit_log`（核验发生在捕获之后）。
- **选中落 Topic**：`github_snapshot_items.selected=true` → 落 `topics`（`topic_type='technical_project'/'trend'`，`topic_id` 回填）。

### 3.4 Evergreen Knowledge（workflow_type = `evergreen_knowledge`）

| 项 | 值 |
|---|---|
| 触发方式 | `manual`（Orchestrator 路由，按 `knowledge_topic_bank.next_action` 选择开采概念；或人工点单） |
| 入参契约 | `{ batch_id: "2026W36-EVERGREEN", main_topic_id?, concept_id?, topic_id_list[] }` |
| 出参契约 | `output_type ∈ {knowledge_topic, derived_topics, content_asset(ai_weekly_script/wechat_article/...), source_packet_update}` |
| 产能规则 | `{ concurrency_limit: 1, serial_mode: true }`（串行；**一次一主 Topic**） |
| 流程步骤 | 选定概念（`select`）→ 事实核验（`fact_check`）→ 建立 Knowledge Topic（`knowledge_topic` 产出 + 1:1 topics 行，`topic_type='knowledge'`）→ 内容生产（`script_generate`/`outline_generate`）→ 衍生 Topic 生成（`derived_topics`，≤3）→ Return |

**衍生预算（双保险）**：
- "一次生产"的边界 = 一个 `workflow_runs` run；每 run 恰 1 个主 Topic（`knowledge_derivations.main_topic_id`）；
- 完成后最多新增 3 个衍生 Topic（`parent_topic_id = main_topic_id`，`round_index ∈ 1..3`）；
- 数据库兜底 `knowledge_derivations UNIQUE(workflow_run_id, round_index)`（CHECK round_index 1-3）+ 应用层守卫 `checkDerivedTopicBudget`（超限拦截并记 `audit_log`，`action='budget_denied'`）。

**知识状态联动**：`knowledge_status`（`uncovered → partial → basic_explanation → deep_explanation → needs_update → mature`）与 `content_status`（`to_research → to_produce → script_done → wechat_done → graphic_done → published → high_performing → needs_remake`）由本工作流推进；最终逐资产真实状态以 `content_asset_versions.status` 为准。

### 3.5 WeChat Deep Dive（workflow_type = `wechat_deep_dive`）

| 项 | 值 |
|---|---|
| 触发方式 | `manual`（Orchestrator 路由到 scenario/product/conversion 型 Topic；或人工指定） |
| 入参契约 | `{ batch_id: "2026W36-WECHAT", topic_id, source_packet_id, content_role?, target_user?, ... }` |
| 出参契约 | `output_type ∈ {deep_dive_plan, image_plan, outline, content_asset(wechat_article), source_packet_update}` |
| 产能规则 | `{ concurrency_limit: 1, serial_mode: true }` |
| 流程步骤 | 定义 **Content Role**（单值，`traffic/cognition/scenario/product/conversion`）→ Target User / Core User Problem / Decision User Needs to Make / Primary CTA → 蓝图 `deep_dive_plans`（12 段默认结构）→ 配图计划 `deep_dive_image_plans`（`image_type_priorities` 优先级约束）→ 成文 → Return |

**Deep Dive 硬约束**：
- 写作前必选且只选一个 `content_role`（单值列 + CHECK 强制"只选一个"）；
- 每篇只有一个主 CTA（`deep_dive_plans.primary_cta`，默认继承 `topics.primary_cta` 需人工确认；审核校验项 `plan.primary_cta == topic.primary_cta`）；
- 配图：真实产品截图/UI 必须 `source_status='from_brand_asset'` 或 `'from_verified_source'`；Logo 禁止 AI 重绘（`brand_assets` 数据层强制 `CHECK (type='logo' → ai_policy='reference_only')`）；
- 蓝图状态机：`deep_dive_plans.status: drafting → review →（needs_revision ⇄）approved → archived`；`approved` 后产出 `content_assets(wechat_article)` 进入全局 Topic 状态机（`Producing → Review → ...`）；蓝图 `version` 退回重做递增。

---

## 4. Batch_ID 与周窗口

### 4.1 Batch_ID 生成规则（继承 `_canonical-data-model.md` §2.2）

- 格式：`{ISO周}-{WORKFLOW_KIND}`，如 `2026W36-AI-WEEKLY`。
- `WORKFLOW_KIND ∈ {AI-WEEKLY, GITHUB, EVERGREEN, WECHAT, ORCHESTRATOR}`（注意 GitHub 为 `GITHUB`，非 `GITHUB-WEEKLY`）。
- **同周重跑/多批**追加 `-NN` 序号后缀：`2026W36-AI-WEEKLY-02`（新建 `workflow_batches` 行）。
- **run 粒度**：`run_number` = batch_id 追加 `-R{序号}`：`2026W36-AI-WEEKLY-R01`（`workflow_runs.run_number`，`UNIQUE`）。
- 相关 ID 族：
  - 快照 `snapshot_id`：`2026W36-GH-ORIGINAL-PURE`（周-类型-口径）；
  - 候选 `candidate_id`：`2026W36-AI-CAND-001`；
  - 证据包 `packet_id`：`2026W36-001-SP`；
  - Topic 业务 ID：`2026W36-001`（§2.2）。

**示例**（2026 年第 36 周）：

| 实体 | 示例值 |
|---|---|
| `workflow_batches.batch_id`（AI Weekly 首跑） | `2026W36-AI-WEEKLY` |
| `workflow_batches.batch_id`（AI Weekly 同周重跑） | `2026W36-AI-WEEKLY-02` |
| `workflow_runs.run_number`（批次内第 1 个 run） | `2026W36-AI-WEEKLY-R01` |
| `github_snapshots.snapshot_id` | `2026W36-GH-ORIGINAL-PURE` |
| `event_pool.candidate_id` | `2026W36-AI-CAND-001` |
| `source_packets.packet_id` | `2026W36-001-SP` |

### 4.2 周窗口（统计口径）

- **AI Weekly**：上一完整自然周，周一 00:00 – 周日 23:59，**每周一生产**；`workflow_batches.week_start` / `week_end`（`date` 类型）显式存储。
- **GitHub Weekly**：每周一抓取上一自然周 GitHub Trending Weekly（`snapshot_week`）。
- **入池过滤键**：`event_pool.event_date`（事件原始发生/披露时间，与 Source Packet 的 `event_date` 对齐），**不用 `created_at`**。
- **周语义统一**：batch_id 前缀周 = 目标内容周 = `topics.content_week`，便于 Dashboard 当前周对齐。

### 4.3 批次状态机（`batch_status`）

`batch_status ∈ {planned, dispatching, in_progress, needs_review, completed, failed}`：

```
planned（Orchestrator 评分定级后生成）
  → dispatching（「确认并开始生产」）
  → in_progress（子 run 派发中）
  → completed；含待审产物 → needs_review；异常 → failed
```

- `workflow_batches` 是批次聚合根；`orchestrator_run_id` 指向生成批次的 Orchestrator run；`topic_ids`（jsonb）承载 `Topic_ID_List`。
- 一个批次含多个 `workflow_runs`（每个 run 一个 Topic 粒度或 Orchestrator 粒度），`workflow_runs.batch_id` 指回批次。

---

## 5. 产能控制

### 5.1 产能规则结构

`workflow_types.capacity_rules`（jsonb）：`{ concurrency_limit, weekly_quota, serial_mode }`；全局并发兜底键 `capacity.global_concurrency`（`system_settings`）。

| 工作流 | concurrency_limit | weekly_quota | serial_mode |
|---|---|---|---|
| `orchestrator` | 1 | — | true |
| `ai_weekly` | 1 | `{min:5, max:8}` | true |
| `github_weekly` | 1 | — | true |
| `evergreen_knowledge` | 1 | — | true |
| `wechat_deep_dive` | 1 | — | true |

> 全工作流 `serial_mode=true`：编排串行，避免状态竞争；同一时刻仅一个 run 在 running。

### 5.2 执行点

- **Orchestrator 第 8 步 `capacity_control`**（task_type=`capacity_check`）：按当前批次产能配额生成 `workflow_batches`（`status='dispatching'`），决定派发批次与串并行；调度器据此放行 `queued → running`。
- **AI Weekly 配额**：选 **5-8 条**；V1 不足 5 条时按实际通过数发布，批次标注 `low_candidate` 提示人工，run 进入 `needs_review`（人工门禁吸收态）。
- **Evergreen 配额**：一次一主 Topic（§3.4 衍生预算双保险），`knowledge_derivations.round_index ∈ 1..3` 数据库兜底。
- **M3 以手动触发为主**；`scheduling='weekly'`（每周一 09:00 定时器）按路线图 **M5 启用**（`_canonical-roadmap.md` §1.2 第 8 项）。

---

## 6. Run 状态机（`workflow_run_status`）

### 6.1 五态定义与迁移图

`workflow_run_status ∈ {queued, running, completed, failed, needs_review}`：

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

### 6.2 迁移路径（权威定义）

| 迁移 | 触发者 | 动作 |
|---|---|---|
| `queued → running` | Orchestrator / 调度器 | `capacity_control` 放行；写 `started_at` |
| `running → completed` | Workflow 引擎 | 全部子任务完成，`completed_at` 落库，`output` 汇总 |
| `running → failed` | Workflow 引擎 | 异常/守卫拦截；`error`（jsonb）记原因；可 retry |
| `running → needs_review` | Workflow 引擎 | 产物需人工审核（如低候选 `low_candidate`、`review_required` 查重、Deep Dive 蓝图、涉敏感信息） |
| `needs_review → completed` | **人工** | 审核通过；可联动 `topics.status = Ready to Publish` |
| `needs_review → queued/running` | **人工** | 审核退回：同 run 重跑（`attempt_count + 1`，不新建 run） |
| `failed → queued` | **人工** | retry（重跑递增 `attempt_count`，模板/输入不变） |

### 6.3 执行留痕与重跑语义

- `workflow_runs` 关键列：`run_number`（UNIQUE）、`workflow_type_key`、`template_id` + `template_version`（模板快照，保证历史 run 可复现）、`batch_id`、`topic_id`、`parent_run_id`、`input_payload`（jsonb）、`source_packet_id`、`status`、`attempt_count`、`started_at` / `completed_at`、`output`（jsonb）、`error`（jsonb）。
- **重跑语义**：同 run 重跑 `attempt_count + 1` 不新建；同一批重跑如需新批次则新建 `workflow_batches`（batch_id 追加 `-NN`）；所有迁移写 `audit_log`（`actor = 用户标识 或 ai:run-xxx`）。

### 6.4 步骤级状态（`workflow_task_status`）

`workflow_task_status ∈ {queued, running, completed, failed, skipped}` —— 比 run 多 `skipped`：前置失败或条件不满足时跳过并记原因。步骤表约束 `UNIQUE(run_id, sequence)`；`provider_class` 记录实际调用的 Provider 适配器类，用于成本/延迟审计。

**权威 task_type 取值**（`workflow_tasks.task_type`，text，可扩展）：

| task_type | 中文 | 归属工作流 |
|---|---|---|
| `fact_check` | 事实核验 | ai_weekly / github_weekly / evergreen / orchestrator |
| `score` | 评分 | ai_weekly / github_weekly / orchestrator |
| `select` | 入选筛选 | ai_weekly（5-8 条）/ github_weekly |
| `script_generate` | 脚本/图文生成 | ai_weekly / evergreen / github_weekly |
| `outline_generate` | 提纲生成 | ai_weekly / wechat_deep_dive |
| `trend_radar` | 趋势雷达 | ai_weekly |
| `secondary_candidates` | 二次内容候选 | ai_weekly |
| `snapshot_capture` | 快照抓取 | github_weekly |
| `image_plan` | 配图计划 | wechat_deep_dive |
| `return_writeback` | Return 回写 | 全部 |
| `dedupe` / `cluster` / `id_assign` / `route` / `capacity_check` / `cta_assign` / `derived_topic_manage` | Orchestrator 内建步骤（扩展值） | orchestrator |

---

## 7. workflow_outputs 与 Workflow Return 回写

### 7.1 产物契约（`workflow_output_type` 11 类）

`workflow_outputs` 是 Workflow Return 回写的中转站：**AI 原始产出一律先进此表留痕，仅人工审核通过后提升为 `content_assets`**。两表边界 = "原始产出 vs 审核后资产"（判据三，`_canonical-roadmap.md` §1.3）。

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

### 7.2 回写幂等机制

- `workflow_outputs.applied`（boolean，默认 false）：标记 Orchestrator 是否已消费；`applied_at` 记录消费时间；**同一产物只消费一次**。
- 索引：`INDEX(run_id)`、`INDEX(output_type)`、`INDEX(applied)`。

### 7.3 回写动作明细（return_writeback 步骤）

| 产物类型 | 回写动作 |
|---|---|
| `selected_events` | 入选事件提升为 `topics`（`event_pool.derived_topic_id` 回填；`created_by_run_id` 记录来源 run） |
| `trend_report` / `secondary_candidates` | 写 `trend_radar`（`source_workflow ∈ {ai_weekly, github_weekly, evergreen_knowledge, manual}`，`signal_strength/velocity/novelty_score` 均 1-10）；二次候选回写 `event_pool`、更新 `topic_clusters` |
| `derived_topics` | 建衍生 `topics`（`parent_topic_id = main_topic_id`）+ 写 `knowledge_derivations` 记账 |
| `content_asset` | **仅人工审核通过后**提升 `content_assets`（`asset_id` 回填），资产状态同步 |
| `source_packet_update` | 更新 `source_packet_items` / `source_packets`（包级五态由明细 rollup，禁止手填不一致） |
| `knowledge_topic` | 建 `knowledge_topic_bank` + 1:1 `topics` 行（`topic_type='knowledge'`） |
| `deep_dive_plan` / `image_plan` | 写 `deep_dive_plans`（`drafting → review`）/ `deep_dive_image_plans` |

回写完成后批次 `status='completed'`；若存在待审产物，批次进入 `needs_review`。

### 7.4 与人工审核/发布门禁的衔接

- `needs_review → completed`（人工通过）可联动 `topics.status = Ready to Publish`；
- **V1 绝不自动发布**：`publications.status='published'` 仅人工触发（回填 `published_date / published_url / published_by`）；`topics.status='Published'` 仅人工确认且需存在 `publications` 记录；
- 资产审核操作（Approve / Needs Revision / Ready to Publish）落 `audit_log`。

---

## 8. AI 调用层抽象

遵循需求九："AI 调用层必须抽象、不把模型 SDK 散落在业务代码"。目录：`/lib/ai/providers`、`/lib/ai/orchestrator`、`/lib/ai/workflows`（`_requirements.md` §十七目录）。

### 8.1 三层职责

| 层 | 目录 | 职责 | 禁止事项 |
|---|---|---|---|
| **Providers（模型适配器）** | `/lib/ai/providers` | 封装模型供应商 SDK（LLM Provider）；统一 `call()` 接口，负责 token 计数、重试、成本审计、结构化输出解析 | 禁止包含业务 Prompt 与工作流逻辑；禁止业务代码直接 `import` 供应商 SDK |
| **Orchestrator（编排回写层）** | `/lib/ai/orchestrator` | 执行 §2 流水线 12 步；读 `workflow_templates.step_definition` 编排子 workflow；调用 Providers；消费 `workflow_outputs` 回写（幂等 `applied`）；管理批次/产能/路由 | 禁止内联业务 Prompt（Prompt 只存 `ai_prompt_templates`） |
| **Workflows（业务子工作流）** | `/lib/ai/workflows` | 实现 4 个子 workflow（ai-weekly / github-weekly / evergreen / wechat-deep-dive）的具体步骤序列；生成 `workflow_outputs`；调用 Orchestrator 暴露的 Providers | 禁止直接调用供应商 SDK；禁止写 `topics` 主表状态（状态迁移统一由守卫处理） |

### 8.2 核心接口契约（TypeScript，TS strict）

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

### 8.3 Prompt 与模板的取用链路

```
workflow_templates.prompt_refs ──► ai_prompt_templates.key（DB 单一来源）
    或 ──► /ai-prompts/*.md（源文件导入来源）
workflow_templates.step_definition ──► [task_type, provider_class, params]
```

- Prompt 单一来源 = `ai_prompt_templates`（DB 版本化，`UNIQUE(key, version)`，key 如 `ai-weekly/event-assessment/v1`）；`/ai-prompts/*.md` 为源文件导入来源。
- `workflow_templates` 版本化（`UNIQUE(workflow_type_key, version)`）；`workflow_runs` 快照 `template_id + template_version`，保证历史 run 可复现。
- **禁止**：把 Prompt 写死在页面组件；业务代码 `import` 模型 SDK。
- **落地节奏**：M2（D9）以 **mock provider** 验收 run 全生命周期；D10 前确认真实 Provider 与 key（OQ-01）。

---

## 9. 页面衔接（IA 映射）

| 路由 | 页面职责 | 关键数据表 |
|---|---|---|
| `/workflows` | 工作流注册表、模板版本、路由规则、批次生命周期的配置与管理面 | `workflow_types`、`workflow_templates`、`workflow_routing_rules`、`workflow_batches`、`ai_prompt_templates` |
| `/workflows/runs` | 全部 `workflow_runs` 执行留痕与状态追踪（硬性原则 5 的可视化落点） | `workflow_runs`、`workflow_tasks`、`workflow_outputs`、`workflow_batches` |
| `/dashboard` | 四大工作流状态卡 + 核心 CTA（生成本周内容计划 / 确认并开始生产）+ 待办审查队列 + 最近 Runs 时间线 | `workflow_batches`、`workflow_runs` 等 |

- Runs 表格：`run_number`、`workflow_type_key`、`batch_id`、`topic_id`、`status` 徽标、`attempt_count`、`started_at`/`completed_at`、错误摘要。
- Run 详情 Drawer（L3，不新增路由）：`workflow_tasks` 步骤时间线（sequence/status/error）、`workflow_outputs` 产物（`output_type` + `content` + `applied`）、`parent_run_id` 调用树、`error`。
- 审查队列：`needs_review` 批次集中处理（通过 → `completed` / 退回 → 同 run 重跑）。
- 操作区：新建/重跑批次（生成 `2026W36-AI-WEEKLY`，重跑加 `-02` 后缀）。

---

## 10. Open Questions

> 本清单只收集与工作流引擎相关的悬而未决问题；完整项目级开放问题以 `_canonical-roadmap.md` §5（OQ-01 … OQ-11）为准。本文档引用：OQ-01、OQ-02、OQ-03、OQ-06、OQ-07。

| 编号 | 问题 | 影响范围 | 推荐方案 |
|---|---|---|---|
| OQ-WF-01 | **`low_candidate` 的物理存储位置未在数据模型中定义**：`_canonical-workflow.md` §3.2/§8.1 要求"批次标 `low_candidate` 提示人工并触发 `needs_review`"，但 `workflow_batches` 无对应列；`workflow_outputs.output_type` 亦无 `low_candidate` 类型。 | ai_weekly、批次 UI | 推荐：批次级以 `workflow_batches.topic_ids` jsonb 附加标记或复用 `workflow_outputs` 的 `selected_events` content 内标注；实现前由用户确认，不擅自加列 |
| OQ-WF-02 | **趋势雷达信号来源与二次候选的时效**：`trend_radar` 的 `source_workflow` 四值覆盖了三个子工作流与 manual，但 `github_weekly` 信号如何进入雷达（其出参契约无 `trend_report`）未定义。 | trend_radar、github_weekly | 推荐：github_weekly 通过 `selected_events` 产物被 Orchestrator 管理步骤写入 `trend_radar`；D16（M5）细化 |
| OQ-WF-03 | **run 级与 batch 级 `needs_review` 的联动**：批次 `needs_review` 时，是否要求批次内所有 run 均完成、待审 run 冻结直至人工处理；批量通过/退回的操作粒度未定义。 | `/workflows/runs` 审查队列 | 推荐：批次级门禁为聚合视图，操作粒度仍为 run 级；退回时同 run 重跑（`attempt_count+1`） |
| OQ-WF-04 | **Orchestrator 定时触发**：`orchestrator.scheduling='manual'`（可由定时器触发周计划），但定时器启用时机（M5）与触发配置（如每周日生成计划、周一执行）未定。 | M5、Dashboard CTA | 推荐：M5 与 `scheduling='weekly'` 一并启用，触发链 = 定时器 → Orchestrator run → 派发 |
| OQ-WF-05 | **LLM Provider 选型与成本**（引用路线图 OQ-01）：D9 用 mock 验收，D10 前确认真实 Provider 与 key；`AIResponse.usage.costCents` 的计费口径（按 token 估算 vs 供应商账单回填）未定。 | D9、D10、成本审计 | 推荐：V1 按 token 估算写入 `workflow_tasks.provider_class` 关联的成本日志，账单回填留待 M5 |
| OQ-WF-06 | **候选事件池数据来源**（引用路线图 OQ-02）：V1 不做实时全网爬虫，"联网扫描后的候选事件"由谁录入 `event_pool`。 | D4、D10 | 推荐：V1 手动录入 + 受限源（Newsletter/订阅）半自动导入 |
| OQ-WF-07 | **GitHub Trending 抓取源**（引用路线图 OQ-03）：官方 API 不直接提供 Trending 数据，`snapshot_capture` 用 RSSHub / 第三方接口 / 网页解析 / 人工粘贴 CSV。 | D7、D10、D11 | 推荐：V1 人工粘贴 + 半自动解析，D11 时再定 |
| OQ-WF-08 | **定时调度启用时机**（引用路线图 OQ-06）：`scheduling='weekly'`（每周一 09:00）在 M3 手动触发为主、M5 启用定时器。 | M3 vs M5 | 推荐：M5 启用 |

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
| `capacity_rules` | 产能规则 | { concurrency_limit, weekly_quota, serial_mode }；AI Weekly quota 5-8，全工作流 serial_mode=true |
| `content_role` | 内容角色 | traffic / cognition / scenario / product / conversion（单值） |
| `selection_basis` | 榜单口径 | pure_weekly_rank / value_filtered / mixed |
| `snapshot_type` | 快照类型 | original / replay |
| `trend_source` | 雷达信号来源 | ai_weekly / github_weekly / evergreen_knowledge / manual |
| `task_type` | 步骤类型 | fact_check / score / select / script_generate / outline_generate / trend_radar / secondary_candidates / snapshot_capture / image_plan / return_writeback / dedupe / cluster / id_assign / route / capacity_check / cta_assign / derived_topic_manage |
