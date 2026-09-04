# 权威信息架构与设计系统基线（Canonical IA & Design System）

> **状态**：本文件是**信息架构（导航树/页面职责/区块顺序）与设计系统（token/组件/骨架）的唯一事实源（Single Source of Truth）**。
> 后续 13 份正式文档（00-product-vision … 12-roadmap）、页面设计稿、前端组件契约、页面数据契约均引用本文件。
> **字段命名/类型/枚举取值的唯一裁决依据** = `docs/_canonical-data-model.md`。本文件**只负责结构（页面/区块/导航/视觉 token）**，凡涉及数据字段一律以数据模型基线为准并在此引用，**不重复定义、不删减需求字段**。
> **原则**：需求明文中 14 个路由、Topic Detail 的 14 个区块、UI 风格的 6 类组件**一律保留**；允许"追加建议"（标注 🔸），不允许"删减"。
> **技术基线**：Next.js App Router、TypeScript strict、Tailwind CSS、shadcn/ui（Radix 原语 + Tailwind token）、PostgreSQL（Supabase）。路由即文件系统目录。

---

## 0. 引用与命名约定

- 路由一律小写 `kebab-case`，与 App Router 目录一一对应（`/topics/[id]` = `app/topics/[id]/page.tsx`）。
- 组件命名 `PascalCase`（`TopicDetailHeader`、`PriorityBadge`、`LineageGraph`）；token 命名 `--color-*` / `--space-*` / `--radius-*` / `--shadow-*`（CSS 变量，供 Tailwind `theme.extend` 映射）。
- 页面内展示的字段名一律引用数据模型表的列名（如 `topics.topic_id`、`source_packets.verification_status`），展示形态由本文件定义。
- 枚举展示用中文标签 + 英文 value 双显，value 以数据模型 `§1 全局枚举` 为准。
- 本文件与 `_canonical-data-model.md` 冲突时，以数据模型基线裁决；需求原文与本文件冲突时，按"设计决策清单"处理（本文件为正式落地形态）。

---

## 1. 导航架构总览

### 1.1 全局导航模型（AppShell）

三层骨架，全站一致：

| 区域 | 宽度/高度 | 内容 |
|---|---|---|
| Sidebar（左侧导航） | 桌面 240px，可折叠为 64px 图标栏；移动端折叠为 Drawer | 品牌区、L1 主导航树、底部当前周/用户区 |
| Topbar（顶部栏） | 56px | 面包屑（L1 / L2 / [id]）、全局 Command Menu 触发（⌘K）、当前内容周选择器、审核待办铃铛、用户菜单 |
| Content（内容区） | 剩余视口，垂直滚动 | 页面级骨架（见 §4.4 通用页面骨架） |

导航分组（Sidebar 内）：
- **总览**：Dashboard `/dashboard`
- **生产**：Topics `/topics`、Knowledge `/knowledge`、GitHub Weekly `/github-weekly`、Workflows `/workflows`、Content `/content`、Sources `/sources`、Assets `/assets`、Publications `/publications`
- **数据**：Analytics `/analytics`
- **系统**：Settings `/settings`

### 1.2 导航树（14 条路由，需求十四全量保留）

```
/dashboard                          L1  Dashboard 总控台
/topics                             L1  Topic 选题中心
/topics/[id]                        L2  Topic 详情（[id] = topics.topic_id 或 uuid）
/workflows                          L1  工作流引擎概览
/workflows/runs                     L2  工作流执行记录
/content                            L1  内容资产中心
/content/[id]                       L2  内容资产详情（[id] = content_assets.id）
/knowledge                          L1  常青知识 Topic Bank
/github-weekly                      L1  GitHub 周报快照
/sources                            L1  来源与核验中心
/assets                             L1  品牌素材库
/publications                       L1  发布中心
/analytics                          L1  数据分析
/settings                           L1  系统设置
```

### 1.3 层级规则

- **L1 主入口**：14 条路由中的 11 个顶级页（无动态段），均为 Sidebar 直达。
- **L2 子页**：`/topics/[id]`、`/workflows/runs`、`/content/[id]` 为 L1 的二级路由。
- **L3 派生详情（🔸 追加建议，不新增路由）**：`/workflows/runs/[id]`、`/sources/[id]` 在 V1 用 **Drawer** 承载，不建立独立路由，保持 14 路由不变。
- **详情页标题/面包屑**：`[id]` 展示 `topics.topic_id`（如 `2026W36-001`）+ `topics.title` 双显，避免纯 uuid 无意义。

---

## 2. 页面职责与主要区块（14 页）

