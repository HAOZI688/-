# 11 验收标准（Acceptance Criteria）

> **状态**：本文档是 V1 **可测试验收标准**的正式文档（docs 系列第 11 份）。所有验收点**可执行、可判读、可回归**。
>
> **事实源（唯一）**：
> - 字段/枚举/约束 → `docs/_canonical-data-model.md`（数据模型基线）
> - 行为/状态机/工作流契约 → `docs/_canonical-workflow.md`（工作流基线）
> - 页面/区块/设计系统 → `docs/_canonical-ia.md`（IA 基线）
> - 范围/里程碑/任务拆分 → `docs/_canonical-roadmap.md`（路线图基线）
>
> **原则**：
> 1. 本文档**不新增、不改写任何表字段/枚举/路由/状态**；验收断言中的标识符一律使用基线英文取值，中文仅作说明。
> 2. 验收方法统一为 **Given/When/Then（GWT）** + **检查点清单**；严重级别：**P0**（MVP 阻塞，任一不满足即不能退出 MS-3）/ **P1**（里程碑级，MS-1/2/4/5 阻塞）/ **P2**（任务级缺陷，允许带缺陷发布并排期修复）。
> 3. 与基线冲突时以基线为裁决；本文档的默认假设（验收前置条件）均标注依赖的基线 Open Question（OQ-xx），未定案处见 §11 与本文档返回值的 `deviationsFromCanonical`（[REVIEW]）。

---

## 1. 文档定位与验收约定

### 1.1 验收执行前提（默认假设，依赖基线 OQ）

| # | 验收前置条件 | 默认假设 | 依赖 |
|---|---|---|---|
| 1 | LLM Provider | D9 以 `mock provider` 验收；D10 前确认真实 Provider（`/lib/ai/providers` 可插拔） | OQ-01 |
| 2 | 候选事件入池方式 | 手动录入 + 受限源半自动导入（不做实时全网爬虫） | OQ-02 |
| 3 | GitHub Trending 数据源 | 人工粘贴/导入 + 半自动解析 | OQ-03 |
| 4 | 认证 | Supabase Auth 单账号登录，`audit_log.actor` = 用户标识（否则固定 `manual-user`） | OQ-04 |
| 5 | 部署环境 | 本地 `docker postgres` 或云端 Supabase 任一可跑迁移；`npm run build` 必绿 | OQ-05 |
| 6 | 定时调度 | M3 验收以**手动触发**为准；`scheduling='weekly'`（每周一 09:00）放 M5 | OQ-06 |
| 7 | 内容语言 | 默认中文（90 秒中文口播、公众号中文文章） | OQ-07 |
| 8 | 发布渠道 | 人工发布 + 回填链接，不接平台 OpenAPI | OQ-08 |
| 9 | 验收数据 | 提供 `demo-seed`（模拟两周 topics / 一个 frozen 快照 / 若干 event_pool 候选，可一键清空） | OQ-10 |

### 1.2 验收判读规则

1. **Given** 描述前置数据/状态（含具体枚举值）；**When** 描述操作（含路由与按钮）；**Then** 描述可自动/人工判定的断言（查库 SQL、UI 表现、`audit_log` 记录）。
2. 每条 GWT 默认含**数据断言**（落库字段、状态、审计）与**表现断言**（UI 可见性），缺一即不通过。
3. 负面用例（负面 GWT）与正面用例同等权重：**必须验证"拒绝"路径**（无绕过路径）。
4. 三态约定（IA §4.4）：任何页面在加载/空/错误下**禁止空白页**，必须呈现 Skeleton / EmptyState / Error。
5. 页面展示字段名一律引用数据模型列名（如 `topics.topic_id`、`source_packets.verification_status`），验收时逐项核对。

---

## 2. 数据模型完整性验收（M0 / D2）

> 对应路线图 M0 验收要点与 Exit 硬性约束 3（34 表全量落库、需求字段零删减）。

### 2.1 表与字段完整性（P0）

| 编号 | GWT |
|---|---|
| DM-01 | **Given** 迁移已执行；**When** 查询 `information_schema.tables`；**Then** 数据模型 §6 所列 **34 张表**全部存在（`ctas` … `audit_log`），无缺失、无多建。 |
| DM-02 | **Given** 数据模型 §3 各表列定义；**When** 逐表比对 Drizzle schema 与基线列清单；**Then** **需求字段零删减**：`topics`（topic_id/content_week/trend_tags/source_topic_ids/五维/business_relevance/priority/status/primary_cta/history_dedupe_status/dedupe_cluster_id/dedupe_matched_topic_id/score_version/score_rationale/source_packet_id/created_by_run_id/archived_at 等）、`event_pool` 需求五 9 字段（`published_at`、来源、`industry_impact`、`user_perception`、`tech_change`、`application_value`、`propagation_potential`、`selection_status`、`elimination_reason`）、`content_metrics` **18 指标字段全量**（impressions/views/reads/completion_rate/five_second_retention/save_count/share_count/comment_count/profile_visits/cta_clicks/dm_count/registrations/material_downloads/demo_requests/consultations/sales_leads/deals/revenue）均存在。 |
| DM-03 | **Given** 循环引用表已建；**When** 检查 `topics.source_packet_id`；**Then** 该列可空（NULL 允许）且 FK 指向 `source_packets.id`，方向语义 = "包归属 Topic、Topic 指向主包"（数据模型 §3.2）。 |
| DM-04 | **Given** 建表后需要种子数据的表；**When** 执行 seed；**Then** 种子可查询：`ctas` 6 个 key（`book_demo` / `download_whitepaper` / `join_community` / `contact_sales` / `follow_account` / `signup_newsletter`）、`workflow_types` 5 行（`orchestrator` / `ai_weekly` / `github_weekly` / `evergreen_knowledge` / `wechat_deep_dive`）、`workflow_templates` 每类型 ≥1 个 active 版本、`ai_prompt_templates` 初版、`system_settings`（`scoring.weights.default` / `scoring.weights.hot` / `scoring.weights.evergreen` / `scoring.weights.conversion` / `scoring.threshold.p0/p1/p2` 等）、`image_type_priorities` **7 行**（rank 1-7）、`workflow_routing_rules` **4 条默认映射**。 |

### 2.2 枚举完整性（P0）

**验收点**：数据模型 §1 全量枚举取值均被 Drizzle schema（`text + CHECK` 或 `CREATE TYPE`）约束；对每一枚举尝试写入清单外值，**必须被拒绝**。抽验枚举（全量以数据模型 §1 为准）：

| 枚举 | 允许取值（基线） |
|---|---|
| `topic_type` | `hot` / `evergreen` / `technical_project` / `scenario` / `product` / `conversion` / `trend` / `knowledge` |
| `topic_status` | `Draft` / `Researching` / `Ready for Production` / `Producing` / `Review` / `Needs Revision` / `Ready to Publish` / `Published` / `Archived` |
| `priority` | `P0` / `P1` / `P2` / `P3` |
| `history_dedupe_status` | `not_checked` / `unique` / `clustered` / `duplicate` / `merged` / `review_required` |
| `source_verification_status` | `unverified` / `partially_verified` / `verified` / `conflict` / `needs_update`（GitHub/AI Weekly 复用同一枚举） |
| `source_consistency` | `consistent` / `conflict` / `partial` |
| `workflow_type` | `orchestrator` / `ai_weekly` / `github_weekly` / `evergreen_knowledge` / `wechat_deep_dive` |
| `workflow_run_status` | `queued` / `running` / `completed` / `failed` / `needs_review` |
| `workflow_task_status` | `queued` / `running` / `completed` / `failed` / `skipped` |
| `workflow_output_type` | `production_plan` / `selected_events` / `trend_report` / `secondary_candidates` / `derived_topics` / `content_asset` / `source_packet_update` / `outline` / `knowledge_topic` / `deep_dive_plan` / `image_plan` |
| `batch_status` | `planned` / `dispatching` / `in_progress` / `needs_review` / `completed` / `failed` |
| `knowledge_status` | `uncovered` / `partial` / `basic_explanation` / `deep_explanation` / `needs_update` / `mature` |
| `knowledge_content_status` | `to_research` / `to_produce` / `script_done` / `wechat_done` / `graphic_done` / `published` / `high_performing` / `needs_remake` |
| `content_role` | `traffic` / `cognition` / `scenario` / `product` / `conversion`（单值） |
| `deep_dive_plan_status` | `drafting` / `review` / `needs_revision` / `approved` / `archived` |
| `image_type` | `real_product_screenshot` / `real_ui` / `structure_infographic` / `flow_diagram` / `data_chart` / `concept_diagram` / `decorative` |
| `asset_type` | `ai_weekly_script` / `short_video_script` / `wechat_article` / `github_card` / `xiaohongshu` / `sales_material` / `infographic` / `cover` |
| `asset_status` | `Draft` / `Producing` / `Review` / `Needs Revision` / `Ready to Publish` / `Published` / `Archived`（= `topic_status` 子集） |
| `brand_asset_type` | `logo` / `template` / `product_screenshot` / `background` / `cta_card` / `ui_screenshot` / `visual_reference` |
| `ai_policy` | `allow_remix` / `reference_only` / `prohibited` |
| `publication_platform` | `wechat` / `douyin` / `xiaohongshu` / `bilibili` / `wechat_video` |
| `publication_status` | `planned` / `ready` / `published` / `failed` |
| `snapshot_type` | `original` / `replay` |
| `selection_basis` | `pure_weekly_rank` / `value_filtered` / `mixed` |
| `github_snapshot_status` | `captured` / `frozen` |
| `lead_type` | `product_inquiry` / `feature_request` / `usage_issue` / `cooperation` / `industry_opinion` / `negative` / `invalid` |
| `lead_status` | `new` / `assigned` / `contacted` / `closed` |

