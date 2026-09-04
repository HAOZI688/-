# 产品需求文档（PRD）— AI 社交内容运营平台

> 文档编号：01-prd.md（13 份正式文档体系之第 01 份，前承 00-product-vision，后接 02-ia … 12-roadmap）
> 状态：v1 草稿（供评审）｜ 日期：2026-09-04
> **事实源声明**：本文档的一切字段、枚举、路由、状态机、阶段范围以以下 5 份基线为唯一事实源，凡冲突以基线裁决：
> 1. `docs/_requirements.md`（需求原文）
> 2. `docs/_canonical-data-model.md`（数据模型基线，34 表）
> 3. `docs/_canonical-workflow.md`（工作流引擎与状态机基线）
> 4. `docs/_canonical-ia.md`（IA 与设计系统基线，14 路由）
> 5. `docs/_canonical-roadmap.md`（MVP 范围与路线图基线，M0-M5 / D1-D18 / DC / OQ）
>
> 本文档**不新增、不删减、不改写**任何基线内容；仅对基线做模块化组织、条目化（FR 编号）与验收指引的编排。新增编排均标注 🔸。

---

## 1. 产品概述与问题定义

### 1.1 产品定位

面向 **AI / B2B 内容运营团队**的 **Content Operations OS**。产品核心不是"生成文章的 AI 工具"，而是覆盖内容全生命周期的运营操作系统：

```
内容机会发现 → Topic 形成 → 事实核验 → AI 工作流分发 → 内容生产
→ 人工审核 → 多平台内容资产 → 发布管理 → 数据追踪 → 线索转化
→ 数据反哺下一轮选题
```

### 1.2 问题定义（现状痛点）

平台当前来源于一套**已人工验证过的内容生产体系**（legacy 5 个核心角色，见 §2.2），现状存在以下可量化痛点：

| # | 痛点 | 后果 | 本产品的解决手段 |
|---|---|---|---|
| P-1 | 选题依赖个人经验，无历史查重与聚类 | 重复选题、机会遗漏 | Orchestrator 查重聚类（`history_dedupe_status` / `topic_clusters`）+ `topic_id` 业务 ID 稳定血缘 |
| P-2 | 事实核验无统一记录 | 内容事实错误、返工 | `sources → source_packet_items → source_packets` 三层核验模型 + 包级五态 rollup |
| P-3 | 周报/短视频/公众号/常青知识各自为政 | 内容资产割裂、一鱼多吃困难 | 以 `topics` 为核心实体，一个 Topic 衍生 8 类 `content_assets`（`ai_weekly_script` / `short_video_script` / `wechat_article` / `github_card` / `xiaohongshu` / `sales_material` / `infographic` / `cover`） |
| P-4 | AI 产出不可审计、无留痕 | 无法复盘与责任回溯 | `workflow_runs → workflow_tasks → workflow_outputs` 全链路执行留痕（硬性原则 5） |
| P-5 | AI 内容缺乏人工门禁 | 低质/错误内容直接外发风险 | 全局人工审核门禁：`needs_review` 吸收态 + `Review / Needs Revision / Ready to Publish` 审核动作 + **V1 绝不自动发布**（硬性原则 6） |
| P-6 | 发布与数据追踪断链 | 无法知道哪篇内容带来线索 | `publications`（资产×平台×发布）+ `content_metrics` 强制绑定 `topic_id` + `conversion_funnel` 视图 |
| P-7 | 无数据反哺机制 | 选题决策无法优化 | 趋势雷达（`trend_radar`）+ `secondary_candidates` 回写 `event_pool` + `knowledge_topic_bank.next_action` 驱动开采（M5 闭环） |

### 1.3 产品目标与成功标准

最终用户愿景（需求最终目标）："生成本周内容计划 → 审核 Topic → 点击开始生产 → 四个 AI Workflow 自动运行 → 生成内容 → 人工审核 → 发布 → 回填数据 → 下一周自动优化选题"。

**V1（M0-M3，MVP Exit = MS-3）成功标准**：端到端最小闭环可演示——**生成本周内容计划 → 审核 Topic → 确认并开始生产 → AI 周报生产（90 秒中文口播脚本）→ 人工审核 → Ready to Publish**（roadmap §6 MS-3）。

### 1.4 产品核心原则（需求一，6 条硬性原则）

| # | 原则 | 基线落点 |
|---|---|---|
| 1 | **Topic 是系统最核心数据实体**；Topic 与 Content Asset 严格分开 | 数据模型 §5：`topics` 与 `content_assets` 仅 `content_assets.topic_id → topics.id` 单向引用 |
| 2 | 所有内容必须有来源与事实核验能力 | `sources` / `source_packets` / `source_packet_items`（`core_fact` / `key_numbers` / `number_test_conditions` / `item_verification_status`） |
| 3 | 支持 Topic 血缘（`Parent_Topic_ID` / `Source_Topic_IDs`，Lineage 可视化） | `topic_relations` 权威边表 + `topics.parent_topic_id` / `source_topic_ids` 投影列；递归 CTE 查询（深度 3-5 层） |
| 4 | AI 工作流采用 Orchestrator + 子 Workflow 架构，Prompt 不写死在页面 | `workflow_types`（5 类）→ `workflow_templates` → `ai_prompt_templates`；`/lib/ai/providers`、`/lib/ai/orchestrator`、`/lib/ai/workflows` 三层抽象 |
| 5 | 所有 AI 工作流保留执行记录 | `workflow_runs`（input / topic / source packet / status / output / error / 时间）+ `workflow_tasks` + `workflow_outputs` |
| 6 | 第一版必须有人类审核环节，AI 不允许自动无条件发布 | `topic_status` 9 态全局状态机；`publications.status='published'` 仅人工触发（DB 层强制） |

---

## 2. 用户与角色

### 2.1 目标用户画像

| 画像 | 说明 | 核心诉求 |
|---|---|---|
| 内容运营负责人（总控台操作者） | 每周制定内容计划、派发生产、把控节奏 | 单屏总览、一键"生成本周内容计划/确认并开始生产"、产能与优先级可见 |
| 选题/调研人员 | 录入候选事件、查重聚类、事实核验 | 候选池、来源核验工作台、冲突裁决 |
| 内容审核人员 | 审核 AI 产出、决定通过/退回/待发布 | 待办审查队列、run 级与资产级审核、审计留痕 |
| 发布与数据人员 | 编排发布计划、人工发布、回填指标 | 发布中心、指标录入、漏斗视图 |
| 系统管理员 | 配置评分权重、路由规则、Prompt、Provider | `/settings` 配置驱动管理 |

### 2.2 Legacy 5 个核心角色 → 平台模块映射（需求原文角色体系）

需求原文声明平台来源于已人工验证的 5 个核心角色；产品化后**每个角色对应平台中的一个职责域（模块 + 工作流），而非 RBAC 角色**（V1 单用户，见 §2.3）：