> 每页"一句话职责 + 主要区块"。区块引用的数据表/字段以 `_canonical-data-model.md` 为源。各页共用工具：⌘K 全局检索（Topic/批次/资产）、右上当前周选择器。

### 2.1 Dashboard `/dashboard` — 内容总控台（Orchestrator 控制面）

**职责**：每周内容运营的单屏总览，承担 Orchestrator 的人工触发入口（生成本周内容计划 / 确认并开始生产）。

**主要区块**：
1. **周概览 KPI 行**：当前周（`content_week`）、P0 Topic 数、P1 Topic 数、待审核内容、待发布内容、已发布内容、本周 Leads、Demo 数、Consultation 数（数据源：`topics` / `content_assets` / `publications` / `leads` / `content_metrics`）。
2. **四大工作流状态卡**：AI 周报状态、GitHub 周榜状态、常青知识状态、公众号状态（`workflow_batches.status` + `workflow_runs.status`）。
3. **核心 CTA 区**：`生成本周内容计划`（Orchestrator `production_plan` 产物）、`确认并开始生产`（子 workflow 派发）。均为人工触发，落 `workflow_runs` 留痕。
4. **待办审查队列**：`needs_review` 的 run、`Review` 态资产、`conflict` 证据包、`review_required` 查重项。
5. **最近 Workflow Runs 时间线**：`workflow_runs` 父子调用树最近 N 条。
6. **趋势雷达图**：`trend_radar`（signal_strength / velocity / novelty_score）按周聚合。

### 2.2 Topics `/topics` — 选题中心

**职责**：Topic 的列表、筛选、排序、批量操作与候选导入入口（Orchestrator 选题结果的浏览面）。

**主要区块**：
1. **过滤栏**：`status`、`priority`、`topic_type`、`content_week`、`history_dedupe_status`、关键词搜索（title/topic_id）。
2. **Topic 表格**：`topics.topic_id`、title、`topic_type` 徽标、`priority` 徽标（P0/P1/P2/P3）、`status` 徽标、五维评分汇总条（b2b_relevance/traffic_potential/conversion_potential/timeliness/content_value）、`primary_cta` 标签、`content_week`、updated_at、行操作（查看详情/归档）。
3. **批量操作栏**：批量改 priority、批量归档、批量派发。
4. **候选入口**：🔸 打开事件候选池（`event_pool`）Drawer，展示 `selection_status`。
5. **空态/加载态**：骨架屏 + 空态 CTA（新建 Topic / 生成内容计划）。

### 2.3 Topics Detail `/topics/[id]` — Topic 详情（重点页面）

**职责**：Topic 全生命周期的单页工作台——从来源核验到衍生资产与指标回填的完整事实面。

**完整区块顺序（严格按序，14 区块，详见 §3）**：
基础信息 → 评分 → Priority → Tags → Parent → Source Topics → Lineage 可视化 → Source Packet → Workflow Runs → Content Assets → Derived Topics → Metrics → CTA → 历史记录。

### 2.4 Workflows `/workflows` — 工作流引擎概览

**职责**：工作流注册表、模板、路由规则与批次生命周期的配置与管理面。

**主要区块**：
1. **工作流类型卡片**：`workflow_types` 5 类（`orchestrator` / `ai_weekly` / `github_weekly` / `evergreen_knowledge` / `wechat_deep_dive`），展示 `scheduling`、`capacity_rules`、`enabled`。
2. **模板版本表**：`workflow_templates`（version、`prompt_refs`、`step_definition`、active）。
3. **路由规则表**：`workflow_routing_rules`（match_field / match_value → workflow_type_key，可覆盖开关）。
4. **批次列表**：`workflow_batches`（batch_id、week、status、topic_ids 摘要）。
5. **操作区**：新建/重跑批次（生成 `2026W36-AI-WEEKLY`，重跑加 `-02` 后缀）。

### 2.5 Workflows Runs `/workflows/runs` — 工作流执行记录

**职责**：全部 `workflow_runs` 的执行留痕与状态追踪（硬性原则 5 的可视化落点）。

**主要区块**：
1. **过滤栏**：`workflow_type_key`、`status`、`batch_id`、`week`、Topic。
2. **Runs 表格**：`run_number`、`workflow_type_key`、`batch_id`、`topic_id`、`status` 徽标、`attempt_count`、`started_at` / `completed_at`、错误摘要。
3. **Run 详情 Drawer**：`workflow_tasks` 步骤时间线（sequence/status/error）、`workflow_outputs` 产物（`output_type` + `content` + `applied`）、`parent_run_id` 调用树、`error`。
4. **审查队列**：`needs_review` 批次集中处理（通过→`completed` / 退回→同 run 重跑）。