### 2.3 约束/触发器/索引生效（P0）

| 编号 | 检查点 |
|---|---|
| DM-05 | `topics.topic_id` UNIQUE 且格式 `^[0-9]{4}W[0-9]{2}-[0-9]{3}$`；`content_week` CHECK `^[0-9]{4}W[0-9]{2}$`（如 `2026W36`）。 |
| DM-06 | 五维 + `business_relevance` CHECK 1-10；`sources.source_quality_score` CHECK 1-5；`trend_radar` 三信号（`signal_strength` / `velocity` / `novelty_score`）CHECK 1-10；`image_priority_rank` CHECK 1-7；`knowledge_derivations.round_index` CHECK 1-3。 |
| DM-07 | 唯一约束：`UNIQUE(topic_id)`、`UNIQUE(packet_id)`（`2026W36-001-SP` 格式）、`UNIQUE(batch_id)`、`UNIQUE(run_number)`、`UNIQUE(key)`（`ctas` / `ai_prompt_templates(key,version)`）、`UNIQUE(workflow_type_key, version)`、`UNIQUE(workflow_type_key)`（`workflow_types`）、`UNIQUE(cluster_key, week)`、`UNIQUE(from_topic_id, to_topic_id, relation_type)`、`UNIQUE(run_id, sequence)`、`UNIQUE(snapshot_id, rank)`、`UNIQUE(asset_id, version)`、`UNIQUE(topic_id)`（`knowledge_topic_bank`）、`UNIQUE(workflow_run_id, round_index)`、`UNIQUE(asset_key)`、`UNIQUE(source_url, source_type)`、`UNIQUE(week, snapshot_type, selection_basis)`（见 §5）。 |
| DM-08 | 触发器（负面 GWT）：`github_snapshots` 在 `status='frozen'` 后执行 UPDATE 或 DELETE → **RAISE EXCEPTION**；`publications` 由非人工通道（workflow/AI）直写 `status='published'` → **被拒绝**（见 §4）。 |
| DM-09 | 数据层业务 CHECK：`brand_assets` `CHECK (type = 'logo' → ai_policy = 'reference_only')`（Logo 禁止重绘，数据层强制）；`topic_relations` `CHECK (from_topic_id <> to_topic_id)`（防环）；`content_assets` `asset_type='wechat_article'` 时 `content_role` 必填。 |
| DM-10 | `brand_assets.is_primary_logo` 全局唯一（`PARTIAL UNIQUE WHERE is_primary_logo = true`）。 |
| DM-11 | `content_metrics` 唯一键 `UNIQUE(topic_id, asset_id, platform, metric_date, publication_id)` 生效（防重复回填）。 |
| DM-12 | **迁移可重复**：`drizzle-kit` 迁移 up/down（回滚）可重复执行；34 表建表顺序按数据模型 §6；循环引用列 `topics.source_packet_id` 建表后 `ALTER TABLE` 后补。 |

---

## 3. 人工审核闸门验收（全局硬性，继承数据模型 §2.8 / 工作流 §4）

> 覆盖：run 级 `needs_review` 吸收态、`Review` / `Needs Revision` 审核操作、`audit_log` 全量留痕、UI 显性"人工"标识、无绕过路径。

| 编号 | GWT |
|---|---|
| HR-01 | **Given** 子 workflow run 产出需审核的产物（如低候选 `low_candidate`、`review_required` 查重、Deep Dive 蓝图、涉敏感信息）；**When** 引擎完成执行；**Then** `workflow_runs.status = needs_review`（`workflow_run_status` 吸收态），且 `topics.status` 止步于 `Producing`（或对应前置态），**不自动**推进到 `Ready to Publish` / `Published`。 |
| HR-02 | **Given** `needs_review` 的 run；**When** 人工点击"审核通过"；**Then** `workflow_runs.status → completed`，可联动 `topics.status → Ready to Publish`；`audit_log` 记录 `action='review_approved'`、`actor=用户标识`、`workflow_run_id`。 |
| HR-03 | **Given** `needs_review` 的 run；**When** 人工点击"退回"；**Then** 同 run 重跑（`attempt_count + 1`，**不新建 run**，模板/输入不变）或标记 `needs_revision`；`audit_log` 记录 `action='review_rejected'` 与退回原因。 |
| HR-04 | **Given** `Review` 态内容资产；**When** 人工执行 Approve / Needs Revision / Ready to Publish；**Then** 三个动作均可从 UI 完成，且**每个动作都写 `audit_log`**（`entity_type='content_asset'` / `content_asset_version`）；UI 上审核按钮带显性"人工"标识，无"AI 代审"控件。 |
| HR-05 | **Given** 任何状态迁移（topic / run / batch / asset / publication）；**When** 检查 `audit_log`；**Then** 该迁移存在对应记录（`action='status_changed'` / `review_approved` / `review_rejected` / `published` / `budget_denied` 等），`actor` ∈ {用户标识, `ai:run-xxx`}。 |
| HR-06（负面） | **Given** 无人工操作的会话；**When** 任何 AI/工作流代码尝试把 `topics.status` 置为 `Published`、`Ready to Publish`，或把 `publications.status` 置为 `published`；**Then** 应用层守卫 + DB 触发器双重拒绝，并写 `audit_log`（`note` 记录拒绝原因）。 |

---

## 4. 不自动发布验收（V1 硬性原则，数据模型 §2.8）

| 编号 | GWT |
|---|---|
| NP-01 | **Given** 内容资产已审核通过；**When** 系统/工作流处理发布流程；**Then** `publications.status` 只能被置为 `planned` 或 `ready`，**不存在任何代码路径能写 `published`**（DB 触发器或应用层权限禁止 workflow 直写）。 |
| NP-02 | **Given** `publications.status = ready` 的记录；**When** 人工在 `/publications`（M4）执行发布；**Then** 仅人工可将其置为 `published`，并**回填 `published_date`、`published_url`、`published_by`**（三者非空，[REVIEW] 见 §11）；`audit_log` 记 `action='published'`、`actor=用户标识`。 |
| NP-03 | **Given** `topics.status = Ready to Publish`；**When** 人工确认发布；**Then** 守卫校验**必须存在 `publications` 记录**（`topic_id` 关联、`status='published'`），通过后才允许 `topics.status → Published`；无 `publications` 记录时迁移被拒绝。 |
| NP-04（负面） | **Given** 任意 workflow run 正在运行；**When** 检查其可写集合；**Then** run 的输出边界止于 `workflow_outputs` + `content_assets`（审核后）提升 + `event_pool`/`topics` 非发布态字段；**不可写** `publications.published`、`topics.status='Published'`。 |
| NP-05 | **Given** 发布记录；**When** 人工回填后复查；**Then** `published_date` / `published_url` / `published_by` 与平台实际发布情况一致（人工核对），且 `content_metrics.publication_id` 可关联到该发布（M4 数据回填）。 |