| Legacy 角色 | 平台模块映射 | 对应工作流（`workflow_type`） | 主页面路由 |
|---|---|---|---|
| 00 内容总控台 | 内容总控台 Dashboard + Orchestrator | `orchestrator`（流水线 12 步） | `/dashboard` |
| 01 AI 周报工作流 | AI Weekly 周报 | `ai_weekly`（每周一 · 选 5-8 条 · 90 秒中文口播） | `/topics`、`/workflows/runs` |
| 02 GitHub 周榜工作流 | GitHub 周报快照 | `github_weekly`（快照不可变 + Replay） | `/github-weekly` |
| 03 AI 常青知识工作流 | 常青知识 Topic Bank | `evergreen_knowledge`（一次一主 + 衍生 ≤3） | `/knowledge` |
| 04 公众号 / 深度专题工作流 | 公众号深度专题 | `wechat_deep_dive`（Content Role · 12 段蓝图） | `/content`、`/content/[id]` |

### 2.3 权限模型（V1）

- **V1 单用户、无复杂 RBAC**（roadmap DC-06）；`/settings` 用户/权限区仅预留。
- `audit_log.actor` 记录操作者：人工操作用用户标识，AI 操作用 `ai:run-xxx`（如 `ai:run-2026W36-AI-WEEKLY-R01`）。认证方式见 Open Questions `OQ-04`。
- **人工门禁可视性**（IA §6.5）：所有发布/审核动作在 UI 上必须有显性"人工"标识并与 `audit_log` 关联，不得提供绕过路径。

### 2.4 角色职责 × 权限边界（职责域，非 RBAC 实现）

| 职责域 | 可执行操作（示例） | 禁止操作 |
|---|---|---|
| 选题调研 | 录入 `event_pool` 候选、维护 `sources`、执行事实核验、冲突裁决 | 不得置 `topics.status=Published` |
| 运营总控 | 触发 Orchestrator（两 CTA）、批量改 priority、派发生产 | 不得直写 `workflow_outputs` 的 `applied=true` 之外的消费 |
| 内容审核 | Approve / Needs Revision / Ready to Publish（落 `audit_log`） | 不得绕过审核把 AI 产物直接提升 `content_assets` |
| 发布执行 | 回填 `published_date / published_url / published_by`（仅人工触发 `published`） | 系统/工作流禁止写 `published`（DB 约束） |
| 系统配置 | 修改 `system_settings` 权重、`workflow_routing_rules`、`ai_prompt_templates` | 不得删减任何需求字段 |

---

## 3. 范围与非目标

### 3.1 V1 范围（In Scope，引用 roadmap §1.1）

| # | 模块 | 覆盖范围 | 阶段 |
|---|---|---|---|
| 1 | Dashboard 内容总控台 | `/dashboard` 六区块（详见 §4.1） | M1 |
| 2 | Topic Center 选题中心 | `/topics`（过滤、表格、批量操作、候选池 Drawer） | M1 |
| 3 | Topic Detail | `/topics/[id]` 严格按 IA §3 的 **14 区块顺序** | M1 |
| 4 | Source Packet 证据包与核验 | `/sources` 三层管理 + 冲突裁决 | M1 |
| 5 | Workflow 基础结构 | 引擎 + 状态机 + AI 抽象层 + `/workflows`、`/workflows/runs` | M2 |
| 6 | Knowledge Topic Bank | `/knowledge`（知识网格、concept 图、衍生预算、开采入口） | M1 |
| 7 | GitHub Snapshot | `/github-weekly`（快照不可变、Replay、落 Topic） | M1 |
| 8 | Content Asset 基础管理 | `/content` 与 `/content/[id]`（版本全保留） | M1 |
| 9 | 人工审核闸门 | `needs_review` 吸收态、审核操作、`audit_log` 留痕、绝不自动发布 | M1 基础 / M3 贯通 |

> 🔸 `/publications`（`planned/ready` 编排 + 人工发布）与 `/analytics`（指标录入 + 漏斗 + Leads）属 **M4**，不在 MVP 首发范围，但数据模型已全量建表（roadmap §1.1 追加说明）。

### 3.2 非目标（Out of Scope，引用 roadmap §1.2）

| # | 非目标 | 说明 | 再评估时机 |
|---|---|---|---|
| 1 | 自动发布 Auto Publishing | `published` 仅人工触发，系统/工作流只生成 `planned → ready` | 不排期（硬性原则 6） |
| 2 | 复杂 CRM | `leads` 仅基础列表与分类，不做 CRM 工作流/集成/自动化跟进 | M5 后评估 |
| 3 | 视频生成 Video Generation | `asset_type='short_video_script'` 仅产出脚本文本，不生成视频文件 | 后置评估 |
| 4 | 自动剪辑 Auto Editing | 无任何自动剪辑/合成能力 | 后置评估 |
| 5 | 多租户 Multi-tenancy | 单租户部署 | 后置评估 |
| 6 | 复杂 RBAC | V1 单用户；`/settings` 用户/权限区仅预留 | 后置评估 |
| 7 | 实时全网爬虫 | 候选扫描非实时；V1 候选经人工录入或受限来源导入 `event_pool`（见 OQ-02） | 需用户确认录入方式 |
| 8 | 定时自动调度 Scheduled Cron | M3 以手动触发为主；每周一 09:00 定时器（`scheduling='weekly'`）放 M5 后启用（见 OQ-06） | M5 |
| 9 | AI 自动生成配图/视频 | `image_plan` 仅输出配图计划，不自动出图；真实截图/UI 必须 `from_brand_asset` / `from_verified_source` | M4 后评估 |

### 3.3 边界规则（In/Out 判据，引用 roadmap §1.3）

1. **判据一（范围）**：需求十八第一阶段清单为 V1 MVP 首发范围，超出项进入 M4/M5 或 Out 清单。
2. **判据二（门禁）**：任何内容产出必须经过人工审核；不存在绕过 `audit_log` 的状态变更路径。
3. **判据三（产物边界）**：AI 原始产出一律先进 `workflow_outputs` 留痕，**仅人工审核通过后提升为 `content_assets`**。
4. **判据四（执行时机）**：数据模型 M0 全量建表（34 表，零删减）；完整 AI Workflow 逻辑到 M3 才实现。

---

## 4. 功能需求（按模块）

### 4.0 通用约定（全模块生效）

- **路由**：14 条路由全量保留（IA §1.2）：`/dashboard`、`/topics`、`/topics/[id]`、`/workflows`、`/workflows/runs`、`/content`、`/content/[id]`、`/knowledge`、`/github-weekly`、`/sources`、`/assets`、`/publications`、`/analytics`、`/settings`。L3 详情（`/workflows/runs/[id]`、`/sources/[id]`）用 Drawer 承载，**不新增路由**（IA §1.3）。
- **三态约定**：全站统一 Skeleton / EmptyState / Error，禁止空白页（IA §4.4）。
- **字段展示**：页面展示字段一律引用数据模型列名；枚举"中文标签 + 英文 value"双显，value 以数据模型 §1 为准。
- **审计**：所有人工审核动作、状态变更、workflow 触发写 `audit_log`（`actor = 用户标识 或 ai:run-xxx`）。
- **人工门禁**：`needs_review` 为 run 级门禁吸收态；`published` 仅人工触发；UI 显性"人工"标识。
- **模块 FR 编号**：`FR-{DB|TC|TD|SP|WF|KN|GH|CT|PB|AN|ST}-{nn}`。