### 2.6 Content `/content` — 内容资产中心

**职责**：`content_assets` 逻辑资产及其版本的管理入口（与 Topic 严格分离展示）。

**主要区块**：
1. **过滤栏**：`asset_type`、`platform`、`status`、`content_role`、所属 Topic。
2. **资产表格**：`asset_key`、title、`asset_type` 徽标、`platform`、`content_role`、`cta`、`status`、`current_version_id`、updated_at。
3. **待审核队列**：`Review` / `Needs Revision` 态资产集中处理。
4. **批量操作**：导出、改平台、归档。

### 2.7 Content Detail `/content/[id]` — 内容资产详情

**职责**：单个资产的编辑、版本管理与审核工作台。

**主要区块**：
1. **资产信息头**：`asset_key`、title、`asset_type`、`platform`、`content_role`（wechat_article 必填）、`status`、当前 `version`。
2. **内容编辑/预览**：`content_asset_versions.content` 编辑区 + 移动端预览切换。
3. **版本历史 Timeline**：`content_asset_versions`（version、status、created_by_run_id、is_current）全保留，可回滚/对比。
4. **关联 Topic**：`content_assets.topic_id` 跳转 `/topics/[id]`。
5. **CTA 面板**：`cta`（默认继承 topic.primary_cta，单值覆盖）。
6. **发布状态**：关联 `publications`（platform、status、published_url）。
7. **审核操作**：Approve / Needs Revision / Ready to Publish（人工门禁，落 `audit_log`）。
8. **配图计划**：🔸 wechat_article 资产显示 `deep_dive_image_plans`（image_type、source_status、image_priority_rank）。

### 2.8 Knowledge `/knowledge` — 常青知识 Topic Bank

**职责**：AI Knowledge Topic Bank 的开采与覆盖度管理（需求七）。

**主要区块**：
1. **知识网格/表格**：`knowledge_topic_bank`（concept、category、`knowledge_status`、`content_status`、b2b_relevance、user_learning_cost、long_term_value、current_heat、next_action）。
2. **概念图**：`upstream_concepts` / `related_concepts` / `downstream_concepts`（或 `knowledge_concept_edges`）可视化。
3. **衍生预算指示**：`knowledge_derivations` round_index ∈ 1..3 预算条（一次一主 + 最多 3 衍生）。
4. **开采操作**：触发 Evergreen Knowledge Workflow（落 `workflow_runs`）。

### 2.9 GitHub Weekly `/github-weekly` — GitHub 周报快照

**职责**：GitHub 周榜快照的抓取、定稿（frozen 不可变）与 Replay 管理（需求六）。

**主要区块**：
1. **周选择器 + 快照列表**：`github_snapshots`（snapshot_id、snapshot_type、week、selection_basis、status captured/frozen）。
2. **榜单表格**：`github_snapshot_items`（rank、repository、project_name、weekly_growth、total_stars、repo_url、verification_status、selected、elimination_reason）。
3. **不可变标识**：frozen 快照显示锁标识（触发器禁改）；Replay 新建行 + `source_item_id` 血缘。
4. **选中落 Topic**：`selected=true` 项关联 `topics.id`（topic_type=technical_project/trend）。
5. **操作区**：抓取本周（Original）、Replay 重生成、标记 selected/淘汰原因。

### 2.10 Sources `/sources` — 来源与核验中心

**职责**：来源主档、证据包与逐条事实核验的三层管理（需求三：sources → source_packet_items → source_packets）。

**主要区块**：
1. **来源主档列表**：`sources`（source_name、source_url、source_type、source_quality_score、event_date、disclosure_date、is_confidential）。
2. **证据包列表/聚合**：`source_packets`（packet_id、verification_status 包级五态、source_consistency、conflict_fact_ids、verified_by/verified_at）。
3. **核验明细表**：`source_packet_items`（core_fact、key_numbers、number_test_conditions、item_verification_status、event_assessment）。
4. **冲突处理面板**：`source_consistency='conflict'` 时的逐条裁决（写 `audit_log`）。

### 2.11 Assets `/assets` — 品牌素材库

**职责**：`brand_assets` 的上传、取用策略与 Logo 保护管理（需求十一）。

