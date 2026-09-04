# 00 产品愿景（Product Vision）

> **状态**：本文档是 13 份正式文档（00-product-vision … 12-roadmap）的第一份，定义产品的**为什么（Why）与边界（Scope）**。
> **事实源声明**：本文档不定义任何新字段、枚举、路由、状态；所有字段/枚举/状态机以 `docs/_canonical-data-model.md` 为唯一裁决依据，工作流行为契约以 `docs/_canonical-workflow.md` 为准，页面结构与设计系统以 `docs/_canonical-ia.md` 为准，V1 范围与路线图以 `docs/_canonical-roadmap.md` 为准。
> **约定**：中文撰写；业务标识符与枚举一律使用基线英文值（如 `topics`、`topic_status`、`needs_review`）。本文档中 🔸 标记的内容为**基线未覆盖的追加建议**，已同步记入本文档 Open Questions 与返回值 `deviationsFromCanonical`，待用户确认，不构成对基线的改动。

---

## 1. 愿景与使命

### 1.1 一句话愿景

> 让 AI / B2B 内容运营团队拥有一套 **Content Operations OS**：内容从机会发现到线索转化的每一环——选题、核验、生产、审核、发布、数据回填——都发生在一个**以 Topic 为核心、以事实为底线、以人工审核为门禁、以数据反哺为闭环**的统一系统中，AI 负责规模化生产，人负责裁决与判断。

### 1.2 使命

将一套**已人工验证过的内容生产体系**产品化为统一 Web 平台。该体系现有 5 个核心角色：

| 现有角色（人工体系） | 产品化落点 |
|---|---|
| 00 内容总控台 | Content Orchestrator（`workflow_type='orchestrator'`）+ `/dashboard` |
| 01 AI 周报工作流 | `ai_weekly` 子工作流 + `event_pool` 候选事件池 |
| 02 GitHub 周榜工作流 | `github_weekly` 子工作流 + `github_snapshots` 不可变快照 |
| 03 AI 常青知识工作流 | `evergreen_knowledge` 子工作流 + `knowledge_topic_bank` |
| 04 公众号 / 深度专题工作流 | `wechat_deep_dive` 子工作流 + `deep_dive_plans` 蓝图 |

使命的达成标准（需求"最终目标"）：用户能够做到——

> **「生成本周内容计划」→ 审核 Topic → 点击「确认并开始生产」→ 四个 AI Workflow 自动运行 → 生成内容 → 人工审核 → 发布 → 回填数据 → 下一周自动优化选题**

### 1.3 产品是什么、不是什么

| 维度 | 是 | 不是 |
|---|---|---|
| 核心对象 | **Topic**（选题与内容资产严格分离，`topics` 为系统枢纽） | 以"文章"为核心的内容生成器 |
| 生产模式 | Orchestrator 编排 + 4 个子 Workflow（`workflow_types` 5 类注册） | 把 Prompt 写死在页面里的单页 AI 工具 |
| 事实底线 | 每个 Topic 绑定 `source_packets`，逐条核验（`source_verification_status` 五态） | 无来源、无核验的"生成即发布" |
| 发布策略 | **人工审核门禁，V1 绝不自动发布**（`publications.status='published'` 仅人工触发） | 自动无条件发布 |
| 数据形态 | 执行留痕（`workflow_runs` / `workflow_tasks` / `workflow_outputs`）+ 审计（`audit_log`）+ 指标全绑定 `topic_id` | 黑盒 AI 流水线 |
| 演进方式 | 数据反哺下一轮选题（趋势雷达、`next_action`、权重配置化） | 一次性的内容批量生产工具 |

### 1.4 端到端价值链（闭环）

平台管理的完整链条（需求项目定位，全链路字段/表引用以数据模型基线为准）：

```
内容机会发现 → Topic 形成 → 事实核验 → AI 工作流分发 → 内容生产 → 人工审核
→ 多平台内容资产 → 发布管理 → 数据追踪 → 线索转化 → 数据反哺下一轮选题
```

对应数据/工作流落点：

| 环节 | 落点 |
|---|---|
| 机会发现 / 候选接收 | `event_pool`（`candidate_id`，如 `2026W36-AI-CAND-001`）→ Orchestrator 第 1 步 `candidate_reception` |
| Topic 形成 | 查重（`history_dedupe_status`）→ 聚类（`topic_clusters`）→ ID 分配（`topics.topic_id`，如 `2026W36-001`）→ 评分 → `priority`（P0/P1/P2/P3） |
| 事实核验 | `sources` → `source_packet_items`（`core_fact` / `key_numbers` / `number_test_conditions`）→ `source_packets`（包级五态 rollup） |
| 工作流分发 | Orchestrator 第 7 步 `workflow_routing` 经 `workflow_routing_rules` 路由到 4 个子 Workflow |
| 内容生产 | `workflow_outputs`（AI 原始产出，`applied` 幂等）→ 人工审核通过后提升 `content_assets` |
| 发布管理 | `publications`（`planned` → `ready` → 人工 `published`） |
| 数据追踪 / 线索转化 | `content_metrics`（18 字段全量、强制绑定 `topic_id`）、`conversion_funnel` 视图、`leads` |
| 数据反哺 | `trend_radar`（`signal_strength` / `velocity` / `novelty_score`）、`secondary_candidates` 回写 `event_pool`、`knowledge_topic_bank.next_action` 驱动开采、`system_settings` 权重调优 |