---

## 5. GitHub 快照不可变验收（数据模型 §2.4 / 工作流 §8.2）

> 三重保障：唯一约束 + frozen 触发器 + Replay 新建行；按字段域冻结。

| 编号 | GWT |
|---|---|
| GH-01 | **Given** 本周已存在 `snapshot_type='original'`、`selection_basis='pure_weekly_rank'` 的快照；**When** 再次以同周同口径创建快照；**Then** 被 `UNIQUE(week, snapshot_type, selection_basis)` **拒绝**（同口径同周只能一个快照）。 |
| GH-02 | **Given** `github_snapshots.status='frozen'` 的快照及其 items；**When** 执行 UPDATE（任何列）或 DELETE（头或明细行）；**Then** `BEFORE UPDATE / BEFORE DELETE` 触发器 **RAISE EXCEPTION**，修改/删除全部拒绝；UI 显示锁标识（IA §2.9 不可变标识），后端同样拒绝。 |
| GH-03 | **Given** 已 frozen 的 Original 快照；**When** 需要同周重生成；**Then** **只能新建** `snapshot_type='replay'` 行（`snapshot_id` 新值），`github_snapshot_items.source_item_id` 指向 Original 行，**Original 行及其 items 永不覆盖/删除**；软删除策略 = 不提供物理删除。 |
| GH-04 | **Given** frozen 快照明细；**When** 修改捕获列（`rank` / `repository` / `project_name` / `weekly_growth` / `total_stars` / `repo_url`）；**Then** 被拒绝（捕获列冻结）；修改运营列（`verification_status` / `selected` / `elimination_reason`）→ **允许**，但每次变更写 `audit_log`（核验发生在捕获之后）。 |
| GH-05 | **Given** 快照明细 `selected=true`；**When** 落 Topic；**Then** 生成/关联 `topics`（`topic_type ∈ {technical_project, trend}`，`github_snapshot_items.topic_id` 回填）；`verification_status` 复用全局枚举 `source_verification_status`（不另造）。 |
| GH-06 | **Given** `github_weekly` run 执行；**When** 检查流程步骤；**Then** 依次落 `workflow_tasks`：`snapshot_capture`（抓取 + 建快照，`selection_basis` 每次抓取显式声明）→ `fact_check` → `select` → 图文生成 → `return_writeback`；快照冻结后 run 状态按工作流 §8.2 流转。 |

---

## 6. 评分与优先级验收（数据模型 §2.5 / 工作流 §2.3）

### 6.1 加权与权重画像

| 编号 | GWT |
|---|---|
| SC-01 | **Given** 任一 `topic_type`；**When** Orchestrator 执行 `scoring` 步骤；**Then** 五维（`b2b_relevance` / `traffic_potential` / `conversion_potential` / `timeliness` / `content_value`，均 1-10）落 `topics`，且 `priority_score = Σ(wᵢ × dimᵢ)`；**权重画像从 `system_settings` 读取，不硬编码**：`scoring.weights.default`（0.20 / 0.20 / 0.25 / 0.20 / 0.15），`hot`/`trend` 型 `timeliness` 提权（如 0.35），`evergreen`/`knowledge` 型 `content_value` 提权（如 0.35），`conversion`/`product` 型 `conversion_potential` 提权（如 0.40）；画像内权重之和 = 1。 |
| SC-02 | **Given** `system_settings` 权重被修改；**When** 重新评分；**Then** 新权重立即生效且无需改代码；评分结果与手算一致（验收用例覆盖四画像各 1 例）。 |

### 6.2 分档 / 门控 / 兜底

| 编号 | GWT |
|---|---|
| SC-03 | **Given** 已计算 `priority_score`；**When** 分档；**Then** `P0 ≥ 8.0`、`P1 ≥ 6.5`、`P2 ≥ 5.0`、`P3 < 5.0`，与手算一致（验收用例覆盖四档边界值：8.0/6.5/5.0 归属高档）。 |
| SC-04 | **Given** `business_relevance < 4` 且 `topic_type` 非 `product`/`conversion`；**When** 分档完成；**Then** **封顶 P2**（即使 `priority_score ≥ 8.0` 也不得为 P0/P1）；`business_relevance` 参与门控**不参与线性加权**（独立显示，标注"门控不参与加权"）。 |
| SC-05 | **Given** `topic_type ∈ {hot, trend}` 且 `timeliness = 10`；**When** 分档完成；**Then** **兜底至少 P1**（即使 `priority_score < 6.5`）。 |
| SC-06 | **Given** 门控（SC-04）与兜底（SC-05）同时命中；**When** 定级；**Then** 裁决顺序未在基线定义（见 §11 deviations [REVIEW] 与 AC-OQ-08）；**本文档验收默认：门控优先**（结果 ∈ {P1, P2} 交集判定，推荐 `business_relevance` 门控优先，避免高分低相关性选题提级），需用户确认。 |

### 6.3 审计与配置驱动

| 编号 | GWT |
|---|---|
| SC-07 | **Given** 评分执行；**When** 检查落库；**Then** 结果落 `topics.priority`，推导依据落 `topics.score_rationale`（jsonb，含各维分值、权重、阈值判定、`business_relevance` 门控结论）；每次变更 `score_version` **递增**。 |
| SC-08 | **Given** 任意评分/定级发生；**When** 检查留痕；**Then** 以 `workflow_type='orchestrator'` 的 run 落 `workflow_runs`（含 `score` / `id_assign` 等 `workflow_tasks` 步骤），`audit_log.actor` 为 `ai:run-xxx` 或用户标识。 |

**示例验收数据**（手算核对用，权重以 `system_settings` 实际值为准）：
- `hot` 型：五维 `7/8/6/10/5`，`business_relevance=5` → 无门控；若 `timeliness` 权重 0.35、其余按画像，得分约 7.7 → 分档 P1；且 `timeliness=10` 兜底成立（≥P1）。断言：`topics.priority='P1'`。
- 门控例：任意型（非 product/conversion）五维计算得 8.6，`business_relevance=3` → 断言 `priority='P2'`（封顶）。
- 兜底例：`trend` 型计算得 6.2（<6.5），`timeliness=10` → 断言 `priority='P1'`（兜底）。

---

## 7. 状态机迁移验收

> 每一迁移 = 检查点：合法迁移可用；非法迁移被守卫函数/DB 约束拒绝并写 `audit_log`；UI 只暴露合法操作。

### 7.1 `topic_status` 全局 9 态（工作流 §7 权威迁移表）

| 迁移 | 触发者 | 验收检查点 |
|---|---|---|
| `Draft → Researching` | Orchestrator / AI | 候选提升为 Topic 或人工建 Topic 后可进入；`source_packet_id` 可空；证据包开始聚合 |
| `Researching → Ready for Production` | 人工（或 Orchestrator 自动评估） | 前置守卫：证据包核验 **≥ `verified`**；`primary_cta` **必填**（缺失被拒并提示）；五维评分 + `priority` 已定。任一不满足则迁移被拒并写 `audit_log` |
| `Ready for Production → Producing` | 人工或 Orchestrator 派发 | 路由规则已命中（`workflow_routing_rules`）、产能放行（`capacity_control`） |
| `Producing → Review` | AI（子 workflow 完成） | `workflow_runs.status = completed` 或 `needs_review`；产物已落 `workflow_outputs` |
| `Review → Needs Revision` | 人工 | 审核不通过；`audit_log` 记 `review_rejected` |
| `Needs Revision → Producing` | 人工 | 退回原因已确认；同 run 重跑（`attempt_count+1`）或新 run |
| `Review → Ready to Publish` | 人工 | 审核通过；资产状态同步为 `Ready to Publish` |
| `Ready to Publish → Published` | 人工 | **必须存在 `publications` 记录**（见 NP-03），否则拒绝 |
| `Ready to Publish → Needs Revision` | 人工 | 发布前复核不通过 |
| `Published → Archived` | 人工 | 写 `archived_at` |
| `Ready to Publish → Archived`（或任意非 Published → Archived） | 人工 | 放弃/停止推进 |