**主要区块**：
1. **素材网格/列表**：`brand_assets`（name、type、file_url、version、usage_notes、active、ai_policy）。
2. **Logo 保护标识**：`type='logo'` 强制 `ai_policy='reference_only'`，显示"禁止重绘"标记；`is_primary_logo` 唯一。
3. **上传操作**：上传至 Supabase Storage，回填 file_url。
4. **使用审计**：`asset_brand_usages`（usage_kind 按资产反查）。

### 2.12 Publications `/publications` — 发布中心

**职责**：发布计划的编排与人工发布执行（V1 绝不自动发布，需求十二/§2.8 业务规则）。

**主要区块**：
1. **发布列表**：`publications`（topic_id、asset_id、platform、scheduled_date、published_date、published_url、status）。
2. **过滤**：`platform`、`status`、`metric_date` 区间。
3. **待发布队列**：`ready` 态集中处理。
4. **人工发布操作**：回填 `published_date` / `published_url` / `published_by`（仅人工触发 `published`，落 `audit_log`）。

### 2.13 Analytics `/analytics` — 数据分析

**职责**：全量指标的事实面——Conversion Funnel 与平台/周维度的表现洞察（需求十三）。

**主要区块**：
1. **KPI 概览行**：impressions、views、reads、cta_clicks、demo_requests、sales_leads、deals、revenue 等聚合。
2. **Conversion Funnel**：Read → CTA Click → Lead → Registration → Demo → Sales Lead → Deal → Revenue（SQL 视图 `conversion_funnel`，绑定 `topic_id`）。
3. **维度分析**：按 `publication_platform` / `metric_date`（周/月）下钻的指标表与图表（`content_metrics` 18 字段全量可用）。
4. **Leads 池**：`leads`（lead_type、lead_urgency、lead_status、suggested_reply 仅建议不自动回复）。
5. **趋势雷达图**：`trend_radar` 跨周对比。

### 2.14 Settings `/settings` — 系统设置

**职责**：评分权重/阈值、产能、路由与 Prompt 模板的配置驱动管理（避免硬编码）。

**主要区块**：
1. **评分配置**：`system_settings`（scoring.weights.default/hot/evergreen/conversion、scoring.threshold.p0/p1/p2）。
2. **产能配置**：capacity.global_concurrency、workflow capacity_rules。
3. **路由规则**：`workflow_routing_rules` 可视化编辑。
4. **Prompt 模板管理**：`ai_prompt_templates`（key、version、system_prompt、active）。
5. **集成**：LLM Provider 配置（`/lib/ai/providers` 抽象层）。
6. **用户/权限**：V1 单用户，预留。

---

## 3. Topic Detail 页（/topics/[id]）完整区块顺序

> **页面结构**：顶部信息头（可固定）+ 主体两栏（左侧主列 = 顺序区块；右侧侧栏 = CTA 与血缘摘要），但**区块阅读顺序严格按下列 1-14**。字段名全部引用数据模型。

### 3.1 基础信息（Basic Info）
- 主字段：`topics.topic_id`、`topics.content_week`、`topics.title`、`topics.description`、`topics.topic_type`（徽标）、`topics.status`（9 态徽标）。
- 元信息：`created_by_run_id`、`created_at` / `updated_at`、`archived_at`（如有）。
- 数据契约：`topics` 行直读。

### 3.2 评分（Scoring）
- 五维条：`b2b_relevance` / `traffic_potential` / `conversion_potential` / `timeliness` / `content_value`（1-10 进度条 + 数值）。
- 门控项：`business_relevance`（1-10，独立显示，标注"门控不参与加权"）。
- 推导展示：`priority_score` 加权结果、`score_rationale`（jsonb，含各维分值/权重/阈值判定/门控结论）、`score_version`。
- 操作：🔸 重新评分（触发 Orchestrator 评分 run，落 `workflow_runs`）。

### 3.3 Priority（优先级）
- 徽标：`priority` ∈ P0（红）/ P1（橙）/ P2（蓝）/ P3（中性灰），语义色见 §4.2。
- 展开：点击徽标展开 `score_rationale` 的分档依据（P0≥8.0 / P1≥6.5 / P2≥5.0 / P3<5.0，及 business_relevance 封顶/兜底结论）。

### 3.4 Tags（标签）
- `trend_tags`（`text[]`）标签组 + `topic_type` 常驻徽标；可移除标签（🔸 追加操作，落 audit）。

### 3.5 Parent（父 Topic）
- 单父衍生链：`topics.parent_topic_id` → 显示父 `topic_id` + title，可跳转。
- 空态：`无父 Topic（顶层选题）`。

### 3.6 Source Topics（来源 Topic）
- 多对多来源血缘：`topics.source_topic_ids`（`uuid[]`）列表，逐项显示 `topic_id` + title，可跳转、可追加来源（🔸）。