---

### 4.1 Dashboard `/dashboard` — 内容总控台（Orchestrator 控制面）

**职责**：每周内容运营的单屏总览，承担 Orchestrator 的人工触发入口。

| FR 编号 | 功能需求 | 数据源 / 落库 | 验收要点 |
|---|---|---|---|
| FR-DB-01 | 周概览 KPI 行：当前周（`content_week`）、P0 Topic 数、P1 Topic 数、待审核内容、待发布内容、已发布内容、本周 Leads、Demo 数、Consultation 数 | `topics` / `content_assets` / `publications` / `leads` / `content_metrics` | KPI 与当前周选择器联动；P0/P1 计数按 `topics.priority` 过滤当前 `content_week` |
| FR-DB-02 | 四大工作流状态卡：AI 周报状态、GitHub 周榜状态、常青知识状态、公众号状态 | `workflow_batches.status` + `workflow_runs.status` | 每卡显示最近批次 `batch_id`（如 `2026W36-AI-WEEKLY`）+ 状态徽标（`batch_status` 6 态） |
| FR-DB-03 | 核心 CTA 区：「生成本周内容计划」（Orchestrator 产出 `production_plan`）与「确认并开始生产」（子 workflow 派发）；均为**人工触发** | 落 `workflow_runs`（`workflow_type='orchestrator'`，`status='queued'`） | 点击后创建 orchestrator run 并留痕；run 状态在最近 Runs 时间线可见 |
| FR-DB-04 | 待办审查队列：`needs_review` 的 run、`Review` 态资产、`conflict` 证据包、`review_required` 查重项 | `workflow_runs` / `content_assets` / `source_packets` / `event_pool` | 队列项可跳转对应处理页；空态显示"无待办" |
| FR-DB-05 | 最近 Workflow Runs 时间线：父子调用树最近 N 条 | `workflow_runs`（`parent_run_id`） | 展示 `run_number`（如 `2026W36-AI-WEEKLY-R01`）+ `status` + 时间 |
| FR-DB-06 | 趋势雷达图 | `trend_radar`（`signal_strength` / `velocity` / `novelty_score` 按周聚合） | 图表粒度/刷新策略见 OQ-09 |

---

### 4.2 Topic Center `/topics` — 选题中心

**职责**：Topic 的列表、筛选、排序、批量操作与候选导入入口。

| FR 编号 | 功能需求 | 数据源 / 落库 | 验收要点 |
|---|---|---|---|
| FR-TC-01 | 过滤栏：`status`（9 态）、`priority`（P0-P3）、`topic_type`（8 类）、`content_week`、`history_dedupe_status`（6 态）、关键词搜索（title/topic_id） | `topics` | 组合过滤可清空；`topic_id` 支持前缀模糊（如 `2026W36`） |
| FR-TC-02 | Topic 表格列：`topic_id`、title、`topic_type` 徽标、`priority` 徽标（P0 红/P1 橙/P2 蓝/P3 灰）、`status` 徽标、五维评分汇总条（`b2b_relevance` / `traffic_potential` / `conversion_potential` / `timeliness` / `content_value`）、`primary_cta` 标签、`content_week`、updated_at | `topics` | 行点击进 `/topics/[id]`；`priority`/`status` 徽标语义色符合 IA §4.1 |
| FR-TC-03 | 批量操作栏：批量改 priority、批量归档（→ `Archived`）、批量派发 | 落 `audit_log`（`action='status_changed'` 等） | 批量操作逐条留痕；归档写 `archived_at` |
| FR-TC-04 | 候选入口：打开 `event_pool` 候选池 Drawer，展示 `selection_status`（`pending` / `selected` / `eliminated`）与 `elimination_reason` | `event_pool` | Drawer 640px 右滑；可筛选按 `week` / `selection_status` |
| FR-TC-05 | 空态/加载态：骨架屏 + 空态 CTA（新建 Topic / 生成内容计划） | — | 无数据时引导至 Dashboard CTA 或手动建 Topic |

---

### 4.3 Topic Detail `/topics/[id]` — Topic 详情（重点页面）

**职责**：Topic 全生命周期单页工作台。**区块顺序为硬性要求，任何页面实现不得重排/删节**（IA §6.4）。页面结构 = 顶部信息头（可固定）+ 两栏（左侧主列顺序区块，右侧侧栏 CTA 与血缘摘要）。

| 顺序 | 区块 | 核心内容 | 数据源 |
|---|---|---|---|
| 1 | 基础信息 Basic Info | `topic_id`（如 `2026W36-001`）+ title 双显、`content_week`、`description`、`topic_type` 徽标、`status` 9 态徽标、`created_by_run_id`、`created_at` / `updated_at` / `archived_at` | `topics` |
| 2 | 评分 Scoring | 五维 1-10 进度条 + 数值；`business_relevance` 独立显示并标注"门控不参与加权"；`score_rationale`（jsonb）推导展示、`score_version`；🔸 重新评分操作（触发 Orchestrator 评分 run） | `topics` |
| 3 | Priority | `priority` 徽标（语义色）；展开显示分档依据（P0≥8.0 / P1≥6.5 / P2≥5.0 / P3<5.0 及 business_relevance 封顶/兜底结论） | `topics` / `score_rationale` |
| 4 | Tags | `trend_tags`（`text[]`）标签组 + `topic_type` 常驻徽标；🔸 可移除标签（落 audit） | `topics` |
| 5 | Parent | 单父衍生链 `parent_topic_id` → 父 `topic_id` + title 可跳转；空态"无父 Topic（顶层选题）" | `topics` |
| 6 | Source Topics | 多对多来源血缘 `source_topic_ids`（`uuid[]`），逐项显示 `topic_id` + title，可跳转、🔸 可追加来源 | `topics` |
| 7 | Lineage 可视化 | `topic_relations`（`relation_type ∈ parent/source`）+ `WITH RECURSIVE` 递归 CTE，上下行遍历 3-5 层；有向图：节点 = Topic 卡片，边 = parent 实线 / source 虚线；当前 Topic 高亮 | `topic_relations` |
| 8 | Source Packet | 包级头（`packet_id` 如 `2026W36-001-SP`、`verification_status` 五态、`source_consistency`、`conflict_fact_ids`、`verified_by` / `verified_at`、notes）+ 明细表（`core_fact`、`key_numbers`、`number_test_conditions`、`item_verification_status`、`event_assessment`）+ `conflict` 展开逐条裁决入口 | `source_packets` / `source_packet_items` |
| 9 | Workflow Runs | `workflow_runs WHERE topic_id = 本 Topic`；父子调用树（`parent_run_id`）+ 每 run `status` 徽标、`batch_id`、`attempt_count`、产物（`workflow_outputs.output_type` + `applied`）；run Drawer 看 `workflow_tasks` 步骤时间线 | `workflow_runs` / `workflow_tasks` / `workflow_outputs` |
| 10 | Content Assets | 资产列表（`asset_key`、`asset_type` 徽标、platform、content_role、cta、status、current_version）；版本摘要；跳转 `/content/[id]` | `content_assets` / `content_asset_versions` |
| 11 | Derived Topics | `topics WHERE parent_topic_id = 本 Topic.id`（relation_type='parent' 遍历结果），显示 `topic_id` + title + status 可跳转 | `topics` / `topic_relations` |
| 12 | Metrics | `content_metrics WHERE topic_id = 本 Topic`（18 字段全量可切平台/日期）；`conversion_funnel` 视图漏斗条；KPI 小卡 + 按平台/周 Sparkline | `content_metrics` / `conversion_funnel` |
| 13 | CTA | `topics.primary_cta` → `ctas`（key、label、cta_type、target_url_template）；资产级覆盖列表；"`Ready for Production` 前必填"规则提示 | `ctas` / `content_assets` |
| 14 | 历史记录 History | `audit_log WHERE entity_type='topic' AND action='status_changed'`（视图 `topic_status_history`）Timeline：from_status → to_status、actor、workflow_run_id、note、created_at；🔸 包级核验记录（`source_packet_verifications`）并入时间线 | `audit_log` |