**负面抽验**：AI run 尝试 `Draft → Published` 直接迁移 → 被守卫拒绝 + `audit_log`；`Review → Published` 绕过 `Ready to Publish` → 被拒绝（9 态状态机不允许跳迁）。

### 7.2 `workflow_run_status` 5 态（工作流 §4.1）

| 迁移 | 触发者 | 验收检查点 |
|---|---|---|
| `queued → running` | Orchestrator / 调度器 | `capacity_control` 放行；写 `started_at` |
| `running → completed` | Workflow 引擎 | 全部子任务完成；写 `completed_at` + `output` 汇总 |
| `running → failed` | Workflow 引擎 | 异常/守卫拦截；`error`（jsonb）记原因；可 retry |
| `running → needs_review` | Workflow 引擎 | 产物需人工审核（`low_candidate` / `review_required` / Deep Dive 蓝图 / 涉敏感信息） |
| `needs_review → completed` | **人工** | 审核通过；可联动 `topics.status = Ready to Publish` |
| `needs_review → queued/running` | **人工** | 退回重跑：`attempt_count + 1`，不新建 run |
| `failed → queued` | **人工** | retry（重跑递增 `attempt_count`，模板/输入不变） |

**检查点**：`workflow_tasks` 步骤状态含 `skipped`（前置失败或条件不满足时跳过并记原因）；`UNIQUE(run_id, sequence)` 生效；所有迁移写 `audit_log`。

### 7.3 `batch_status` 6 态（工作流 §4.2）

`planned → dispatching → in_progress → completed`；含待审产物 → `needs_review`；异常 → `failed`。**检查点**：`planned`（Orchestrator 评分定级后生成）→ `dispatching`（「确认并开始生产」）→ `in_progress`（子 run 派发中）；同周重跑新建批次 `batch_id` 追加 `-NN`（`2026W36-AI-WEEKLY-02`），run 级重跑 `run_number` 追加 `-R01`。

### 7.4 其他状态机

| 状态机 | 验收检查点 |
|---|---|
| `deep_dive_plan_status` | `drafting → review →（needs_revision ⇄）approved → archived`；`approved` 后产出 `content_assets(wechat_article)`；蓝图 `version` 退回重做递增 |
| `knowledge_status` | 由 Evergreen 工作流推进：`uncovered → partial → basic_explanation → deep_explanation → needs_update → mature` |
| `knowledge_content_status` | `to_research → to_produce → script_done → wechat_done → graphic_done → published → high_performing → needs_remake`；**逐资产真实状态以 `content_asset_versions.status` 为准**（聚合视图不得与之矛盾） |
| `lead_status` | `new → assigned → contacted → closed`（M4 数据源，V1 仅基础列表） |

---

## 8. V1 各模块可测试验收标准（Given/When/Then）

> 模块范围对应路线图 §1.1 In Scope 9 项；M4 模块（Publications / Analytics）见 §8.10 简表。

### 8.1 Dashboard `/dashboard`（M1，D4）

| 编号 | GWT |
|---|---|
| DB-01 | **Given** demo-seed 存在当前周数据（topics / content_assets / publications / leads / content_metrics）；**When** 打开 `/dashboard`；**Then** 周概览 KPI 行显示：当前周（`content_week`）、P0 Topic 数、P1 Topic 数、待审核内容、待发布内容、已发布内容、本周 Leads、Demo 数、Consultation 数，且每项与数据库聚合一致（可用对账 SQL 复核）。 |
| DB-02 | **Given** 四个子 workflow 存在批次与 runs；**When** 打开 `/dashboard`；**Then** 四大工作流状态卡（AI 周报 / GitHub 周榜 / 常青知识 / 公众号）各显示 `workflow_batches.status` + `workflow_runs.status` 最新值；`needs_review` / `failed` 高亮进待办。 |
| DB-03 | **Given** 用户在 Dashboard；**When** 点击「生成本周内容计划」；**Then** 创建 `workflow_type='orchestrator'` 的 `workflow_runs`（`status='queued'`，`input_payload` 含 `week` 与候选引用），并写 `audit_log`（`actor=用户标识`）；该按钮**不直接触发**任何子 workflow。 |
| DB-04 | **Given** 用户在 Dashboard；**When** 点击「确认并开始生产」；**Then** 创建/推进 orchestrator run（`include_production_dispatch=true`），按路由规则派发子 run（`parent_run_id` 挂父 run）；按钮在无已批准生产计划时禁用或给出守卫提示。 |
| DB-05 | **Given** 存在 `needs_review` run、`Review` 态资产、`conflict` 证据包、`review_required` 查重项；**When** 打开 `/dashboard`；**Then** 四类待办全部出现在待办审查队列，且每项可跳转对应处理页。 |
| DB-06 | **Given** 历史数据；**When** 打开 `/dashboard`；**Then** 最近 Workflow Runs 时间线显示父子调用树最近 N 条；趋势雷达图按周聚合 `trend_radar`（`signal_strength` / `velocity` / `novelty_score`）。 |
| DB-07 | **Given** 无数据/加载中/接口错误；**When** 打开 `/dashboard`；**Then** 分别呈现 Skeleton / EmptyState（含 CTA）/ Error 卡片，禁止空白页。 |

### 8.2 Topic Center `/topics`（M1，D4）

| 编号 | GWT |
|---|---|
| TC-01 | **Given** 混合 status / priority / topic_type / content_week / history_dedupe_status 数据；**When** 逐项设置过滤栏条件 + 关键词搜索（title/topic_id 子串）；**Then** 列表正确过滤且可清空；筛选状态可清空。 |
| TC-02 | **Then**（打开即查）表格列齐全：`topic_id`、title、`topic_type` 徽标、`priority` 徽标（P0 红 / P1 橙 / P2 蓝 / P3 灰）、`status` 徽标、五维评分汇总条（b2b_relevance / traffic_potential / conversion_potential / timeliness / content_value）、`primary_cta` 标签、`content_week`、updated_at、行操作（查看详情 / 归档）。 |
| TC-03 | **Given** 选中多行；**When** 执行批量改 priority / 批量归档 / 批量派发；**Then** 目标行同步变更且每行变更写 `audit_log`（`action='status_changed'` / `updated`）。 |
| TC-04 | **Given** `event_pool` 存在候选；**When** 打开候选池 Drawer；**Then** 展示候选（`candidate_id`、title、`selection_status` ∈ `pending`/`selected`/`eliminated`，淘汰项显示 `elimination_reason`）。 |
| TC-05 | **Then**（三态）列表加载 / 空 / 错误三态完备。 |

### 8.3 Topic Detail `/topics/[id]`（M1，D5，重点页面）