### 3.7 Lineage 可视化（Topic Lineage）
- 权威数据源：`topic_relations`（`relation_type` ∈ parent/source）+ `WITH RECURSIVE` 递归 CTE 上下行遍历（深度 3-5 层）。
- 渲染：有向图组件（节点 = Topic 卡片：topic_id + title + priority 色边；边 = parent 实线 / source 虚线）。
- 展示当前 Topic 高亮 + 上游（父/源）与下游（衍生）双向。

### 3.8 Source Packet（证据包）
- 包级头：`source_packets`（packet_id、`verification_status` 包级五态、`source_consistency`、`conflict_fact_ids`、verified_by、verified_at、notes）。
- 明细表：`source_packet_items`（core_fact、key_numbers 结构化数组、number_test_conditions 断言数组、item_verification_status、event_assessment）。
- 冲突处理入口：`source_consistency='conflict'` 时展开逐条裁决（写 `audit_log`）。

### 3.9 Workflow Runs（工作流执行）
- 关联 runs：`workflow_runs` WHERE topic_id = 本 Topic。
- 视图：父子调用树（`parent_run_id`）+ 每个 run 的 `status` 徽标、`batch_id`、`attempt_count`、产物 `workflow_outputs`（output_type + applied）。
- 操作：展开 run Drawer 查看 `workflow_tasks` 步骤时间线。

### 3.10 Content Assets（内容资产）
- 资产列表：`content_assets`（asset_key、`asset_type` 徽标、platform、content_role、cta、status、current_version）。
- 关联版本：`content_asset_versions` 当前版摘要；点击跳转 `/content/[id]`。

### 3.11 Derived Topics（衍生 Topic）
- 由本 Topic 衍生出的 Topic：`topics` WHERE parent_topic_id = 本 Topic.id（`topic_relations` relation_type='parent' 的遍历结果）。
- 每项显示 `topic_id` + title + status，可跳转。

### 3.12 Metrics（指标）
- 聚合：`content_metrics` WHERE topic_id = 本 Topic（全量 18 字段可切平台/日期）。
- 漏斗：`conversion_funnel` 视图（Read → CTA Click → Lead → Registration → Demo → Sales Lead → Deal → Revenue）。
- 展示：KPI 小卡 + 漏斗条 + 按平台/周的 Sparkline。

### 3.13 CTA（转化动作）
- 主 CTA：`topics.primary_cta` → `ctas`（key、label、cta_type、target_url_template）。
- 资产覆盖：`content_assets.cta` 单值覆盖列表（默认继承主 CTA）。
- 规则提示：`Ready for Production` 前必填（守卫校验）。

### 3.14 历史记录（History）
- 数据源：`audit_log` WHERE entity_type='topic' AND action='status_changed'（视图 `topic_status_history`）。
- 渲染：**Timeline** 组件，逐条显示 from_status → to_status、actor（用户或 `ai:run-xxx`）、workflow_run_id、note、created_at。
- 同源扩展：🔸 包级核验记录（`source_packet_verifications` 视图）并入本时间线，按时间排序。

---

## 4. 设计系统

> 风格基准：AI / B2B / 内容运营 / 数据驱动 / 专业工作台，参考 Linear、Vercel、Notion、现代 SaaS Dashboard。**信息密度高、留白适中、减少大面积装饰**。主色：白 / 深灰 / 蓝三色体系；状态显性；Priority 用语义色徽标。

### 4.1 色彩 Token（三色体系）

**语义划分**：Canvas（白系背景）→ 内容用深灰前景 → 品牌/交互用蓝；P0/P1/P2 徽标为独立语义色。V1 以浅色专业主题为默认，深色主题作为 🔸 追加（token 已同构预留）。