---

## 2. 目标用户与业务场景

### 2.1 目标用户（🔸 追加建议，基线未细化画像）

**主用户**：AI / B2B 内容运营团队（1-5 人的小团队），当前依赖人工维护周报、公众号、短视频口播、GitHub 周榜等固定内容栏目，痛点包括：选题靠经验、事实核验靠记忆、AI 产出无法审控、数据无法回填选题决策。

**职能视角的典型角色**（V1 为单用户实现，见 `_canonical-roadmap.md` OQ-04；角色以页面职能承载，不引入复杂 RBAC）：

| 角色 | 核心动作 | 主要页面 |
|---|---|---|
| 内容运营负责人（总控） | 审 Topic、定 Priority/CTA、触发两 CTA | `/dashboard`、`/topics` |
| 内容编辑 / 写手 | 审核 AI 初稿、退回修改、定稿 | `/topics/[id]`、`/content/[id]` |
| 事实核验员 | 录入来源、执行数字测试、裁决 `conflict` | `/sources` |
| 增长 / 销售支持（M4+） | 看漏斗、处理 `leads` | `/analytics`、`/publications` |

**目标团队画像**（🔸 追加建议，待确认 OQ-V2）：
- 内容生产以"周"为节奏：周报、周榜、常青知识、深度专题四条产线并行；
- 内容面向 B2B 受众，选题必须可追溯到 AI 行业事实（有来源、可核验）；
- 已有一套人工验证的内容方法论（12 段深度文章结构、90 秒中文口播、配图优先级等），需要系统化沉淀而不是重新发明。

### 2.2 业务场景（8 个核心场景）

| # | 场景 | 触发 | 工作流 / 实体 | 关键产出 | 必须的人工动作 |
|---|---|---|---|---|---|
| S1 | 生成本周内容计划 | 每周一，Dashboard CTA「生成本周内容计划」 | Orchestrator 前 6 步（`candidate_reception` → `history_dedupe` → `topic_clustering` → `topic_id_assignment` → `scoring` → `priority_assignment`） | `workflow_outputs.output_type='production_plan'`、`workflow_batches`（`batch_status='planned'`） | 审核候选 Topic、裁决 `review_required` |
| S2 | 确认并开始生产 | 审核通过后，CTA「确认并开始生产」 | Orchestrator 后 6 步（`workflow_routing` → `capacity_control` → `cta_assignment` → `trend_radar_management` → `derived_topic_management` → `return_writeback`） | 子 run 派发（`parent_run_id` 调用树）、`workflow_batches`（`dispatching`） | 人工确认派发 |
| S3 | AI 周报生产 | `ai_weekly`，每周一 09:00（统计口径 = 上一完整自然周，`week_start`/`week_end` 显式存） | `ai_weekly`：`fact_check` → `score` → `select`（选 5-8 条）→ `script_generate`（90 秒中文口播）→ `outline_generate` → `trend_radar` → `secondary_candidates` → `return_writeback` | `content_asset(ai_weekly_script)`、`trend_report` | 审核口播脚本；不足 5 条时处理 `low_candidate` 提示 |
| S4 | GitHub 周榜 | `github_weekly`，每周一抓取 GitHub Trending Weekly | `snapshot_capture` → `fact_check` → `select` → 图文卡片 → Return | `github_snapshots`（`snapshot_type` ∈ `original`/`replay`，`selection_basis` ∈ `pure_weekly_rank`/`value_filtered`/`mixed`）、`content_asset(github_card)` | 定稿（`frozen` 后不可变）、核验与淘汰裁决 |
| S5 | 常青知识开采 | 人工点单或 Orchestrator 按 `knowledge_topic_bank.next_action` 路由 | `evergreen_knowledge`：`select` → `fact_check` → 建 `knowledge_topic`（1:1 `topics` 行）→ 内容生产 → `derived_topics`（≤3）→ Return | `knowledge_topic_bank` 记录、主 Topic + 最多 3 个衍生 Topic | 审核知识 Topic 与内容；衍生预算超限由守卫拦截 |
| S6 | 公众号深度专题 | 路由到 `scenario`/`product`/`conversion` 型 Topic 或人工指定 | `wechat_deep_dive`：定义 `content_role`（单值）→ Target User / Core User Problem / Decision User Needs to Make / Primary CTA → 12 段蓝图 → 配图计划 → 成文 → Return | `deep_dive_plans`（`drafting` → `review` → `approved`）、`deep_dive_image_plans`、`content_asset(wechat_article)` | 审核蓝图（含 `plan.primary_cta == topic.primary_cta` 校验项）；真实截图/UI 配图确认来源 |
| S7 | 发布与数据回填（M4） | 内容审核通过后排期 | `publications`（`planned` → `ready` → **人工** `published`） | `published_date` / `published_url` / `published_by` 人工回填 | 人工发布并回填（V1 不接平台 OpenAPI，见 OQ-08） |
| S8 | 数据反哺与闭环（M5） | 数据回填后每周复盘 | `content_metrics` 18 字段按 `topic_id` 聚合、`conversion_funnel` 视图、`leads`、`trend_radar` 跨周对比 | 下一周选题依据（`secondary_candidates` 回写 `event_pool`、权重经 `system_settings` 调优） | 复盘调整选题方向与评分权重 |