| 编号 | GWT |
|---|---|
| TD-01 | **Given** 任一 Topic；**When** 打开 `/topics/[id]`；**Then** 14 区块**严格按顺序**渲染且不删节：基础信息 → 评分 → Priority → Tags → Parent → Source Topics → Lineage 可视化 → Source Packet → Workflow Runs → Content Assets → Derived Topics → Metrics → CTA → 历史记录（IA §3 硬性要求）。 |
| TD-02 | **Given** 已评分 Topic；**When** 查看评分区块；**Then** 五维条（1-10 数值+进度条）+ `business_relevance`（独立显示，标注"门控不参与加权"）+ `score_rationale` 推导展示 + `score_version`；「重新评分」操作触发 Orchestrator `score` 步骤并留痕。 |
| TD-03 | **Given** 已定级 Topic；**When** 点击 Priority 徽标；**Then** 展开显示分档依据（P0≥8.0 / P1≥6.5 / P2≥5.0 / P3<5.0 及门控/兜底结论）；徽标语义色正确（P0 红 / P1 橙 / P2 蓝 / P3 灰）。 |
| TD-04 | **Given** 血缘链（≤5 层）；**When** 打开 Lineage 可视化区块；**Then** 有向图双向展示：上游（父/源）+ 下游（衍生），`parent` 边实线、`source` 边虚线，当前 Topic 高亮；递归遍历深度 ≥3 层（V1 验收上限 5 层）。 |
| TD-05 | **Given** Topic 关联证据包；**When** 查看 Source Packet 区块；**Then** 包级头（`packet_id`、`verification_status` 五态、`source_consistency`、`conflict_fact_ids`、`verified_by`/`verified_at`）+ 明细表（`core_fact`、`key_numbers`、`number_test_conditions`、`item_verification_status`、`event_assessment`）；`source_consistency='conflict'` 时显示逐条裁决入口（写 `audit_log`）。 |
| TD-06 | **Given** Topic 有历史 runs；**When** 查看 Workflow Runs 区块；**Then** 父子调用树（`parent_run_id`）+ 每 run 的 `status` 徽标、`batch_id`、`attempt_count`、`workflow_outputs`（`output_type` + `applied`）；展开 run Drawer 看 `workflow_tasks` 步骤时间线。 |
| TD-07 | **Given** Topic 有资产与指标；**When** 查看 Content Assets 与 Metrics 区块；**Then** 资产列表（`asset_key`、`asset_type` 徽标、platform、content_role、cta、status、current_version）+ `content_metrics` 聚合（18 字段可切平台/日期）+ `conversion_funnel` 漏斗条。 |
| TD-08 | **Given** Topic 存在状态变更史；**When** 查看历史记录区块；**Then** Timeline 数据源 = `topic_status_history` 视图（`audit_log WHERE entity_type='topic' AND action='status_changed'`），逐条显示 `from_status → to_status`、`actor`（用户或 `ai:run-xxx`）、`workflow_run_id`、`created_at`。 |
| TD-09 | **Then**（字段规范）页面上所有展示字段名引用数据模型列名；`[id]` 展示 `topics.topic_id`（如 `2026W36-001`）+ title 双显。 |

### 8.4 Source Packet `/sources`（M1，D6）

| 编号 | GWT |
|---|---|
| SR-01 | **Given** 三层数据（`sources` → `source_packet_items` → `source_packets`）；**When** 打开 `/sources`；**Then** 四区块齐全：来源主档列表（`source_name`/`source_url`/`source_type`/`source_quality_score`/`event_date`/`disclosure_date`/`is_confidential`）、证据包列表/聚合、核验明细表、冲突处理面板。 |
| SR-02 | **Given** 明细核验状态已知（如 1 条 `conflict` + 若干 `verified`）；**When** 计算/刷新包级状态；**Then** 包级 `verification_status` = rollup 结果：存在 `conflict` 项 → `conflict`；存在 `needs_update` 项 → `needs_update`；全部 `verified` → `verified`；部分 → `partially_verified`；否则 `unverified`；**禁止手填与明细不一致**（应用层/DB 拒绝）。 |
| SR-03 | **Given** `key_numbers`（`[{"label","value","unit","scope","captured_at","source_url"}]`）与 `number_test_conditions`（`[{"key","operator","expected","unit","tolerance","note"}]`）；**When** 逐条执行数字测试；**Then** 每条断言可执行并更新 `item_verification_status`（`verified` / `conflict` 等），结果落 `audit_log`。 |
| SR-04 | **Given** `source_consistency='conflict'`；**When** 打开冲突处理面板逐条裁决；**Then** 裁决动作写 `audit_log`（`action='conflict_resolved'`），解决后包级状态按 rollup 规则更新；`conflict_fact_ids` 记录冲突事实项。 |
| SR-05 | **Then**（分层检查）`sources.source_quality_score`（1-5 信任分，稳定属性）与包级核验状态（易变状态）分层展示互不覆盖；核验状态不落 `sources` 层（避免污染跨 Topic 复用来源）。 |

### 8.5 Workflow Foundation `/workflows`、`/workflows/runs`（M2，D9）

| 编号 | GWT |
|---|---|
| WF-01 | **Given** 种子数据；**When** 打开 `/workflows`；**Then** 工作流类型卡片 5 类（`orchestrator` / `ai_weekly` / `github_weekly` / `evergreen_knowledge` / `wechat_deep_dive`），显示 `scheduling`、`capacity_rules`、`enabled`；模板版本表显示 version / `prompt_refs` / `step_definition` / active；路由规则表显示 4 条默认映射（hot/trend→ai_weekly；technical_project→github_weekly；knowledge/evergreen→evergreen_knowledge；scenario/product/conversion→wechat_deep_dive，全部 `overridable=true`）；批次列表显示 `batch_id` / week / status。 |
| WF-02 | **Given** mock provider；**When** 手动触发一个模板 run；**Then** `workflow_runs` 完整生命周期 `queued → running → completed`，`workflow_tasks` 按 `sequence` 顺序执行（`UNIQUE(run_id, sequence)`），`provider_class` 记录适配器类；异常路径 → `failed`（`error` 落 jsonb）。 |
| WF-03 | **Given** 产物进入 `workflow_outputs`；**When** Orchestrator `return_writeback` 消费；**Then** `applied=false → true`、写 `applied_at`；**同一产物重复消费被跳过/拒绝（幂等，只 `applied` 一次）**。 |
| WF-04 | **Given** 任意 run；**When** 打开 `/workflows/runs`；**Then** 过滤栏（`workflow_type_key` / `status` / `batch_id` / week / Topic）可用；Runs 表格含 `run_number`、`workflow_type_key`、`batch_id`、`topic_id`、`status` 徽标、`attempt_count`、`started_at`/`completed_at`；Run 详情 Drawer 显示 tasks 时间线、outputs 产物、`parent_run_id` 调用树、`error`。 |
| WF-05 | **Then**（Prompt 规范）业务页面/组件中**不存在**内联业务 Prompt；Prompt 单一来源 = `ai_prompt_templates`（`UNIQUE(key, version)`，`workflow_templates.prompt_refs` 引用），`/ai-prompts/*.md` 仅为源文件导入来源；业务代码不 `import` 模型供应商 SDK（AI 调用经 `/lib/ai/providers` 抽象）。 |
| WF-06 | **Given** 同周批次重跑；**When** 新建批次；**Then** `batch_id` 追加 `-NN` 后缀（`2026W36-AI-WEEKLY-02`）；run 重跑 `attempt_count` 递增不新建 run；`run_number` 追加 `-R01` 序号。 |

### 8.6 Knowledge Topic Bank `/knowledge`（M1，D7）

| 编号 | GWT |
|---|---|
| KB-01 | **Given** 种子知识数据；**When** 打开 `/knowledge`；**Then** 知识网格/表格展示：`concept`、`category`（`ai_technology` / `ai_product` / `methodology` / `industry_practice` / `tool_tutorial`）、`knowledge_status` 6 态徽标、`content_status` 8 态徽标、`b2b_relevance`、`user_learning_cost`（low/medium/high）、`long_term_value`、`current_heat`（cold/warming/hot/cooling）、`next_action`。 |
| KB-02 | **Given** 概念三向关系；**When** 打开概念图；**Then** `upstream_concepts` / `related_concepts` / `downstream_concepts`（或 `knowledge_concept_edges`）可视化正确；概念图与 Topic 血缘图互不写入（两套独立边）。 |
| KB-03 | **Given** 某 run 的 `knowledge_derivations`；**When** 查看衍生预算指示；**Then** 预算条显示 `round_index ∈ 1..3`（一次一主 + 最多 3 衍生）。 |
| KB-04 | **Given** 选中概念；**When** 点击开采操作；**Then** 触发 `evergreen_knowledge` run（`workflow_runs` 留痕，`input_payload` 含 `concept_id`/`main_topic_id`），`knowledge_topic_bank.next_action` 参与 Orchestrator 路由。 |
| KB-05（负面） | **Given** 某 run 已产生 3 个衍生 Topic；**When** 尝试新增第 4 个；**Then** 数据库 `UNIQUE(workflow_run_id, round_index)` + 应用层守卫 `checkDerivedTopicBudget` 双重拦截，`audit_log` 记 `action='budget_denied'`；每 run 恰 1 个 `main_topic_id`，衍生 `parent_topic_id = main_topic_id`。 |

### 8.7 GitHub Snapshot `/github-weekly`（M1，D7；不可变契约见 §5）