| Token | Light 值 | Dark（🔸 追加） | 用途 |
|---|---|---|---|
| `--color-bg` | `#FFFFFF` 白 | `#0B1220` | 页面画布 |
| `--color-bg-subtle` | `#F8FAFC` | `#0F172A` | 页面次级背景、表头、空态区 |
| `--color-bg-hover` | `#F1F5F9` | `#1E293B` | 悬停/选中行背景 |
| `--color-bg-elevated` | `#FFFFFF` | `#111A2E` | Card / Drawer / Command Menu |
| `--color-fg-strong` | `#0F172A`（slate-900） | `#F8FAFC` | 标题、KPI 数字 |
| `--color-fg-default` | `#334155`（slate-700） | `#CBD5E1` | 正文、表格正文 |
| `--color-fg-muted` | `#64748B`（slate-500） | `#94A3B8` | 次要说明、placeholder |
| `--color-fg-faint` | `#94A3B8`（slate-400） | `#64748B` | 禁用、辅助装饰 |
| `--color-border` | `#E2E8F0`（slate-200） | `#1E293B` | 默认描边 |
| `--color-border-strong` | `#CBD5E1`（slate-300） | `#334155` | 聚焦描边、分割线强调 |
| `--color-primary` | `#2563EB`（blue-600） | `#3B82F6`（blue-500） | 品牌/主按钮/链接/选中态 |
| `--color-primary-hover` | `#1D4ED8`（blue-700） | `#2563EB` | 主按钮 hover |
| `--color-primary-soft` | `#DBEAFE`（blue-100） | `#1E3A8A` | 主色浅底（选中 Tab、进度底） |
| `--color-primary-subtle` | `#EFF6FF`（blue-50） | `#172554` | 主色极浅底（Badge 底） |
| `--color-ring` | `rgba(37,99,235,.25)` | 同左 | focus ring |

**语义功能色**：

| Token | 值 | 用途 |
|---|---|---|
| `--color-success` | `#16A34A`（green-600） | 成功态、`verified`、`completed`、`published` |
| `--color-warning` | `#D97706`（amber-600） | 警告、`needs_update`、`needs_revision` |
| `--color-danger` | `#DC2626`（red-600） | 错误、`failed`、`conflict`、P0 |
| `--color-info` | `#2563EB`（blue-600） | 信息提示 |
| `--color-scrim` | `rgba(15,23,42,.45)` | Drawer / 弹层遮罩 |

**Priority 徽标色（需求十九固定）**：

| Priority | 前景 | 浅底 | 说明 |
|---|---|---|---|
| `P0` | `#DC2626`（red-600） | `#FEE2E2`（red-100） | 红色 = 最高优先级 |
| `P1` | `#EA580C`（orange-600） | `#FFEDD5`（orange-100） | 橙色 |
| `P2` | `#2563EB`（blue-600） | `#DBEAFE`（blue-100） | 蓝色 |
| `P3` | `#64748B`（slate-500） | `#F1F5F9`（slate-100） | 🔸 中性灰（需求未指定，追加） |

> 徽标规范：软底（soft 变体）+ 高对比前景 + 可选状态圆点。Priority 徽标在列表/详情处常驻。

### 4.2 字体（Typography）

- **字体栈**：`--font-sans`: `Inter, -apple-system, "SF Pro Text", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif`（中文优先苹方/思源，保证中文混排）。
- **等宽栈**：`--font-mono`: `"JetBrains Mono", "SF Mono", ui-monospace, "Cascadia Code", monospace` — 用于 `topic_id`、`run_number`、`batch_id`、`snapshot_id`、`packet_id` 等业务 ID 与数字，强化数据可读性。
- **字号阶梯（信息密度高 → 默认正文 14px）**：

| Token | 字号/行高 | 用途 |
|---|---|---|
| `--text-xs` | 12 / 16 | 表内次要、徽标、标签 |
| `--text-sm` | 13 / 20 | 表格正文、元信息、Drawer 正文 |
| `--text-base` | 14 / 22 | **页面/区块默认正文**（高密度） |
| `--text-md` | 16 / 24 | Card 标题、区块标题 |
| `--text-lg` | 18 / 28 | 页面标题（PageTitle） |
| `--text-xl` | 20 / 30 | Dashboard 主标题 |
| `--text-2xl` | 24 / 32 | KPI 大数字、展示字 |

- **字重**：400 正文 / 500 中强 / 600 标题与徽标 / 700 KPI 数字与数值。数字与 ID 用 `tabular-nums`（`font-variant-numeric`），保证表格对齐。
- **行高/字距**：正文 1.5；大标题 `letter-spacing: -0.01em`；KPI 数字 `letter-spacing: -0.02em`。

### 4.3 间距 / 圆角 / 阴影

**间距（4px 基数，`--space-*`）**：

| Token | 值 | 语义用途 |
|---|---|---|
| `--space-1` | 4 | 紧凑内边距、Badge 内边 |
| `--space-2` | 8 | 组件内/行内间距、图标间隙 |
| `--space-3` | 12 | 表格单元格水平内边、按钮内边 |
| `--space-4` | 16 | Card padding、行间距 |
| `--space-5` | 20 | Card 内区块分隔 |
| `--space-6` | 24 | 区块间距、页面 padding（桌面） |
| `--space-8` | 32 | 大区块间距、侧栏与内容间隙 |
| `--space-12` | 48 | 页面顶部区下距 |
| `--space-16` | 64 | 页面留白 |