### 2.3 典型周旅程（用户视角）

1. **周一**：进入 `/dashboard`，查看当前周（`content_week`）概览 → 点击「生成本周内容计划」，Orchestrator run 落库；
2. **审核选题**：在 `/topics` 与 `/topics/[id]` 审 Topic（评分、`priority`、血缘、Source Packet、CTA），退回或定案；
3. **开始生产**：点击「确认并开始生产」，四个子 Workflow 按路由规则派发；
4. **审核产物**：在 `/workflows/runs` 与 `/content/[id]` 处理 `needs_review` run 与 `Review` 态资产（Approve / Needs Revision / Ready to Publish），全部动作写 `audit_log`；
5. **发布**（M4）：`/publications` 编排 `planned`/`ready`，人工发布并回填链接；
6. **复盘**（M5）：`/analytics` 看 `conversion_funnel` 与线索，数据反哺下一周选题。

### 2.4 关键价值主张

1. **可信**：所有内容有来源（`sources` 三层模型）、有核验（`source_verification_status` 五态、`number_test_conditions` 逐条执行）、冲突显性化（`source_consistency='conflict'` 裁决面板）；
2. **可追**：Topic 血缘（`topic_relations` 图 + Lineage 可视化）、执行留痕（`workflow_runs` 调用树）、全量审计（`audit_log`，`actor = 用户标识 或 ai:run-xxx`）；
3. **可闭环**：指标全绑定 `topic_id`，`conversion_funnel`（Read → CTA Click → Lead → Registration → Demo → Sales Lead → Deal → Revenue）驱动下一轮选题。

---

## 3. 产品核心原则（需求一，6 条）

> 以下 6 条为需求明文定义的产品核心原则，落地机制全部来自基线（数据模型 / 工作流 / IA / 路线图）。每条给出"原则 → 落地机制 → 防退化约束"。

### 3.1 原则 1：Topic 是系统最核心的数据实体

- **原则**：不以"文章"为核心建模。一个 Topic 可衍生多种内容资产：AI 周报事件、短视频口播、GitHub 图文、常青知识、公众号文章、小红书内容、销售资料、其他内容资产。**Topic 与 Content Asset 必须严格分开。**
- **落地机制**：
  - `topics` 表为系统枢纽（`topic_id` 如 `2026W36-001`、`topic_type` 8 类、9 态 `topic_status`、五维评分、`priority`、`primary_cta`）；
  - `content_assets` 与 `topics` 数据层严格分离，仅 `content_assets.topic_id → topics.id` 单向引用；`asset_type` 8 类：`ai_weekly_script` / `short_video_script` / `wechat_article` / `github_card` / `xiaohongshu` / `sales_material` / `infographic` / `cover`；
  - 资产版本化：`content_assets`（逻辑标识 `asset_key` = `{topic_id}:{asset_type}:{platform}`）+ `content_asset_versions`（历史全保留，不做覆盖删除）。
- **防退化约束**：Topic 生命周期独立于单个资产——归档/重做一个资产不影响 `topics`；指标（`content_metrics.topic_id`）与发布（`publications.topic_id`）均锚定 Topic，而非资产。

### 3.2 原则 2：所有内容必须有来源与事实核验能力

- **原则**：每个 Topic 关联 Source Packet，至少支持：来源名称、来源 URL、来源类型、发布时间、Event_Date、Disclosure_Date、核心事实、关键数字、数字测试条件、核验状态、核验时间、备注。
- **落地机制**（三层模型）：
  - `sources`（注册层，跨 Topic 复用；`source_type` 7 类：`official` / `github` / `official_docs` / `authoritative_media` / `tech_media` / `community` / `internal`；`source_quality_score` 1-5；核验状态**不放在此层**，避免单 Topic 核验污染全局）；
  - `source_packet_items`（明细层：`core_fact`、`key_numbers` jsonb、`number_test_conditions` 断言数组、`item_verification_status`、`event_assessment`）；
  - `source_packets`（聚合层：`packet_id` 如 `2026W36-001-SP`、`verification_status` 包级五态**由明细 rollup**，禁止手填与明细不一致、`source_consistency`）。