**硬性校验**：区块 1-14 顺序不可重排；血缘图双向 3-5 层；历史时间线必须来自 `audit_log`。

---

### 4.4 Source Packet `/sources` — 来源与核验中心

**职责**：来源主档、证据包与逐条事实核验的三层管理（`sources` → `source_packet_items` → `source_packets`）。

| FR 编号 | 功能需求 | 数据源 / 落库 | 验收要点 |
|---|---|---|---|
| FR-SP-01 | 来源主档列表：`source_name`、`source_url`、`source_type`（7 类：`official` / `github` / `official_docs` / `authoritative_media` / `tech_media` / `community` / `internal`）、`source_quality_score`（1-5）、`event_date` / `disclosure_date`、`is_confidential` | `sources` | **核验状态不放在 sources 层**（`source_quality_score` 为稳定信任分，与包级核验状态分层不混用）；`UNIQUE(source_url, source_type)` |
| FR-SP-02 | 证据包列表/聚合：`packet_id`、包级 `verification_status` 五态（`unverified` / `partially_verified` / `verified` / `conflict` / `needs_update`）、`source_consistency`（`consistent` / `conflict` / `partial`）、`conflict_fact_ids`、`verified_by` / `verified_at` | `source_packets` | 包级状态由明细 rollup，**禁止手填与明细不一致**；rollup 优先级：`conflict` > `needs_update` > `verified` > `partially_verified` > `unverified` |
| FR-SP-03 | 核验明细表：`core_fact`（单条核心事实）、`key_numbers`（`[{"label","value","unit","scope","captured_at","source_url"}]`）、`number_test_conditions`（`[{"key","operator","expected","unit","tolerance","note"}]` 逐条执行入口）、`item_verification_status`、`event_assessment` | `source_packet_items` | 数字测试条件可逐条执行并更新核验状态；`event_assessment` 与 AI Weekly 五维评估同源 |
| FR-SP-04 | 冲突处理面板：`source_consistency='conflict'` 时逐条裁决（置 `verified` / 驳回写 notes） | 落 `audit_log`（`action='conflict_resolved'`） | 裁决后包级 rollup 自动重算；记录 `verified_by` / `verified_at` |

**关联规则**：来源数据冲突时标记 `Source_Consistency = Conflict`（需求三）；`is_confidential=true` 的 internal 来源不进入 AI 成文/送审白名单。

---

### 4.5 Workflows `/workflows` + `/workflows/runs` — 工作流引擎

**职责**：工作流注册表、模板、路由规则与批次/执行记录的管理面（硬性原则 5 的可视化落点）。

**4.5.1 `/workflows` 配置面**

| FR 编号 | 功能需求 | 数据源 / 落库 | 验收要点 |
|---|---|---|---|
| FR-WF-01 | 工作流类型卡片：5 类 `workflow_types`（`orchestrator` / `ai_weekly` / `github_weekly` / `evergreen_knowledge` / `wechat_deep_dive`），展示 `scheduling`、`capacity_rules`（如 AI Weekly `{concurrency_limit:1, weekly_quota:{min:5,max:8}, serial_mode:true}`）、`enabled` | `workflow_types` | 卡片展示注册表行，只读 |
| FR-WF-02 | 模板版本表：`workflow_templates`（version、`prompt_refs` → `ai_prompt_templates.key`、`step_definition`、active）；`UNIQUE(workflow_type_key, version)` | `workflow_templates` | 展示当前 active 版本；历史版本可查看（不可编辑） |
| FR-WF-03 | 路由规则表：`workflow_routing_rules`（match_field / match_value → workflow_type_key），默认映射：`hot/trend→ai_weekly`、`technical_project→github_weekly`、`knowledge/evergreen→evergreen_knowledge`、`scenario/product/conversion→wechat_deep_dive`；`overridable=true` 可人工覆盖 | `workflow_routing_rules` | 命中取最高 priority 规则；覆盖开关生效 |
| FR-WF-04 | 批次列表：`workflow_batches`（batch_id、week、`week_start` / `week_end`、status `batch_status` 6 态、topic_ids 摘要） | `workflow_batches` | 按 `week` 过滤；`batch_id` 追加 `-NN`（如 `2026W36-AI-WEEKLY-02`）表示同周重跑 |
| FR-WF-05 | 操作区：新建/重跑批次（生成 `2026W36-AI-WEEKLY`，重跑加 `-02` 后缀） | 落 `workflow_batches` + `workflow_runs` | 重跑不覆盖原批次 |

**4.5.2 `/workflows/runs` 执行记录面**

| FR 编号 | 功能需求 | 数据源 / 落库 | 验收要点 |
|---|---|---|---|
| FR-WF-06 | 过滤栏：`workflow_type_key`、`status`（`workflow_run_status` 5 态）、`batch_id`、`week`、Topic | `workflow_runs` | 组合过滤 |
| FR-WF-07 | Runs 表格：`run_number`（如 `2026W36-AI-WEEKLY-R01`）、`workflow_type_key`、`batch_id`、`topic_id`、`status` 徽标、`attempt_count`、`started_at` / `completed_at`、错误摘要 | `workflow_runs` | `attempt_count` 重跑递增不新建 run |
| FR-WF-08 | Run 详情 Drawer：`workflow_tasks` 步骤时间线（sequence / status / error，`task_status` 含 `skipped`）、`workflow_outputs` 产物（`output_type` + `content` + `applied`）、`parent_run_id` 调用树、`error` | `workflow_tasks` / `workflow_outputs` | Drawer 承载，不新增路由 |
| FR-WF-09 | 审查队列：`needs_review` 批次集中处理（通过 → `completed`；退回 → 同 run 重跑 `attempt_count+1`） | 落 `audit_log` | 人工通过可联动 `topics.status = Ready to Publish` |