| 编号 | GWT |
|---|---|
| GB-01 | **Given** 快照数据；**When** 打开 `/github-weekly`；**Then** 周选择器 + 快照列表（`snapshot_id` / `snapshot_type` / week / `selection_basis` / `status` `captured`/`frozen`）+ 榜单表格（`rank` / `repository` / `project_name` / `weekly_growth` / `total_stars` / `repo_url` / `verification_status` / `selected` / `elimination_reason`）。 |
| GB-02 | **Given** `status='frozen'` 快照；**When** 在 UI 尝试修改/删除；**Then** UI 锁标识 + 后端拒绝（对应 §5 GH-02）；Replay 以新建行呈现且标注 `source_item_id` 血缘。 |
| GB-03 | **Given** 明细 `selected=true`；**When** 落 Topic；**Then** 关联 `topics.id`（`topic_type='technical_project'` / `'trend'`），可从 Topic 反查快照。 |
| GB-04 | **Then**（操作区）「抓取本周」（Original）、「Replay 重生成」、标记 selected / 淘汰原因（`elimination_reason`）均可用且落 `audit_log`。 |

### 8.8 Content Asset 基础管理 `/content`、`/content/[id]`（M1，D8）

| 编号 | GWT |
|---|---|
| CA-01 | **Given** 资产数据；**When** 打开 `/content`；**Then** 过滤栏（`asset_type` / `platform` / `status` / `content_role` / 所属 Topic）可用；资产表格含 `asset_key`（`{topic_id}:{asset_type}:{platform}` 唯一）、title、`asset_type` 徽标、platform、`content_role`、cta、`status`、`current_version_id`、updated_at；待审核队列（`Review` / `Needs Revision`）集中展示；批量操作（导出/改平台/归档）可用。 |
| CA-02 | **Given** 资产有多个版本；**When** 打开 `/content/[id]`；**Then** 版本历史 Timeline 全保留（version / status / `created_by_run_id` / `is_current`），支持回滚/对比；`is_current` 切换正确；每次 AI 重生成产生新版本（历史不做覆盖删除）。 |
| CA-03 | **Given** 待审核资产；**When** 执行 Approve / Needs Revision / Ready to Publish；**Then** 三个审核动作可用且**全部写 `audit_log`**；UI 显性"人工"标识；无"AI 代审"或一键直发按钮（对应 §3 HR-04）。 |
| CA-04（守卫） | **Given** `topics.status` 将进入 `Ready for Production`；**When** 守卫校验；**Then** `primary_cta` 必填（缺失被拒并提示，对应数据模型 §2.6）；`asset_type='wechat_article'` 时 `content_role` 必填（DB CHECK）。 |
| CA-05 | **Given** AI 原始产出；**When** 检查两表边界；**Then** 原始产出一律在 `workflow_outputs`；**未经人工审核通过不得出现于 `content_assets`**（`workflow_outputs.asset_id` 回填仅发生在审核后提升时）。 |
| CA-06 | **Then**（CTA 面板）`content_assets.cta` 默认继承 `topics.primary_cta`，允许资产级覆盖（改文案不改动作），每资产仅一个主 CTA（单值 FK）。 |

### 8.9 Human Review Gate（跨模块，M1 基础 / M3 贯通）

| 编号 | GWT |
|---|---|
| HG-01 | **Given** 任一产出（脚本/蓝图/资产/run 结果）待审；**When** 走完"生产 → 审核"路径；**Then** 必经 `needs_review`（run 级）或 `Review`（Topic/资产级）闸门；产出状态 `queued`→`running`→（`completed`/`needs_review`）与 `Producing → Review` 严格匹配工作流 §4 / §7。 |
| HG-02 | **Given** 审核操作；**When** 执行通过/退回/发布前复核；**Then** 全部写 `audit_log`（`review_approved` / `review_rejected` / `status_changed` / `published`），`actor` 可追溯到具体用户标识。 |
| HG-03（负面） | **Given** 自动化代码；**When** 枚举全部写路径；**Then** 不存在绕过 `audit_log` 的状态变更路径；不存在由 AI 直接触发的 `published` 路径（对应 §4 NP-04）。 |

### 8.10 M4 预留模块简表（非 MVP 首发，验收后置）

| 模块 | GWT 要点（M4 验收时细化） |
|---|---|
| Publications `/publications` | 发布列表（topic_id / asset_id / platform / scheduled_date / published_date / published_url / status）；`planned`/`ready` 编排由工作流/系统生成；`published` 仅人工 + 回填三字段（§4 NP-02）；待发布队列 = `ready` 态集中处理 |
| Analytics `/analytics` | KPI 概览（impressions / views / reads / cta_clicks / demo_requests / sales_leads / deals / revenue 等聚合）；Conversion Funnel 视图 `conversion_funnel`：`Read=reads` → `CTA Click=cta_clicks` → `Lead=registrations + dm_count` → `Registration=registrations` → `Demo=demo_requests` → `Sales Lead=sales_leads` → `Deal=deals` → `Revenue=revenue`；`content_metrics` 18 字段全量可用且强制绑定 `topic_id`；Leads 池（`lead_type` / `lead_urgency` / `lead_status`，`suggested_reply` 仅建议不自动回复） |

---

## 9. 里程碑退出标准与端到端验收场景

### 9.1 里程碑退出标准（路线图 §6）

| 里程碑 | 退出标准（验收要点） |
|---|---|
| MS-1（M1 结束） | 全部基础页面（Dashboard / Topics / Topic Detail / Sources / Knowledge / GitHub Weekly / Content）用真实数据渲染；Topic Detail 14 区块顺序合规（TD-01）；人工审核基础操作可用且全部落 `audit_log`（HG-01/02） |
| MS-2（M2 结束） | mock provider 跑通 run 全生命周期（WF-02）；`needs_review` 门禁路径（HR-01/02/03）与 `applied` 幂等（WF-03）验证通过；Runs 页可审计（WF-04） |
| MS-3（**M3 结束 = MVP Exit**） | 端到端最小闭环可演示（§9.2 场景）；无自动发布路径（§4 全项）；`event_pool → topics` 提升链路正确（§9.2 场景 B 断言） |
| MS-4（M4 结束） | 人工发布闭环（`planned`/`ready` + 人工回填 `published`）与指标录入/漏斗视图可用（§8.10） |
| MS-5（M5 结束） | 完整周循环闭环演示：发布 → 数据回填 → 下一周选题可见数据反馈 |

**硬性 Exit 约束（任一违反即整体不通过）**：
1. 不存在绕过人工审核的发布路径（`publications.status='published'` 仅人工触发）。
2. 所有评分、定级、查重、聚类、CTA 判断、路由、状态迁移均有 `workflow_runs` 留痕。
3. 数据模型 34 表全量落库，需求字段零删减。

### 9.2 端到端场景（MVP Exit 演示，D10 贯通后执行）

**场景 A：生成本周内容计划（Orchestrator 第 1-6 步）**

- **Given** 本周 `event_pool` 存在候选（含与既有 Topic 重复的候选、可聚类候选）；
- **When** 用户在 Dashboard 点击「生成本周内容计划」；
- **Then**
  1. 创建 `workflow_type='orchestrator'` run，按序执行 `candidate_reception → history_dedupe → topic_clustering → topic_id_assignment → scoring → priority_assignment`，每步落 `workflow_tasks`；
  2. 候选 `history_dedupe_status` 更新为 `unique` / `clustered` / `duplicate` / `merged` / `review_required`；`review_required` 项进待办；
  3. 聚类归并到 `topic_clusters`（`canonical_topic_id`）；
  4. 入选候选分配 `topic_id`（`2026W36-001` 起，正则 `^[0-9]{4}W[0-9]{2}-[0-9]{3}$`，目标内容周 = `content_week`）；
  5. 五维评分 + `priority` 落库，`score_rationale` 含推导依据，`score_version=1`；
  6. 产出 `production_plan` 到 `workflow_outputs`，生成 `workflow_batches`（`status='planned'`）；
  7. 全部动作写 `audit_log`；**不派发**任何子 workflow（`include_production_dispatch=false`）。

**场景 B：确认并开始生产 → AI Weekly → 人工审核 → Ready to Publish**