- **核验枚举**：`source_verification_status` = `unverified` / `partially_verified` / `verified` / `conflict` / `needs_update`（全局唯一，GitHub / AI Weekly 复用，禁止另造）。
- **防退化约束**：来源数据冲突时 `Source_Consistency = Conflict`（包级 `source_consistency='conflict'`），`conflict_fact_ids` 记录冲突项，UI 提供逐条裁决面板（写 `audit_log`）；`verified_at` / `verified_by` 记录核验时间与人。

### 3.3 原则 3：支持 Topic 血缘

- **原则**：`Topic_ID`、`Parent_Topic_ID`、`Source_Topic_IDs`；前端可查看 Topic Lineage。
- **基线血缘示例**：`AI 新闻 → Agent Skills 趋势 → 什么是 Agent Skills → 企业为什么需要 Agent Skills Library → 企业 Agent Skills Governance`。
- **落地机制**（混合方案，数据模型 §2.3）：
  - `topics.parent_topic_id`（单父衍生树）+ `topics.source_topic_ids`（`uuid[]` 多源促成）+ `topic_relations`（权威图存储，`relation_type` ∈ `parent` / `source`）；
  - 读写规则：写血缘唯一入口 = `lineage service`（单事务同写两列 + 边表）；读血缘一律走 `topic_relations` + `WITH RECURSIVE` 递归 CTE（深度 3-5 层）；
  - 防环：应用层祖先路径检查 + 数据库 `CHECK (from_topic_id <> to_topic_id)`。
- **防退化约束**：血缘深度 V1 限制 3-5 层，不引入图数据库；`topic_relations` 是权威图存储，禁止绕过服务直接写边。

### 3.4 原则 4：AI 工作流采用 Orchestrator + 子 Workflow 架构

- **原则**：不把 Prompt 写死在页面组件里；独立 Orchestrator、AI Weekly、GitHub Weekly、Evergreen Knowledge、WeChat Deep Dive。
- **落地机制**：
  - 四层架构：UI / Dashboard → Orchestrator（`workflow_type='orchestrator'`，12 步流水线）→ 4 个子 Workflow（`workflow_types` 注册表）→ AI 调用层抽象（`/lib/ai/providers` → `/lib/ai/orchestrator` → `/lib/ai/workflows`）；
  - Prompt 单一来源：`ai_prompt_templates`（DB 版本化，`UNIQUE(key, version)`，如 `ai-weekly/event-assessment/v1`）；`workflow_templates.prompt_refs` 引用，`/ai-prompts/*.md` 为源文件导入来源；
  - 模板版本化：`workflow_templates`（`UNIQUE(workflow_type_key, version)`），`workflow_runs` 快照 `template_id + template_version`，历史 run 可复现；
  - 路由规则表 `workflow_routing_rules` 默认映射：`hot/trend→ai_weekly`、`technical_project→github_weekly`、`knowledge/evergreen→evergreen_knowledge`、`scenario/product/conversion→wechat_deep_dive`，全部 `overridable=true`。
- **防退化约束**：业务代码禁止直接 `import` 模型供应商 SDK；禁止把 Prompt 写死在页面组件；Provider 统一 `call()` 接口（`AIRequest` / `AIResponse`），负责 token 计数、重试、成本审计。

### 3.5 原则 5：所有 AI 工作流必须保留执行记录

- **原则**：记录 Workflow Run、输入、使用的 Topic、Source Packet、状态、生成结果、衍生 Topic、错误、执行时间。
- **落地机制**（`workflow_runs` 核心表 + 调用树）：
  - `workflow_runs`：`run_number`（如 `2026W36-AI-WEEKLY-R01`）、`workflow_type_key`、`template_id`/`template_version` 快照、`batch_id`、`topic_id`、`parent_run_id`（父子调用树）、`input_payload`、`source_packet_id`、`status`（`queued`/`running`/`completed`/`failed`/`needs_review`）、`attempt_count`、`started_at`/`completed_at`、`output`、`error`；
  - `workflow_tasks`：步骤级记录（`UNIQUE(run_id, sequence)`，`task_type` 含 `fact_check`/`score`/`select`/`script_generate`/`outline_generate`/`trend_radar`/`secondary_candidates`/`snapshot_capture`/`image_plan`/`return_writeback` 及 Orchestrator 内建步骤 `dedupe`/`cluster`/`id_assign`/`route`/`capacity_check`/`cta_assign`/`derived_topic_manage`）；
  - `workflow_outputs`：类型化产物（`output_type` 11 种），AI 原始产出一律先进此表留痕，`applied` 幂等回写（Orchestrator 只消费一次）；
  - 审计：所有评分、定级、查重、聚类、CTA 判断、路由、状态迁移均由 Orchestrator 作为 run 落库，写 `audit_log`（`actor = 用户标识 或 ai:run-xxx`）。