**引擎行为契约（继承 workflow 基线）**：
- Run 状态机：`queued → running → completed / failed / needs_review`；`needs_review → completed`（人工通过）/ `needs_review → queued`（退回重跑）/ `failed → queued`（retry）。
- Orchestrator 流水线 12 步：`candidate_reception → history_dedupe → topic_clustering → topic_id_assignment → scoring → priority_assignment → workflow_routing → capacity_control → cta_assignment → trend_radar_management → derived_topic_management → return_writeback`，每步落 `workflow_tasks`。
- 评分→priority：五维加权（权重画像按 `topic_type` 存 `system_settings`，不硬编码；默认 `0.20/0.20/0.25/0.20/0.15`，`hot/trend` 提权 timeliness 0.35、`evergreen/knowledge` 提权 content_value 0.35、`conversion/product` 提权 conversion_potential 0.40）；分档 `P0≥8.0 / P1≥6.5 / P2≥5.0 / P3<5.0`；门控 `business_relevance <4` 且非 product/conversion 型封顶 P2；`hot/trend` 型 `timeliness=10` 兜底 P1。
- 产物边界：AI 原始产出先进 `workflow_outputs`，`applied` 幂等回写（`applied_at`），仅人工审核通过后提升 `content_assets`。
- AI 抽象层：`/lib/ai/providers`（统一 `call()` 接口 + mock provider）、`/lib/ai/orchestrator`、`/lib/ai/workflows`；业务代码禁止直接 `import` 模型 SDK；Prompt 单一来源 `ai_prompt_templates`。

---

### 4.6 Knowledge `/knowledge` — 常青知识 Topic Bank

**职责**：AI Knowledge Topic Bank 的开采与覆盖度管理（需求七）。

| FR 编号 | 功能需求 | 数据源 / 落库 | 验收要点 |
|---|---|---|---|
| FR-KN-01 | 知识网格/表格：`concept`（如 "Agent Skills Library"）、`category`（`ai_technology` / `ai_product` / `methodology` / `industry_practice` / `tool_tutorial`）、`knowledge_status`（6 态）、`content_status`（8 态）、b2b_relevance、`user_learning_cost`（low/medium/high）、`long_term_value`（1-10）、`current_heat`（cold/warming/hot/cooling）、`next_action` | `knowledge_topic_bank` | 与 `topics`（`topic_type='knowledge'`）1:1；`b2b_relevance` 由视图暴露冗余，单一数据源在 `topics` |
| FR-KN-02 | 概念图：`upstream_concepts` / `related_concepts` / `downstream_concepts` 数组（或 `knowledge_concept_edges` 边表）可视化 | `knowledge_topic_bank` / `knowledge_concept_edges` | concept 图与 Topic 血缘图是两套独立边，互不写入 |
| FR-KN-03 | 衍生预算指示：`knowledge_derivations` `round_index ∈ 1..3` 预算条（一次一主 + 最多 3 衍生） | `knowledge_derivations` | 预算超限被应用层守卫 `checkDerivedTopicBudget` 拦截并记 `audit_log`（`action='budget_denied'`） |
| FR-KN-04 | 开采操作：触发 Evergreen Knowledge Workflow（按 `next_action` 或人工点单） | 落 `workflow_runs`（`workflow_type='evergreen_knowledge'`） | 每次调用恰 1 个主 Topic；`concurrency_limit=1, serial_mode=true` |

**知识状态联动**：`knowledge_status`（`uncovered → partial → basic_explanation → deep_explanation → needs_update → mature`）与 `content_status`（`to_research → to_produce → script_done → wechat_done → graphic_done → published → high_performing → needs_remake`）由工作流推进；逐资产真实状态以 `content_asset_versions.status` 为准。

---

### 4.7 GitHub `/github-weekly` — GitHub 周报快照

**职责**：GitHub 周榜快照的抓取、定稿（frozen 不可变）与 Replay 管理（需求六）。

| FR 编号 | 功能需求 | 数据源 / 落库 | 验收要点 |
|---|---|---|---|
| FR-GH-01 | 周选择器 + 快照列表：`snapshot_id`（如 `2026W36-GH-ORIGINAL-PURE`）、`snapshot_type`（`original` / `replay`）、week、`selection_basis`（`pure_weekly_rank` / `value_filtered` / `mixed`）、`status`（`captured` → `frozen`） | `github_snapshots` | `UNIQUE(week, snapshot_type, selection_basis)`；同口径同周唯一 |
| FR-GH-02 | 榜单表格：`rank`、`repository`（`owner/repo`）、`project_name`、`weekly_growth`、`total_stars`、`repo_url`、`verification_status`（复用全局核验五态）、`selected`、`elimination_reason` | `github_snapshot_items` | 捕获列（rank/repository/project_name/weekly_growth/total_stars/repo_url）冻结；运营列（verification_status/selected/elimination_reason）可变更并记 `audit_log` |
| FR-GH-03 | 不可变标识：`status='frozen'` 快照显示锁标识（DB 触发器禁 UPDATE/DELETE）；Replay 新建行 + `source_item_id` 血缘，**永不覆盖 Original** | `github_snapshots` / `github_snapshot_items` | frozen 快照任何修改/删除请求被后端拒绝；UI 锁标识显性 |
| FR-GH-04 | 选中落 Topic：`selected=true` 项关联 `topics.id`（`topic_type='technical_project'/'trend'`，`topic_id` 回填） | `github_snapshot_items` → `topics` | 落 Topic 后可在 `/topics/[id]` 查看血缘 |
| FR-GH-05 | 操作区：抓取本周（Original）、Replay 重生成、标记 selected/淘汰原因 | 落 `workflow_runs`（`workflow_type='github_weekly'`，`snapshot_capture` 步骤） | 统计口径 = 上一自然周（每周一抓取）；`selection_basis` 每次抓取显式声明 |

---

### 4.8 Content `/content` + `/content/[id]` — 内容资产中心

**职责**：`content_assets` 逻辑资产及版本管理（与 Topic 严格分离展示）。

| FR 编号 | 功能需求 | 数据源 / 落库 | 验收要点 |
|---|---|---|---|
| FR-CT-01 | 过滤栏：`asset_type`（8 类）、`platform`（`publication_platform` 5 枚举）、`status`（`asset_status` = `topic_status` 子集 7 态）、`content_role`（5 枚举）、所属 Topic | `content_assets` | 组合过滤 |
| FR-CT-02 | 资产表格：`asset_key`（`{topic_id}:{asset_type}:{platform}` 跨版本不变）、title、`asset_type` 徽标、platform、content_role、cta、status、`current_version_id`、updated_at | `content_assets` | `asset_type='wechat_article'` 时 `content_role` 必填（CHECK） |
| FR-CT-03 | 待审核队列：`Review` / `Needs Revision` 态资产集中处理 | `content_assets` | 审核动作（Approve / Needs Revision / Ready to Publish）落 `audit_log` 且 UI 显性"人工"标识 |
| FR-CT-04 | 批量操作：导出、改平台、归档 | 落 `audit_log` | 逐条留痕 |
| FR-CT-05 | 资产详情 `/content/[id]`：资产信息头（`asset_key`、title、`asset_type`、platform、content_role、status、当前 version）+ 内容编辑/预览 + 版本历史 Timeline（全保留、可回滚/对比、`is_current` 切换）+ 关联 Topic 跳转 + CTA 面板（默认继承 `topic.primary_cta`，单值覆盖）+ 发布状态 + 审核操作 + 🔸 配图计划（`deep_dive_image_plans`） | `content_assets` / `content_asset_versions` / `publications` / `ctas` / `deep_dive_image_plans` | 版本历史全保留不覆盖删除；`created_by_run_id` 审计可追溯生成来源 |