- **Given** 场景 A 已生成周计划（批次 `planned`），Topic 均已人工审核；
- **When** 用户在 Dashboard 点击「确认并开始生产」；
- **Then**
  1. Orchestrator run 执行第 7-12 步：`workflow_routing`（`hot`/`trend` → `ai_weekly`）→ `capacity_control`（批次 → `dispatching`）→ `cta_assignment`（`primary_cta` 必填校验）→ 派发 `ai_weekly` 子 run（`parent_run_id` 挂父 run）；
  2. 子 run 执行 `fact_check → score → select → script_generate → outline_generate → trend_radar → secondary_candidates → return_writeback`；`select` 入选 **5-8 条**，`selection_status` 更新 `selected`/`eliminated`（`elimination_reason` 记录淘汰原因）；
  3. 入选事件提升为 `topics`（`topic_type='hot'`/`'trend'`，`event_pool.derived_topic_id` 回填）；
  4. 口播脚本产出（90 秒中文）进 `workflow_outputs`（`output_type='content_asset'`，`applied=false`），**未经人工审核不出现于 `content_assets`**；
  5. `topics.status` 沿状态机推进至 `Review`；
  6. 人工在审核队列 Approve → 脚本提升为 `content_assets`（`asset_type='ai_weekly_script'`）→ `topics.status = Ready to Publish`；
  7. 全程 `audit_log` 可回溯；**全流程不存在自动写 `published` 的路径**。

**场景 C：不足 5 条（低候选）**

- **Given** 本周通过事实核验的事件仅 3 条；
- **When** `ai_weekly` 的 `select` 步骤执行；
- **Then** 按实际通过数 3 条入选并生成内容；批次标注 `low_candidate` 提示人工；run 进入 `needs_review` 等待人工确认（不自动放行）。

---

## 10. D1-D10 任务验收点

> 每任务验收点 = 路线图 §3 各任务「验收标准」的可执行化。验收顺序遵循依赖图（D1→D2→D3→…），P0 项不满足则该任务不通过。

### D1 项目脚手架与设计系统基线落地（M0，5 人日，P0）

- [ ] 14 条路由全部可访问且无报错：`/dashboard` `/topics` `/topics/[id]` `/workflows` `/workflows/runs` `/content` `/content/[id]` `/knowledge` `/github-weekly` `/sources` `/assets` `/publications` `/analytics` `/settings`（占位页）。
- [ ] 设计 token 值与 IA §4 一致（抽验：`--color-bg=#FFFFFF`、`--color-primary=#2563EB`、`--color-danger=#DC2626`、`--text-base=14/22`、`--space-4=16`、`--radius-md=6`）。
- [ ] Priority 徽标语义色正确：P0 红 `#DC2626` / P1 橙 `#EA580C` / P2 蓝 `#2563EB` / P3 灰 `#64748B`。
- [ ] 三层 AppShell：Sidebar 240px（可折叠 64px）、Topbar 56px、Content 区；⌘K Command Menu 可唤起。
- [ ] CI 绿：lint / typecheck / build 通过（`npm run build` 必绿）。
- [ ] 三态约定（Skeleton / EmptyState / Error）在占位页生效，无空白页。

### D2 数据库 Schema 全量迁移与种子数据（M0，6 人日，P0）

- [ ] 迁移 up/down 可重复执行（含回滚）；34 表按数据模型 §6 顺序落库；`topics.source_packet_id` 后补。
- [ ] 34 表全量存在，需求字段零删减（对照 DM-02 全表核查）。
- [ ] 枚举约束生效：写入清单外枚举值被拒绝（抽验 §2.2 全表，至少每域 1 例）。
- [ ] 触发器生效（负面验证）：frozen 快照 UPDATE/DELETE → 异常；`publications` 非人工写 `published` → 拒绝。
- [ ] 唯一/CHECK 约束生效（DM-05 至 DM-11 抽验清单）。
- [ ] 种子数据可查询：`ctas` 6 key、`workflow_types` 5 行、`workflow_templates` v1、`ai_prompt_templates` 初版、`system_settings` 评分权重、`image_type_priorities` 7 行、`workflow_routing_rules` 4 条默认映射。

### D3 Topic 域服务：业务 ID、血缘与审计（M1，5 人日，P0）

- [ ] `topic_id` 生成器单测：格式正则 `^[0-9]{4}W[0-9]{2}-[0-9]{3}$`；目标内容周语义（`2026-12-28` → `content_week='2027W01'` 跨 ISO 年不漂移）；周内序号递增、删除不回收；同批 `Topic_ID_List` 即本周分配 ID 集合。
- [ ] `lineage service`：同事务写 `topics.parent_topic_id` + `source_topic_ids` + `topic_relations`；读取走 `WITH RECURSIVE` 双向正确（深度 3-5 层）；新增父/源指向自身被拒（祖先路径含自身即拒绝）。
- [ ] `audit_log` 服务：所有状态迁移写 `audit_log`（含 `from_status`/`to_status`/`actor`）。
- [ ] `score_rationale`（jsonb）写服务可用且结构含各维分值/权重/阈值判定/门控结论。

### D4 Dashboard 与 Topic 列表页（M1，6 人日，P1）

- [ ] `/dashboard` 六区块全量渲染（§8.1 DB-01 至 DB-06）。
- [ ] 「生成本周内容计划」点击后创建 `workflow_type='orchestrator'`、`status='queued'` 的 run 并留痕（DB-03）。
- [ ] `/topics` 过滤/排序/批量操作生效（TC-01/TC-03）；五维评分汇总条正确。
- [ ] 候选池 Drawer 展示 `event_pool`（`selection_status`）且淘汰项显示 `elimination_reason`（TC-04）。
- [ ] 三态完备（DB-07 / TC-05）。

### D5 Topic Detail 页（14 区块）（M1，8 人日，P1）

- [ ] 14 区块顺序与 IA §3 完全一致且不删节（TD-01）。
- [ ] 评分区块：五维条 + `business_relevance` 门控标注 + `score_rationale` + `score_version`（TD-02）。
- [ ] Priority 徽标语义色 + 分档依据展开（TD-03）。
- [ ] LineageGraph 双向 3-5 层（parent 实线 / source 虚线）（TD-04）。
- [ ] Source Packet 区块：包级 + 明细 + 冲突裁决入口（TD-05）。
- [ ] Workflow Runs 区块：父子调用树 + outputs（TD-06）；Metrics 区块：`conversion_funnel` 聚合（TD-07）。
- [ ] 历史记录 Timeline 数据源 = `topic_status_history` 视图（TD-08）。
- [ ] 展示字段名引用数据模型列名（TD-09）。

### D6 Source Packet 三层管理与核验中心（M1，5 人日，P1）

- [ ] rollup 规则单测通过（conflict > needs_update > verified > partially_verified > unverified；禁止手填与明细不一致）。
- [ ] `key_numbers` / `number_test_conditions` 展示与逐条执行入口可用（SR-03）。
- [ ] `source_consistency='conflict'` 时 UI 展开逐条裁决并写 `audit_log`（SR-04）。
- [ ] 核验记录进 `audit_log`；`sources.source_quality_score` 与包级核验状态分层不混用（SR-05）。

### D7 Knowledge Topic Bank 与 GitHub Snapshot 页（M1，6 人日，P1）

- [ ] `/knowledge`：knowledge_status / content_status 徽标正确；概念图三向；衍生预算条（KB-01/02/03）。
- [ ] 开采操作触发 `evergreen_knowledge` run 留痕（KB-04）。
- [ ] `checkDerivedTopicBudget` 拦截第 4 个衍生并记 `audit_log`（`budget_denied`）（KB-05）。
- [ ] `/github-weekly`：frozen 快照 UI 锁标识且后端拒绝修改/删除（GB-02 / §5 GH-02）。
- [ ] Replay 新建行不覆盖 Original（§5 GH-03）；`selected=true` 落 Topic（GB-03）。

### D8 Content Asset 基础管理与人工审核闸门（M1，6 人日，P1）