- **防退化约束**：`attempt_count` 同 run 重跑递增不新建；批次重跑新建 `workflow_batches`（`batch_id` 追加 `-NN`，如 `2026W36-AI-WEEKLY-02`）；无留痕的状态迁移不存在。

### 3.6 原则 6：平台第一版必须有人类审核环节

- **原则**：AI 不允许自动无条件发布内容。状态至少包括 9 态：`Draft` / `Researching` / `Ready for Production` / `Producing` / `Review` / `Needs Revision` / `Ready to Publish` / `Published` / `Archived`。
- **落地机制**：
  - `topic_status` 9 态为**全局唯一状态机**（`content_assets.status` 为其子集），权威迁移定义见 `_canonical-workflow.md` §7；
  - run 级门禁吸收态：`workflow_runs.status='needs_review'`（如 `low_candidate`、`review_required` 查重、Deep Dive 蓝图），人工通过 → `completed`，退回 → 同 run 重跑；
  - **V1 绝不自动发布**：`publications.status` 只能由人工触发置为 `published` 并回填 `published_date` / `published_url` / `published_by`；DB 触发器/应用层禁止 workflow 直写 `published`；`topics.status=Published` 需存在 `publications` 记录；
  - 产物边界：AI 原始产出先进 `workflow_outputs`，**仅人工审核通过后提升为 `content_assets`**；
  - 守卫校验：进入 `Ready for Production` 前 `primary_cta` 必填。
- **防退化约束**：不存在绕过 `audit_log` 的状态变更路径；所有审核动作在 UI 上有显性"人工"标识（IA §6 决策 5）。

---

## 4. North Star 与成功指标

### 4.1 North Star Metric（🔸 追加建议，基线未定义，待确认 OQ-V1）

**建议 North Star：每周"闭环内容资产数"** —— 每个自然周内，从 Topic 出发、经人工审核、完成发布（`publications.status='published'` 且 `published_url` 已回填）、并获得数据回填（该 `topic_id` 存在 `content_metrics` 记录）的内容资产数量。

- 该指标同时衡量三条核心链路是否跑通：**生产链路**（Topic → 资产）、**门禁链路**（人工审核 → 发布）、**反馈链路**（发布 → 数据回填）；
- V1（M0-M3）数据回填链路尚未上线（`/analytics` 在 M4），此阶段 North Star 退化为**过程代理指标**：每周达到 `Ready to Publish` 的内容资产数（见 4.3 度量口径）。

### 4.2 成功指标体系（分层）

> 指标字段全部来自 `content_metrics` 18 字段与各表；转化口径为 `conversion_funnel` SQL 视图（Read=reads → CTA Click=cta_clicks → Lead=registrations+dm_count → Registration=registrations → Demo=demo_requests → Sales Lead=sales_leads → Deal=deals → Revenue=revenue）。

| 层级 | 指标 | 定义 / 公式 | 数据源 | 生效阶段 |
|---|---|---|---|---|
| 北极星 | 周闭环内容资产数 | 发布且回填指标的资产数（4.1） | `publications`、`content_metrics` | M4 起；V1 用过程代理 |
| 选题健康度 | P0/P1 Topic 数 | Dashboard KPI 行字段 | `topics.priority` | M1 起 |
| 选题健康度 | 五维评分均值 | `b2b_relevance`/`traffic_potential`/`conversion_potential`/`timeliness`/`content_value`（1-10）均值 | `topics`、`score_rationale` | M1 起 |
| 选题健康度 | `business_relevance` 门控通过率 | 门控封顶/兜底触发次数 ÷ 评分 Topic 数 | `score_rationale`、`workflow_runs` | M3 起 |
| 事实质量 | 证据包 `verified` 覆盖率 | 包级 `verified` 包数 ÷ 总包数 | `source_packets.verification_status` | M1 起 |
| 事实质量 | 冲突率 | `source_consistency='conflict'` 包数 ÷ 总包数 | `source_packets` | M1 起 |
| 生产效能 | 生产周期时长 | 同周批次从「生成本周内容计划」到全部 `Ready to Publish` 的耗时 | `workflow_batches`、`workflow_runs` | M3 起 |
| 生产效能 | run 状态分布 | `completed`/`failed`/`needs_review` 占比 | `workflow_runs.status` | M2 起 |
| 生产效能 | 平均重跑次数 | `attempt_count` 均值 | `workflow_runs` | M2 起 |
| 审核效率 | 一次审核通过率 | `Review → Ready to Publish` 次数 ÷ 进入 `Review` 次数 | `audit_log`（`topic_status_history`） | M1 起 |
| 转化（M4+） | 漏斗各层转化率 | `cta_clicks/reads`、`demo_requests/cta_clicks`、`sales_leads/demo_requests`、`deals/sales_leads` | `conversion_funnel` 视图 | M4 起 |
| 转化（M4+） | Leads / Demo / Consultation 数 | Dashboard KPI 行字段（`leads`、`content_metrics.demo_requests`、`consultations`） | `leads`、`content_metrics` | M4 起 |
| 商业（M5+） | `deals`、`revenue` | 成交数与营收金额 | `content_metrics` | M5 起 |