**产物提升规则**：AI 原始产出（`workflow_outputs`）→ 人工审核通过 → 提升 `content_assets`（`asset_id` 回填 `workflow_outputs.asset_id`）；`content_asset_versions` 每次修改/AI 重生成产生新版本，`version` 从 1 递增。

---

### 4.9 Publications `/publications` — 发布中心（M4 阶段，数据模型 M0 已建表）

**职责**：发布计划的编排与人工发布执行（V1 绝不自动发布）。

| FR 编号 | 功能需求 | 数据源 / 落库 | 验收要点 |
|---|---|---|---|
| FR-PB-01 | 发布列表：`topic_id`、`asset_id`、platform（5 枚举）、`scheduled_date`、`published_date`、`published_url`、status（`planned` / `ready` / `published` / `failed`） | `publications` | 粒度 = 资产 × 平台 × 一次发布；`asset_version_id` 精确到被发布版本 |
| FR-PB-02 | 过滤：`platform`、`status`、`metric_date` 区间 | `publications` | 组合过滤 |
| FR-PB-03 | 待发布队列：`ready` 态集中处理 | `publications` | 从资产审核通过（`Ready to Publish`）进入 |
| FR-PB-04 | 人工发布操作：回填 `published_date` / `published_url` / `published_by`（**仅人工触发 `published`**） | 落 `audit_log`（`action='published'`） | DB 触发器/应用层禁止 workflow 直写 `published`；`topics.status=Published` 需存在 `publications` 记录 |

**关联规则**：`publications.status='published'` 触发 `topics.status: Ready to Publish → Published`（人工确认，写 `audit_log`）。

---

### 4.10 Analytics `/analytics` — 数据分析（M4 阶段）

**职责**：全量指标的事实面——Conversion Funnel 与平台/周维度表现洞察（需求十三）。

| FR 编号 | 功能需求 | 数据源 / 落库 | 验收要点 |
|---|---|---|---|
| FR-AN-01 | KPI 概览行：impressions、views、reads、cta_clicks、demo_requests、sales_leads、deals、revenue 等聚合 | `content_metrics`（18 字段全量可用） | 所有数据强制绑定 `topic_id` |
| FR-AN-02 | Conversion Funnel：Read → CTA Click → Lead → Registration → Demo → Sales Lead → Deal → Revenue | SQL 视图 `conversion_funnel` | 视图映射固化：`Read=reads`（视频另看 `views`）、`Lead=registrations + dm_count`；不新增非需求字段 |
| FR-AN-03 | 维度分析：按 `publication_platform` / `metric_date`（周/月）下钻的指标表与图表 | `content_metrics` | `UNIQUE(topic_id, asset_id, platform, metric_date, COALESCE(publication_id::text,''))` 防重复录入 |
| FR-AN-04 | Leads 池：`leads`（`lead_type` 7 类、`lead_urgency`、`lead_status` `new/assigned/contacted/closed`、`suggested_reply` 仅建议不自动回复） | `leads` | AI 建议回复只读展示，不做自动回复 |
| FR-AN-05 | 趋势雷达图：`trend_radar` 跨周对比 | `trend_radar` | M5 增强（跨周对比），V1 展示当前周 |

---

### 4.11 Settings `/settings` — 系统设置

**职责**：评分权重/阈值、产能、路由与 Prompt 模板的配置驱动管理（避免硬编码）。

| FR 编号 | 功能需求 | 数据源 / 落库 | 验收要点 |
|---|---|---|---|
| FR-ST-01 | 评分配置：`scoring.weights.default/hot/evergreen/conversion`、`scoring.threshold.p0/p1/p2` | `system_settings`（key + jsonb value） | 修改后 Orchestrator 重新评分使用新配置；`score_version` 变更递增 |
| FR-ST-02 | 产能配置：`capacity.global_concurrency`、workflow `capacity_rules` | `system_settings` / `workflow_types.capacity_rules` | 展示并可调（默认 `concurrency_limit=1, serial_mode=true`） |
| FR-ST-03 | 路由规则：`workflow_routing_rules` 可视化编辑 | `workflow_routing_rules` | 增删改记录审计；命中取最高 priority |
| FR-ST-04 | Prompt 模板管理：`ai_prompt_templates`（key、version、system_prompt、user_prompt_template、params_schema、active；`UNIQUE(key, version)`） | `ai_prompt_templates` | Prompt 单一来源 = DB；`/ai-prompts/*.md` 为源文件导入来源；禁止写死在页面组件 |
| FR-ST-05 | 集成：LLM Provider 配置（`/lib/ai/providers` 抽象层可插拔） | — | Provider 选型见 OQ-01 |
| FR-ST-06 | 用户/权限：V1 单用户，仅预留 | — | 不做复杂 RBAC |

---

## 5. 非功能需求

| 类别 | 需求 | 基线来源 |
|---|---|---|
| 技术栈 | Next.js（App Router）+ TypeScript strict + Tailwind CSS + shadcn/ui + PostgreSQL 15+（Supabase）+ Drizzle ORM | 需求十六、DC-40 |
| 性能 | 桌面为第一优先级；信息密度高（默认正文 14px、紧凑表格、`tabular-nums`）；无感列表分页 | IA §4.2/§4.4、DC-39 |
| 可靠性 | 三态完备（Skeleton / EmptyState / Error），禁止空白页；迁移可重复执行（含回滚） | IA §4.4、DC-38 |
| 安全/合规 | 机密来源（`is_confidential=true`）不进入 AI 成文/送审白名单；Logo 禁止 AI 重绘（`CHECK (type='logo' → ai_policy='reference_only')`） | 数据模型 §3.2/§3.7 |
| 可审计 | 所有评分/定级/查重/聚类/CTA/路由/状态迁移落 `workflow_runs` 与 `audit_log` | 数据模型 §2.8 |
| 可维护 | 配置驱动（`system_settings` 不硬编码权重）；AI 调用三层抽象；Prompt DB 版本化 | 数据模型 §3.3、workflow §9 |

---

## 6. 需求优先级排序

🔸 基线（roadmap）提供 In/Out 范围与 M0-M5 阶段，未定义需求级优先级；本节以「MoSCoW（Must/Should/Could）+ 阶段」双维度编排，**不改变任何基线字段/枚举/范围**。