- 密度约定：表格行高紧凑（cell 垂直 8-10px）；页面 padding 桌面 24 / 移动 16；Card padding 16-20；Section 间距 24。

**圆角（`--radius-*`）**：

| Token | 值 | 用途 |
|---|---|---|
| `--radius-xs` | 2 | Checkbox 等微型控件 |
| `--radius-sm` | 4 | Input、Button、小控件 |
| `--radius-md` | 6 | **默认控件**、Badge、Tag |
| `--radius-lg` | 8 | Card、表格容器 |
| `--radius-xl` | 12 | Drawer、Dialog、Command Menu |
| `--radius-full` | 9999 | Pill / Tag / 圆点徽标 |

**阴影（`--shadow-*`）**：

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(15,23,42,.04)` | 默认卡片轻投影 |
| `--shadow-sm` | `0 1px 2px rgba(15,23,42,.05), 0 1px 3px rgba(15,23,42,.06)` | Card 常规 |
| `--shadow-md` | `0 4px 6px -1px rgba(15,23,42,.06), 0 2px 4px -2px rgba(15,23,42,.05)` | Dropdown、Popover |
| `--shadow-lg` | `0 10px 15px -3px rgba(15,23,42,.08), 0 4px 6px -4px rgba(15,23,42,.06)` | **Drawer** |
| `--shadow-xl` | `0 20px 25px -5px rgba(15,23,42,.10), 0 8px 10px -6px rgba(15,23,42,.08)` | **Command Menu**、Dialog |
| `--ring-focus` | `0 0 0 2px var(--color-ring)` | 全局 focus ring |

### 4.4 通用页面骨架（AppShell + PageLayout）

```
┌────────────────────────────────────────────────────────────┐
│ Sidebar(240)  │  Topbar(56): 面包屑 / ⌘K 搜索 / 周选择 / 待办 │
│               ├────────────────────────────────────────────┤
│ L1 导航树     │  PageHeader: 标题 + 一句话职责 + 主/次操作      │
│  总览         │  ┌──────────────────────────────────────┐   │
│  生产…        │  │ Toolbar/FilterBar（过滤 + 排序 + 视图）  │   │
│  数据         │  └──────────────────────────────────────┘   │
│  系统         │  Section A（Card/Table 区块）                 │
│  ─────────    │  Section B（Card/Table 区块）                 │
│ 当前周/用户   │  …                                          │
└───────────────┴────────────────────────────────────────────┘
```

- **PageHeader**：标题（18-20px）+ 副标题（一句话职责）+ 右侧操作区（主 CTA 用 `--color-primary` 实底按钮，次操作 ghost/outline）。
- **Toolbar/FilterBar**：输入框、Select 过滤、Tabs 切换、紧凑；筛选状态可清空。
- **区块约定**：内容以 Card 分组；列表类优先 Table；详情类用信息卡网格 + Drawer 承载次级视图。
- **三态约定（全站统一）**：加载 = `Skeleton` 骨架屏（保持布局稳定）；空态 = `EmptyState`（图标 + 说明 + 引导 CTA）；错误 = 错误卡片 + 重试按钮。**禁止空白页**。
- **响应式**：桌面 3 栏 → 平板 2 栏 → 移动端单栏，Sidebar 折叠为 Drawer，Table 降级为 Card 列表。V1 以桌面为第一优先级。

### 4.5 组件清单（shadcn/ui + Radix 原语）

**核心组件（需求十九指定，全量实现）**：

| 组件 | 规格要点 | 页面示例 |
|---|---|---|
| `Card` | `--radius-lg`、`--shadow-xs`、`--space-4/5` padding；含 CardHeader/CardTitle/CardDescription/CardContent/CardFooter | 全站区块容器 |
| `Table` | 紧凑行高、表头 `--color-bg-subtle`、可排序、`tabular-nums`、空态/加载态、分页；操作列右对齐 | Topics、Runs、Content、GitHub Weekly、Sources、Publications |
| `Badge` | 软底变体 + 状态圆点；Priority 徽标（P0 红/P1 橙/P2 蓝/P3 灰）；status/type 徽标 | 全站状态/优先级显性 |
| `Tabs` | 下划线式（primary-soft 底），`TabsList/TabsTrigger/TabsContent` | Topic Detail 内分区、Detail 页视图切换 |
| `Drawer` | 右侧滑出、`--shadow-lg` + `--color-scrim`、640px 宽、可堆叠 | Run 详情、候选池、核验明细、来源详情 |
| `Command Menu` | ⌘K 全局检索，`--shadow-xl` + `--radius-xl`，cmdk；索引 = Topic(topic_id/title) + 批次 + 资产 + 导航 + 动作 | Topbar 常驻 |
| `Timeline` | 竖向时间轴（圆点 + 连线 + 时间戳 + 状态色），`audit_log` / `workflow_tasks` / 版本历史 | Topic Detail 历史记录、Runs Drawer |

**基础/扩展组件（🔸 追加，shadcn/ui 标准集）**：`Button`（primary/secondary/ghost/destructive）、`Input`、`Select`、`Textarea`、`Checkbox`、`Switch`、`RadioGroup`、`DropdownMenu`、`Popover`、`Dialog`、`Tooltip`、`Toast`、`Separator`、`Breadcrumb`、`Avatar`、`Skeleton`、`EmptyState`、`Pagination`、`ScrollArea`、`Collapsible`、`ProgressBar`（评分/预算条）、`Sparkline`、`KpiCard`（统计小卡）、`StatusDot`、`Tag`（可移除标签）、`LineageGraph`（🔸 血缘有向图，Topic Detail §3.7 专用）、`Funnel`（🔸 转化漏斗条，Analytics / Topic Detail Metrics 专用）。

**视觉规则**：
- 大面积留白避免装饰性渐变/重阴影；状态通过 Badge + 颜色双重编码（不单靠颜色）。
- 表格与卡片为主叙事，图表仅用于 Metrics / Analytics / 血缘。
- 所有可点击项有 hover 反馈；全局 focus ring 用 `--ring-focus`。

---

## 5. 页面 ↔ 数据模型映射（供 13 份文档引用）

| 路由 | 主数据表（`_canonical-data-model.md` 引用） |
|---|---|
| `/dashboard` | `workflow_batches`、`workflow_runs`、`topics`、`content_assets`、`publications`、`leads`、`content_metrics`、`trend_radar`、`event_pool` |
| `/topics` | `topics`、`event_pool`、`topic_clusters` |
| `/topics/[id]` | `topics`、`topic_relations`、`source_packets`、`source_packet_items`、`sources`、`workflow_runs`、`workflow_outputs`、`content_assets`、`content_asset_versions`、`content_metrics`、`ctas`、`audit_log` |
| `/workflows` | `workflow_types`、`workflow_templates`、`workflow_routing_rules`、`workflow_batches`、`ai_prompt_templates` |
| `/workflows/runs` | `workflow_runs`、`workflow_tasks`、`workflow_outputs`、`workflow_batches` |
| `/content` | `content_assets`、`content_asset_versions`、`publications` |
| `/content/[id]` | `content_assets`、`content_asset_versions`、`publications`、`deep_dive_image_plans`、`ctas`、`audit_log` |
| `/knowledge` | `knowledge_topic_bank`、`knowledge_concept_edges`、`knowledge_derivations`、`topics` |
| `/github-weekly` | `github_snapshots`、`github_snapshot_items`、`topics` |
| `/sources` | `sources`、`source_packets`、`source_packet_items`、`audit_log` |
| `/assets` | `brand_assets`、`asset_brand_usages` |
| `/publications` | `publications`、`content_assets`、`audit_log` |
| `/analytics` | `content_metrics`（视图 `conversion_funnel`）、`leads`、`trend_radar` |
| `/settings` | `system_settings`、`workflow_routing_rules`、`ai_prompt_templates`、`workflow_types` |

---

## 6. 决策与开放问题（供后续 13 份文档衔接）

1. 🔸 **P3 徽标色**：需求只规定 P0/P1/P2，P3 追加为中性灰（`#64748B`/`#F1F5F9`），保持 4 级可区分。
2. 🔸 **深色主题**：token 已同构预留 Dark 值，V1 默认浅色专业主题。
3. 🔸 **L3 详情路由**：`/workflows/runs/[id]`、`/sources/[id]` 用 Drawer 承载，不新增路由，保持需求十四的 14 条路由不变。
4. **Topic Detail 区块顺序**为硬性要求（§3，1-14），任何页面实现不得重排/删节。
5. **人工门禁可视性**：所有发布/审核动作在 UI 上需有显性"人工"标识与 `audit_log` 关联（§2.8 业务规则），不得提供绕过路径。
6. **开放问题**：趋势雷达在 Dashboard 的图表粒度（周/跨周）与刷新策略，留待 UI 设计稿确定（不影响本基线）。