### 4.3 V1 度量口径（🔸 追加建议，待确认 OQ-V3）

- **M0-M3（MVP 阶段）**：以过程指标为主——选题健康度、事实质量、生产效能、审核效率；Dashboard KPI 行（P0/P1 Topic 数、待审核、待发布、已发布、本周 Leads、Demo 数、Consultation 数）为每周运营例会度量。
- **M4 起**：接入 `content_metrics` 录入与 `conversion_funnel` 视图，启动转化类指标。
- **M5 起**：`trend_radar` 跨周对比 + 权重调优，验证"数据反哺选题"闭环。

### 4.4 成功定义（MVP 退出标准，引用 `_canonical-roadmap.md` §6）

| 里程碑 | 退出标准 |
|---|---|
| MS-1（M1 结束） | 全部基础页面用真实数据渲染；Topic Detail 14 区块顺序合规；人工审核基础操作可用且全部落 `audit_log` |
| MS-2（M2 结束） | mock provider 跑通 run 全生命周期；`needs_review` 门禁路径与 `applied` 幂等验证通过 |
| MS-3（**M3 结束 = MVP Exit**） | 端到端最小闭环可演示：**生成本周内容计划 → 审核 Topic → 确认并开始生产 → AI 周报生产（90 秒中文口播脚本）→ 人工审核 → Ready to Publish**；无自动发布路径；`event_pool → topics` 提升链路正确 |
| MS-4（M4 结束） | 人工发布闭环（`planned`/`ready` + 人工回填 `published`）与指标录入/漏斗视图可用 |
| MS-5（M5 结束） | 完整周循环闭环演示：发布 → 数据回填 → 下一周选题可见数据反馈 |

**硬性 Exit 约束（任何阶段不得违反）**：
1. 不存在绕过人工审核的发布路径（`publications.status='published'` 仅人工触发）；
2. 所有评分、定级、查重、聚类、CTA 判断、路由、状态迁移均有 `workflow_runs` 留痕；
3. 数据模型 34 表全量落库，需求字段零删减。

---

## 5. V1 承诺与边界（做什么 / 不做什么）

### 5.1 V1 承诺（In Scope，引用 `_canonical-roadmap.md` §1.1）

第一版必须交付以下能力（需求十八第一阶段清单 + 人工审核闸门）：

| # | 能力 | 英文标识符 | 关键内容 | 阶段 |
|---|---|---|---|---|
| 1 | 内容总控台 Dashboard | `Dashboard` | `/dashboard` 六区块：周概览 KPI 行、四大工作流状态卡（`ai_weekly`/`github_weekly`/`evergreen_knowledge`/`wechat_deep_dive`）、核心 CTA 区（「生成本周内容计划」「确认并开始生产」，人工触发、落 `workflow_runs`）、待办审查队列、最近 Runs 时间线、趋势雷达图 | M1 |
| 2 | Topic 选题中心 | `Topic Center` | `/topics`：过滤栏（`status`/`priority`/`topic_type`/`content_week`/`history_dedupe_status`/搜索）、Topic 表格、批量操作、候选池 Drawer（`event_pool`） | M1 |
| 3 | Topic 详情 | `Topic Detail` | `/topics/[id]` 严格按 IA 14 区块顺序实现 | M1 |
| 4 | Source Packet 证据包与核验 | `Source Packet` | `/sources` 三层管理、包级五态 rollup、`conflict` 裁决面板 | M1 |
| 5 | Workflow 基础结构 | `Workflow Foundation` | 引擎与状态机（`workflow_types`/`workflow_templates`/`workflow_batches`/`workflow_runs`/`workflow_tasks`/`workflow_outputs`）、AI 三层抽象、`/workflows` 与 `/workflows/runs` 页 | M2 |
| 6 | Knowledge Topic Bank | `Knowledge Topic Bank` | `/knowledge`：知识网格、concept 图、衍生预算指示（`round_index` 1..3）、开采入口 | M1 |
| 7 | GitHub Snapshot | `GitHub Snapshot` | `/github-weekly`：快照抓取、不可变冻结（`frozen` 触发器）、Replay 新行、`selected=true` 落 Topic | M1 |
| 8 | Content Asset 基础管理 | `Content Asset Management` | `/content` 与 `/content/[id]`：`content_assets` + `content_asset_versions`（版本全保留）、编辑/预览、版本 Timeline、CTA 面板、审核队列 | M1 |
| 9 | 人工审核闸门 | `Human Review Gate` | `needs_review` 吸收态、Approve / Needs Revision / Ready to Publish、`audit_log` 全量留痕、**V1 绝不自动发布** | M1 基础 / M3 贯通 |