| 优先级 | 模块 / 需求 | 阶段 | 说明 |
|---|---|---|---|
| **Must（P0）** | Dashboard 六区块（FR-DB-01~06） | M1（D4） | 总控台为 Orchestrator 人工触发入口，MVP 演示必经 |
| **Must（P0）** | Topic Center（FR-TC-01~05） | M1（D4） | 选题浏览面 |
| **Must（P0）** | Topic Detail 14 区块（FR-TD，§4.3 全表） | M1（D5） | 重点页面，顺序硬性 |
| **Must（P0）** | Source Packet 三层 + 冲突裁决（FR-SP-01~04） | M1（D6） | 事实核验能力是产品差异化根基 |
| **Must（P0）** | Knowledge Topic Bank（FR-KN-01~04） | M1（D7） | 常青知识角色产品化 |
| **Must（P0）** | GitHub Snapshot（FR-GH-01~05） | M1（D7） | 周榜快照不可变 + Replay |
| **Must（P0）** | Content Asset 基础管理（FR-CT-01~05） | M1（D8） | 版本化资产 + 审核闸门 |
| **Must（P0）** | 人工审核闸门（FR-DB-04、FR-WF-09、FR-CT-03 等） | M1 基础 / M3 贯通 | 全局硬性原则 6 |
| **Must（P0）** | Workflow 引擎基础结构（FR-WF-01~09） | M2（D9） | 引擎 + AI 抽象层 |
| **Must（P0）** | Orchestrator + AI Weekly 端到端（§4.5 行为契约 + FR-WF） | M3（D10） | MVP Exit（MS-3）判定项 |
| **Should（P1）** | Publications 发布中心（FR-PB-01~04） | M4（D14） | 人工发布闭环，数据模型已就绪 |
| **Should（P1）** | Analytics 数据分析（FR-AN-01~05） | M4（D15） | 指标录入 + 漏斗 + Leads |
| **Could（P2）** | 优化闭环：趋势雷达跨周对比、`next_action` 驱动开采、评分权重调优 UI、每周一定时调度 | M5（D16-D18） | 数据反哺闭环 |
| **Won't（V1 不做）** | 自动发布、复杂 CRM、视频生成、自动剪辑、多租户、复杂 RBAC、实时全网爬虫、AI 自动配图/视频 | — | 见 §3.2 非目标 |

**排序原则**：
1. **依赖优先**：D1 → D2 → D3 域服务（topic_id / lineage / audit）先行，页面全部依赖。
2. **垂直切片优先**：D10（Orchestrator + `ai_weekly`）为最小可演示闭环，先于其余 3 个工作流（D11-D13）。
3. **门禁不妥协**：任何 Must 项交付时不得绕过人工审核（判据二）。
4. **数据先行**：34 表 M0 全量建表，页面/工作流在 M1-M3 逐步消费。

---

## 7. 验收口径指引

### 7.1 通用验收标准（所有模块适用）

1. **字段口径**：页面展示字段名引用数据模型列名（如 `topics.topic_id`、`source_packets.verification_status`）；枚举"中文标签 + 英文 value"双显，value 以数据模型 §1 为准。
2. **审计留痕**：所有人工审核动作与状态迁移写 `audit_log`（`actor = 用户标识 或 ai:run-xxx`）；无绕过路径。
3. **三态完备**：每个页面/区块具备 Skeleton / EmptyState / Error 三态，禁止空白页。
4. **人工门禁**：不存在绕过人工审核的发布路径（`publications.status='published'` 仅人工触发）；AI 产物未审核不得提升 `content_assets`。
5. **路由合规**：仅 14 条路由，L3 详情用 Drawer，不新增路由。

### 7.2 里程碑退出标准（roadmap §6 权威引用）

| 里程碑 | 退出标准 |
|---|---|
| MS-1（M1 结束） | 全部基础页面（Dashboard / Topics / Topic Detail / Sources / Knowledge / GitHub Weekly / Content）用真实数据渲染；Topic Detail 14 区块顺序合规；人工审核基础操作可用且全部落 `audit_log` |
| MS-2（M2 结束） | mock provider 可跑通 run 全生命周期；`needs_review` 门禁路径与 `applied` 幂等验证通过；Runs 页可审计 |
| MS-3（**M3 结束 = MVP Exit**） | 端到端最小闭环可演示：**生成本周内容计划 → 审核 Topic → 确认并开始生产 → AI 周报生产（90 秒中文口播脚本）→ 人工审核 → Ready to Publish**；无自动发布路径；`event_pool` → `topics` 提升链路正确 |
| MS-4（M4 结束） | 人工发布闭环（`planned/ready` + 人工回填 `published`）与指标录入/漏斗视图可用 |
| MS-5（M5 结束） | 完整周循环闭环演示：发布 → 数据回填 → 下一周选题可见数据反馈 |

### 7.3 硬性 Exit 约束（任何阶段不得违反）

1. 不存在绕过人工审核的发布路径（`publications.status='published'` 仅人工触发）。
2. 所有评分、定级、查重、聚类、CTA 判断、路由、状态迁移均有 `workflow_runs` 留痕。
3. 数据模型 34 表全量落库，需求字段零删减。

### 7.4 模块级验收指引（与 D1-D10 映射）

| 模块 | 对应任务 | 关键验收点（详见 §4 各模块 FR 表） |
|---|---|---|
| 脚手架/设计系统 | D1 | 14 路由可访问无报错；token 与 IA 一致；`npm run build` 通过 |
| 数据库 | D2 | 34 表齐全约束生效；frozen 快照 UPDATE/DELETE 触发异常；种子数据可查询 |
| Topic 域服务 | D3 | `topic_id` 跨 ISO 周漂移与不回收单测通过；血缘递归双向正确；防环生效 |
| Dashboard/Topics | D4 | 真实数据渲染；CTA 触发 orchestrator run 留痕；过滤/排序生效 |
| Topic Detail | D5 | 14 区块顺序与 IA 完全一致且不删节；血缘图双向 3-5 层 |
| Source Packet | D6 | rollup 规则单测通过；conflict 展开逐条裁决；核验进 `audit_log` |
| Knowledge/GitHub | D7 | frozen 快照锁标识且后端拒绝修改；Replay 不覆盖 Original；衍生预算超限拦截 |
| Content/审核闸门 | D8 | 版本历史全保留可回滚/对比；审核动作均写 `audit_log`；`Ready to Publish` 前 CTA 校验生效 |
| Workflow 引擎 | D9 | mock provider 跑通 `queued → running → completed`；`needs_review → completed` 人工路径可用；产物仅 `applied` 一次 |
| Orchestrator + AI Weekly | D10 | 两 CTA 端到端可用；候选→查重聚类→提升 `topics` 链路正确；口播脚本经人工审核后提升 `content_assets` |

---

## 8. Open Questions（开放问题）

> 本文档不裁决基线开放问题；以下 OQ-01~OQ-11 为 roadmap §5 权威引用，OQ-P 系列为本文档追加（🔸）。确认后更新对应基线决策日志或在实现前裁决。