- [ ] `content_assets`（`asset_key` 唯一）+ `content_asset_versions`（版本全保留、`is_current` 切换、`created_by_run_id` 审计）CRUD（CA-02）。
- [ ] `/content` 列表（过滤栏/待审核队列/批量操作）与 `/content/[id]`（编辑/预览/版本 Timeline/CTA 面板/发布状态/审核操作）（CA-01）。
- [ ] Approve / Needs Revision / Ready to Publish 均写 `audit_log` 且 UI 显性"人工"标识；无绕过路径（CA-03 / HG-03）。
- [ ] `primary_cta` 在 `Ready for Production` 前必填守卫生效（CA-04）。
- [ ] 产物边界：未经审核不提升 `content_assets`（CA-05）。

### D9 Workflow 引擎核心与 AI 抽象层（M2，8 人日，P1）

- [ ] mock provider 跑通一个模板 run：`queued → running → completed` 全生命周期；`failed` 路径 `error` 落库；`needs_review` 路径可进入（WF-02）。
- [ ] `needs_review → completed` 人工通过路径可用；退回重跑 `attempt_count+1` 不新建 run（HR-02/03）。
- [ ] 批次状态机 `planned → dispatching → in_progress → completed/needs_review/failed`；同周重跑批次 `-NN` 后缀（§7.3）。
- [ ] 同一产物仅 `applied` 一次（幂等）（WF-03）。
- [ ] 子 run `parent_run_id` 调用树正确；`workflow_tasks` 含 `skipped` 态。
- [ ] AI 抽象三层落地：`/lib/ai/providers` 统一 `call()`（`AIRequest` / `AIResponse`，含 mock provider）+ `/lib/ai/orchestrator` + `/lib/ai/workflows` 目录与类型契约；业务代码无供应商 SDK 直接引用（WF-05）。
- [ ] `ai_prompt_templates` 读取链路可用；`/workflows` 与 `/workflows/runs` 页（Run 详情 Drawer）可用（WF-04）。
- [ ] 审计全覆盖：所有 run/批次/步骤迁移写 `audit_log`。

### D10 Orchestrator 流水线与 AI Weekly 端到端贯通（M3，10 人日，P0 = MVP Exit）

- [ ] Dashboard 两 CTA 端到端可用（§9.2 场景 A/B 全断言通过）。
- [ ] Orchestrator 流水线 12 步实现且每步落 `workflow_tasks`、关键裁决落 `workflow_outputs`（`production_plan` / `selected_events` / `trend_report` / `secondary_candidates` 等）。
- [ ] `event_pool` 候选 → 查重聚类 → 提升 `topics`（`derived_topic_id` 回填）链路正确。
- [ ] `ai_weekly` 步骤序列完整：`fact_check → score → select（5-8 条）→ script_generate（90 秒中文口播）→ outline_generate → trend_radar → secondary_candidates → return_writeback`。
- [ ] 事件必达字段落 `event_pool`：`published_at`、来源、`industry_impact`、`user_perception`、`tech_change`、`application_value`、`propagation_potential`、`selection_status`、`elimination_reason`；五维评估以 `event_assessment` jsonb 挂 `source_packet_items`；入池过滤键 = `event_date`（非 `created_at`）。
- [ ] 统计口径正确：`workflow_batches.week_start` / `week_end` = 上一完整自然周（周一 00:00 – 周日 23:59）。
- [ ] 产能：`weekly_quota` 5-8 条；不足 5 条 → 按实际通过数 + 批次标 `low_candidate` → run `needs_review`（场景 C）。
- [ ] 口播脚本产出进 `workflow_outputs`；**人工审核通过后**提升 `content_assets`（`asset_type='ai_weekly_script'`）。
- [ ] 所有迁移写 `audit_log`；**无自动发布路径**（§4 全项负面验证通过）。
- [ ] Prompt 模板全部落 `ai_prompt_templates`（`/lib/ai/workflows/ai-weekly.ts` 无内联 Prompt）。

---

## 11. Open Questions（本文档悬而未决）

> 编号 `AC-OQ-xx`；定案后更新对应验收点。与基线 OQ-xx 的依赖关系已标注。

| 编号 | 问题 | 影响验收点 | 建议/依赖 |
|---|---|---|---|
| AC-OQ-01 | 验收执行方式与工具链：GWT 用例以**人工 checklist** 执行即可，还是要求自动化（单测 + Playwright E2E）并设定覆盖率目标？基线未定义测试工具链与覆盖口径 | 全部 GWT、D3/D6/D9 单测要求 | 推荐：关键域服务（ID 生成/血缘/rollup/评分）强制单测；端到端 MVP 场景人工演示 + 冒烟自动化；覆盖率为 P2 级 |
| AC-OQ-02 | 验收数据：是否提供 `demo-seed`（模拟两周 topics / 一个 frozen 快照 / 若干 event_pool 候选，可一键清空）？无数据时"真实数据渲染"验收如何判空态与数据错误 | D4、D5、D7、§9 场景 | 依赖 OQ-10；推荐提供 demo-seed，空态用 EmptyState 断言 |
| AC-OQ-03 | 验收环境：本地 `docker postgres` 还是云端 Supabase？`npm run build` 与迁移在哪个环境验收？ | D1、D2 起全部 | 依赖 OQ-05；推荐本地可迁移 + CI build 双环境 |
| AC-OQ-04 | Provider 定案前 D10 是否以 mock provider 验收？真实 Provider 接入后 D10 是否需要回归验收？ | D9、D10 | 依赖 OQ-01；推荐 D10 前确认真实 Provider 与 key，接入后回归场景 B |
| AC-OQ-05 | 候选事件入池方式未定：`event_pool` 入池验收以**手动录入**为准还是半自动导入？ | D4、D10 | 依赖 OQ-02 |
| AC-OQ-06 | GitHub Trending 抓取源未定：`snapshot_capture` 验收以**人工粘贴/导入**为准？ | D7、D10 | 依赖 OQ-03 |
| AC-OQ-07 | 定时调度启用时机：M3 验收确认以**手动触发**为准？`scheduling='weekly'` 定时验收放 M5？ | D10、MS-3 | 依赖 OQ-06 |
| AC-OQ-08 | 评分门控冲突裁决：`business_relevance<4`（封顶 P2）与 `timeliness=10`（兜底 P1）**同时命中**时的裁决顺序基线未定义（见 deviations [REVIEW]） | SC-06 | 推荐门控优先（结果 ∈ {P1, P2} 按交集判定），需用户确认 |
| AC-OQ-09 | 单源事实的 `verified` 判定标准：包级 `verified` 需要全部明细 `verified`，但"单来源核心事实如何算核验通过"（交叉来源数量下限）基线未定义（见 deviations [REVIEW]） | HR-01、SR-02、场景 B | 推荐：无 `conflict`/`needs_update` 且核验动作完成即计 `verified`，单一来源事实标注单源提示 |
| AC-OQ-10 | 发布回填必填性：`published` 时 `published_date` / `published_url` / `published_by` 三者是否强制非空（基线列可空但语义要求"回填"）？（见 deviations [REVIEW]） | NP-02 | 推荐三者必填，`published_url` 允许发布后补录需人工确认 |
| AC-OQ-11 | 内容语言确认后：90 秒中文口播验收是否校验"中文生成 + 时长约 90 秒"？ | D10、场景 B | 依赖 OQ-07；推荐中文为硬性断言，时长为提示性断言 |

---

## 附录 A：验收引用速查（标识符 → 中文）

| 标识符 | 中文 | 关键验收位置 |
|---|---|---|
| `workflow_run_status` | run 状态 | §3 HR-01/02/03、§7.2 |
| `topic_status` | Topic 全局 9 态 | §7.1 |
| `batch_status` | 批次状态 | §7.3 |
| `deep_dive_plan_status` | 蓝图审核状态 | §7.4 |
| `source_verification_status` | 核验五态 | §2.2、SR-02 |
| `selection_basis` | 榜单口径 | §5 GH-06 |
| `github_snapshot_status` | 快照状态（frozen 冻结） | §5 GH-02 |
| `knowledge_derivations` | 衍生预算记账 | KB-05 |
| `conversion_funnel` | 转化漏斗视图 | §8.10 |
| `audit_log` | 审计日志（统一落点） | §3 HR-05、HG-02 |