**交付节奏承诺**：M0 地基 → M1 数据模型+基础页面 → M2 工作流引擎 → M3 四工作流（MVP Exit）→ M4 发布/指标 → M5 优化闭环；D1-D10 合计 65 人日（单人全职），首个垂直切片 D10 = Orchestrator + `ai_weekly` 端到端。

### 5.2 V1 边界（Out of Scope，明确不做什么，引用 `_canonical-roadmap.md` §1.2）

| # | 不做（中文） | 英文标识符 | 边界说明 | 再评估时机 |
|---|---|---|---|---|
| 1 | **自动发布** | `Auto Publishing` | V1 硬性原则：`published` 仅人工触发，系统/工作流只生成 `planned → ready` | 不排期（需求硬性原则 6） |
| 2 | **复杂 CRM** | `Complex CRM` | `leads` 仅基础列表与分类（`lead_type`/`lead_urgency`/`lead_status`/`suggested_reply` 仅建议不自动回复），不做 CRM 工作流、集成、自动化跟进 | M5 后评估 |
| 3 | **视频生成** | `Video Generation` | `asset_type='short_video_script'` 仅产出脚本文本，不生成视频文件 | 后置评估 |
| 4 | **自动剪辑** | `Auto Editing` | 无任何自动剪辑/合成能力 | 后置评估 |
| 5 | **多租户** | `Multi-tenancy` | 单租户部署 | 后置评估 |
| 6 | **复杂 RBAC** | `Complex RBAC` | V1 单用户；`/settings` 用户/权限区仅预留 | 后置评估 |
| 7 | **实时全网爬虫** | `Real-time Web Crawling` | 候选扫描**非实时**；V1 候选经人工录入或受限来源导入 `event_pool`（录入方式待确认，OQ-02） | 需用户确认 |
| 8 | **定时自动调度** | `Scheduled Cron` | M3 以手动触发 run 为主；每周一 09:00 定时器（`scheduling='weekly'`）放 M5 后启用 | M5 |
| 9 | **AI 自动生成配图/视频** | `AI Image/Video Gen` | `image_plan` 仅输出配图计划，不自动出图；真实截图/UI 必须 `from_brand_asset`/`from_verified_source`；Logo 禁止 AI 重绘（`ai_policy='reference_only'`） | M4 后评估 |

> 补充边界：本迭代（文档阶段）**禁止**实现完整 AI Workflow、开始自动发布、擅自删减核心 Topic / Source / Workflow 数据模型（需求二十）；D1 起执行须用户确认。

### 5.3 边界判据（In/Out 判定规则）

1. **判据一（范围）**：需求十八第一阶段清单为 V1 MVP 首发范围，超出项进入 M4/M5 或 Out 清单（如 `/publications`、`/analytics` 属 M4，不在 MVP 首发，但数据模型已全量建表）；
2. **判据二（门禁）**：任何内容产出必须经过人工审核；不存在绕过 `audit_log` 的状态变更路径；
3. **判据三（产物边界）**：AI 原始产出一律先进 `workflow_outputs` 留痕，仅人工审核通过后提升为 `content_assets`；
4. **判据四（执行时机）**：数据模型在 M0 全量建表（34 表，不删减）；完整 AI Workflow 逻辑到 M3 才实现。

### 5.4 V1 技术承诺（引用 `_canonical-data-model.md` 头注与需求十六）

- Next.js（App Router）+ TypeScript strict + Tailwind CSS + shadcn/ui；PostgreSQL 15+（Supabase：Database/Auth/Storage）；Drizzle ORM；
- 数据模型 34 表全量落库，需求字段零删减；枚举 V1 推荐 `text + CHECK`；
- 14 条路由全量保留（`/dashboard`、`/topics`、`/topics/[id]`、`/workflows`、`/workflows/runs`、`/content`、`/content/[id]`、`/knowledge`、`/github-weekly`、`/sources`、`/assets`、`/publications`、`/analytics`、`/settings`）；
- UI 风格：AI / B2B / 内容运营 / 数据驱动 / 专业工作台（白/深灰/蓝三色体系，P0 红 / P1 橙 / P2 蓝 / P3 灰，Card/Table/Badge/Tabs/Drawer/Command Menu/Timeline 为主组件，默认正文 14px 高密度）。