| 编号 | 问题 | 影响范围 | 推荐方案 |
|---|---|---|---|
| OQ-01 | LLM Provider 选型与接入：MVP 用哪个供应商（Anthropic / DeepSeek / OpenAI / 自托管）？API Key 与成本预算是否就绪？D9 是否先以 mock provider 验收、D10 换真实 Provider？ | D9、D10、成本 | D9 用 mock 验收；D10 前确认真实 Provider 与 key；`/lib/ai/providers` 保持可插拔 |
| OQ-02 | 候选事件池数据来源：V1 不做实时全网爬虫，"联网扫描后的候选事件"由谁录入 `event_pool`？（手动录入 / RSS / 邮件导入 / 受限源半自动采集） | D4、D10、M1 候选池 Drawer | V1 推荐手动录入 + 受限源（如 Newsletter/订阅）半自动导入 |
| OQ-03 | GitHub Trending 抓取方式：GitHub 官方 API 不直接提供 Trending 数据，`snapshot_capture` 用哪个数据源？（RSSHub / 第三方接口 / 网页解析 / 人工粘贴 CSV） | D7、D10、`github_weekly` | 推荐 V1 人工粘贴 + 半自动解析，D11（github_weekly）时再定 |
| OQ-04 | 认证与单用户：V1 是否启用 Supabase Auth 登录，还是本地单用户无鉴权（`actor` 用固定标识）？ | D1、`audit_log.actor` | V1 推荐 Supabase Auth 单账号登录，`actor` 用用户标识；否则固定 `manual-user` |
| OQ-05 | 部署环境：Supabase 项目是否已存在？本地开发数据库还是云端？URL / key 是否可用？ | D2 起全部任务 | 推荐新建 Supabase 项目，`drizzle-kit` 迁移；本地 `docker postgres` 备选 |
| OQ-06 | 定时调度启用时机：AI Weekly / GitHub Weekly 的 `scheduling='weekly'`（每周一 09:00）在哪个阶段启用？ | M3（D10）vs M5 | 推荐 M3 以手动触发为主、M5 启用定时器 |
| OQ-07 | 内容语言：确认口播/文章/图文默认中文（90 秒中文口播、公众号中文）？ | D10、Prompt 模板 | 推荐默认中文，Prompt 模板显式声明 |
| OQ-08 | 发布渠道接入：确认 V1 公众号等平台人工发布 + 回填链接（不接平台 OpenAPI）？ | M4、`/publications` | 推荐人工发布回填（需求十二、数据模型 §2.8） |
| OQ-09 | 趋势雷达图表粒度与刷新策略（IA §6 遗留）：Dashboard 按周/跨周展示？刷新时机？ | D4、M5 | 推荐 Dashboard 当前周 + M5 增加跨周对比 |
| OQ-10 | 演示/验收数据：是否需要种子演示数据（模拟两周 topics / 一个 frozen 快照 / 若干 event_pool 候选）用于页面验收？ | D2、D4、D7 | 推荐提供 `demo-seed`（可一键清空），避免空态验收 |
| OQ-11 | 排期与规模：D1-D10 合计 65 人日的安排是否可接受？单人串行还是多人并行？M4/M5（D11+）是否在 MVP 验收后立即拆分？ | 全部 | 推荐 MVP 验收后按 roadmap §7 拆分 D11+ |
| OQ-P-01 🔸 | PRD 优先级编排确认：§6 的「MoSCoW + 阶段」双维度映射是否可作为正式优先级口径？是否需要在 `system_settings` 中登记需求级优先级字段（基线未定义该字段）？ | §6、Settings | 若需落库需求优先级，建议以 `system_settings` 追加配置键，不新增表/字段 |
| OQ-P-02 🔸 | `/assets`（品牌素材库，IA §2.11）在任务模块清单之外：V1 是否纳入 M1 首发，还是随 Content 模块后置？ | M1/M4 | 建议纳入 M1（Logo 保护是硬约束，AI 出图前必须可用），待确认 |

---

## 9. 引用关系

| 本文档章节 | 权威事实源 |
|---|---|
| §1 产品概述与问题定义 | `_requirements.md`（一、二十）、`_canonical-roadmap.md` §6 |
| §2 用户与角色 | `_requirements.md`（项目定位）、`_canonical-roadmap.md` DC-06 / OQ-04、`_canonical-ia.md` §2.14 |
| §3 范围与非目标 | `_canonical-roadmap.md` §1 |
| §4 功能需求（11 模块） | `_canonical-ia.md` §2（14 页职责与区块）、`_canonical-data-model.md` §3（34 表）、`_canonical-workflow.md` §2-§8 |
| §5 非功能需求 | `_requirements.md`（十六、十九）、`_canonical-ia.md` §4 |
| §6 需求优先级 | `_canonical-roadmap.md` §1/§2/§3（🔸 编排，非基线新增） |
| §7 验收口径 | `_canonical-roadmap.md` §6（MS-1~MS-5、硬性 Exit 约束）、§3（D1-D10 验收标准） |
| §8 Open Questions | `_canonical-roadmap.md` §5（OQ-01~OQ-11）、`_canonical-ia.md` §6（🔸 追加） |

---

## 附录 A：术语速查（英文标识符 → 中文）

| 英文标识符 | 中文 | 枚举/取值 |
|---|---|---|
| `topic_status` | Topic 全局状态 | Draft / Researching / Ready for Production / Producing / Review / Needs Revision / Ready to Publish / Published / Archived |
| `topic_type` | Topic 类型 | hot / evergreen / technical_project / scenario / product / conversion / trend / knowledge |
| `priority` | 优先级 | P0 / P1 / P2 / P3（分档 8.0 / 6.5 / 5.0） |
| `workflow_type` | 工作流类型 | orchestrator / ai_weekly / github_weekly / evergreen_knowledge / wechat_deep_dive |
| `workflow_run_status` | Run 状态 | queued / running / completed / failed / needs_review |
| `batch_status` | 批次状态 | planned / dispatching / in_progress / needs_review / completed / failed |
| `source_verification_status` | 核验状态 | unverified / partially_verified / verified / conflict / needs_update |
| `source_consistency` | 来源一致性 | consistent / conflict / partial |
| `asset_type` | 资产类型 | ai_weekly_script / short_video_script / wechat_article / github_card / xiaohongshu / sales_material / infographic / cover |
| `content_role` | 内容角色 | traffic / cognition / scenario / product / conversion（单值） |
| `publication_platform` | 发布平台 | wechat / douyin / xiaohongshu / bilibili / wechat_video |
| `publication_status` | 发布状态 | planned / ready / published / failed（published 仅人工） |
| `selection_basis` | 榜单口径 | pure_weekly_rank / value_filtered / mixed |
| 业务 ID 示例 | — | `topic_id: 2026W36-001`；`batch_id: 2026W36-AI-WEEKLY(-02)`；`run_number: 2026W36-AI-WEEKLY-R01`；`snapshot_id: 2026W36-GH-ORIGINAL-PURE`；`packet_id: 2026W36-001-SP`；`candidate_id: 2026W36-AI-CAND-001` |