---

## 6. Open Questions（本文档悬而未决的问题）

> 基线 `_canonical-roadmap.md` §5 已定义 OQ-01 ~ OQ-11（影响本文档范围确认的问题在此汇总）；本文档新增 OQ-V1 ~ OQ-V4（🔸 追加建议，基线未覆盖）。均待用户确认，确认前不构成对基线的改动。

### 6.1 基线既有开放问题（OQ-01 ~ OQ-11，与愿景相关项汇总）

| 编号 | 问题 | 对本文档的影响 | 推荐方案 |
|---|---|---|---|
| OQ-01 | LLM Provider 选型（Anthropic / DeepSeek / OpenAI / 自托管）与 API Key、成本预算 | 原则 4/5 的工程实现 | D9 用 mock 验收，D10 前确认真实 Provider；`/lib/ai/providers` 保持可插拔 |
| OQ-02 | 候选事件池数据来源（手动 / RSS / 邮件 / 受限源半自动） | 场景 S1 的"内容机会发现"环节 | V1 推荐手动录入 + 受限源半自动导入 |
| OQ-03 | GitHub Trending 抓取数据源（RSSHub / 第三方 / 网页解析 / 人工粘贴 CSV） | 场景 S4 | 推荐 V1 人工粘贴 + 半自动解析 |
| OQ-04 | 认证与单用户（Supabase Auth 单账号 vs 本地无鉴权） | §2.1 角色实现方式 | 推荐 Supabase Auth 单账号，`audit_log.actor` 用用户标识 |
| OQ-06 | 定时调度启用时机（M3 手动 vs M5 定时） | V1 承诺第 9 项边界 | 推荐 M3 手动为主、M5 启用定时器 |
| OQ-07 | 内容语言（口播/文章/图文默认中文） | 场景 S3/S6 产物语言 | 推荐默认中文，Prompt 模板显式声明 |
| OQ-08 | 发布渠道接入方式（人工发布 + 回填链接，不接平台 OpenAPI） | 场景 S7 | 推荐人工发布回填 |
| OQ-09 | 趋势雷达图表粒度与刷新策略（按周 / 跨周） | Dashboard 六区块 | 推荐 Dashboard 当前周 + M5 增加跨周对比 |
| OQ-10 | 是否提供演示种子数据（`demo-seed`） | MVP 验收体验 | 推荐提供，可一键清空 |
| OQ-11 | D1-D10 合计 65 人日排期是否可接受；M4/M5（D11+）拆分时机 | V1 承诺节奏 | 推荐 MVP 验收后按路线图 §7 拆分 |

### 6.2 本文档新增开放问题（OQ-V1 ~ OQ-V4）

| 编号 | 问题 | 影响范围 | 推荐方案 |
|---|---|---|---|
| OQ-V1 | **North Star 指标定义与目标值**：4.1 建议的"周闭环内容资产数"是否采纳？目标基线值（如每周发布资产数、闭环时长）如何设定？ | §4 全文 | 采纳 4.1 定义；目标值待首个垂直切片（D10）后按真实数据校准 |
| OQ-V2 | **目标用户画像**：§2.1 的团队规模（1-5 人）与职能角色假设是否符合实际运营团队？是否需要补充外部多用户场景（影响 OQ-04 单用户决策）？ | §2.1 | 维持假设；确认 OQ-04 前不扩展多用户 |
| OQ-V3 | **V1 度量口径**：M0-M3 以过程指标代理 North Star（4.3）是否可接受？Dashboard KPI 行的"本周 Leads / Demo / Consultation"在 M4 前展示空态还是隐藏？ | §4.3、Dashboard KPI 行 | 接受过程代理；空态按 IA 三态约定展示 |
| OQ-V4 | **产品正式名称与品牌**：基线未定义产品名，本文档沿用需求原文"AI 社交内容运营平台 / Content Operations OS"。是否需要正式品牌名？ | 全站文案、`/settings` 品牌区 | 待命名后统一替换，不影响数据模型 |

---

## 7. 附：本文档引用关系

| 主题 | 权威事实源 |
|---|---|
| 需求原文（原则、定位、目标） | `docs/_requirements.md` |
| 字段 / 枚举 / 表 / 业务规则 | `docs/_canonical-data-model.md` |
| 工作流行为契约 / 状态机 | `docs/_canonical-workflow.md` |
| 页面结构 / 设计系统 | `docs/_canonical-ia.md` |
| MVP 范围 / 路线图 / 决策日志 / 开放问题 | `docs/_canonical-roadmap.md` |

本文档不新增任何字段、枚举、路由或状态；🔸 追加建议均已列入 §6.2，经确认后同步更新相关基线或决策日志（DC-xx）。
