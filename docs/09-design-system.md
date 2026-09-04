# 09 设计系统（Design System）

> **状态**：本文档为正式文档（`/docs/09-design-system.md`），主题【设计系统】，对应需求十九"UI 风格"与需求二十第 3 步的落地细化。
> **事实源声明**：本文档的唯一事实源为 `docs/` 下 5 个基线文件——`_requirements.md`（需求原文）、`_canonical-data-model.md`（数据模型，字段/枚举唯一裁决依据）、`_canonical-workflow.md`（工作流与状态机行为契约）、`_canonical-ia.md`（导航树/页面职责/区块顺序/**设计系统**）、`_canonical-roadmap.md`（MVP 范围与阶段）。凡字段、枚举、路由、状态、区块顺序、token 值一律引用基线原文（设计系统主体引用 `_canonical-ia.md` §4，本文件**不新增、不删减、不改写**基线 token；仅在基线未定义处给出"落地细则/追加建议"，并标注 🔸）。
> **裁决顺序**：token 值/组件清单/页面骨架与 IA 基线 §4 冲突 → 以 IA 基线为准；字段/枚举与数据模型基线冲突 → 以数据模型基线为准；发现基线遗漏或需偏离处，记录于文末 Open Questions 并在返回值 `deviationsFromCanonical` 中以 `[REVIEW]` 标注，**不改动基线文件**。
> **技术基线**：Next.js App Router、TypeScript strict、Tailwind CSS、shadcn/ui（Radix 原语 + Tailwind token）、PostgreSQL（Supabase）。Token 以 CSS 变量定义（`--color-*` / `--space-*` / `--radius-*` / `--shadow-*` / `--text-*` / `--font-*`），经 Tailwind `theme.extend` 映射。
> **落地对齐**：本文档为 roadmap 基线 D1"项目脚手架与设计系统基线落地"（5 人日）的设计契约，验收标准 = 本文档 §8 检查清单。

---

## 1. 设计原则（Design Principles）

> 风格基准继承 IA §4 头注：**AI / B2B / 内容运营 / 数据驱动 / 专业工作台**，参考 Linear、Vercel、Notion、现代 SaaS Dashboard。以下 8 条原则为落地裁量（🔸 为本文档细化，不改变基线语义）。

| 编号 | 原则 | 基线依据 | 落地含义与示例 |
|---|---|---|---|
| DS-1 | **高密度信息优先** | 需求十九、IA §4 头注/§4.2 | 默认正文 **14px**（`--text-base`）；表格行紧凑（cell 垂直 8-10px）；业务 ID 用等宽字体 `tabular-nums` 保证对齐。示例：`/topics` 表格一行同时容纳 `topics.topic_id`（等宽）、title、`topic_type` 徽标、`priority` 徽标、`status` 徽标、五维评分汇总条、`primary_cta`、`content_week`、updated_at |
| DS-2 | **白 / 深灰 / 蓝三色体系** | 需求十九、IA §4.1 | Canvas 白系背景 → 内容深灰前景 → 品牌/交互用蓝；`--color-primary` 仅用于主按钮/链接/选中态。示例：Dashboard 主 CTA「生成本周内容计划」为蓝色实底按钮，次操作（"查看全部"）为 ghost 按钮 |
| DS-3 | **状态显性（颜色 + 文字双重编码）** | 需求十九、IA §4.1/§4.5 | 所有状态/优先级经 **Badge 软底 + 高对比前景 + 可选状态圆点** 展示，不单靠颜色；枚举展示为"中文标签 + 英文 value 双显"。示例：`workflow_runs.status='needs_review'` 徽标 = 琥珀色软底 + 圆点 + 文案"待审核 needs_review" |
| DS-4 | **Priority 语义色固定** | 需求十九、IA §4.1 | **P0 红 / P1 橙 / P2 蓝 / P3 灰**（P3 中性灰为 IA 基线 🔸 追加值，非需求明文），全站列表/详情常驻（详见 §3.3） |
| DS-5 | **减少大面积装饰** | 需求十九、IA §4.5 | 无装饰性渐变、无重阴影（Card 仅 `--shadow-xs`/`--shadow-sm`）；图表仅用于 Metrics / Analytics / 血缘（`LineageGraph` / `Funnel` / Sparkline），其余页面以 Card + Table 为主叙事 |
| DS-6 | **人工门禁显性** | 数据模型 §2.8、IA §6-5、DC-03 | 所有发布/审核按钮带显性"人工"标识（Person 图标 + "人工"字样），动作落 `audit_log`；UI 不存在绕过路径。示例：`/publications` 的"标记已发布"按钮仅在人工会话可见，且强制回填 `published_date / published_url / published_by` |
| DS-7 | **三态全站统一** | IA §4.4、DC-38 | 加载 = `Skeleton`（保持布局稳定）；空态 = `EmptyState`（图标 + 说明 + 引导 CTA）；错误 = 错误卡片 + 重试按钮。**禁止空白页** |
| DS-8 | **桌面优先，token 同构预留深色** | IA §4.1/§4.4、DC-37 | V1 默认浅色专业主题；深色主题 🔸 追加（token 已同构预留 Dark 值）；响应式：桌面 3 栏 → 平板 2 栏 → 移动端单栏（Sidebar 折叠为 Drawer，Table 降级为 Card 列表） |

---

## 2. 色彩系统（Color System）

### 2.1 三色体系 Token（Canvas / Foreground / Brand）

> 值全部引用 IA §4.1，**不允许改动**；V1 以 Light 值为准，Dark 值为 🔸 预留（同构实现，默认不启用）。

| Token | Light 值 | Dark（🔸 追加） | 用途 | 使用示例 |
|---|---|---|---|---|
| `--color-bg` | `#FFFFFF` 白 | `#0B1220` | 页面画布 | AppShell Content 区默认背景 |
| `--color-bg-subtle` | `#F8FAFC` | `#0F172A` | 页面次级背景、表头、空态区 | `Table` 表头、`EmptyState` 底板 |
| `--color-bg-hover` | `#F1F5F9` | `#1E293B` | 悬停/选中行背景 | Table 行 hover、列表项选中 |
| `--color-bg-elevated` | `#FFFFFF` | `#111A2E` | Card / Drawer / Command Menu | `Card`、`Drawer`、⌘K 面板底色 |
| `--color-fg-strong` | `#0F172A`（slate-900） | `#F8FAFC` | 标题、KPI 数字 | PageTitle、KPI 大数字（`--text-2xl`） |
| `--color-fg-default` | `#334155`（slate-700） | `#CBD5E1` | 正文、表格正文 | 区块正文、Table 单元格 |
| `--color-fg-muted` | `#64748B`（slate-500） | `#94A3B8` | 次要说明、placeholder | 元信息、CardDescription、Input placeholder |
| `--color-fg-faint` | `#94A3B8`（slate-400） | `#64748B` | 禁用、辅助装饰 | 禁用按钮、分隔装饰 |
| `--color-border` | `#E2E8F0`（slate-200） | `#1E293B` | 默认描边 | Card 描边、Table 行分隔 |
| `--color-border-strong` | `#CBD5E1`（slate-300） | `#334155` | 聚焦描边、分割线强调 | Input focus 描边、Drawer 与内容区分割线 |
| `--color-primary` | `#2563EB`（blue-600） | `#3B82F6`（blue-500） | 品牌/主按钮/链接/选中态 | 「生成本周内容计划」按钮、Tab 选中态 |
| `--color-primary-hover` | `#1D4ED8`（blue-700） | `#2563EB` | 主按钮 hover | 主按钮悬停态 |
| `--color-primary-soft` | `#DBEAFE`（blue-100） | `#1E3A8A` | 主色浅底（选中 Tab、进度底） | 下划线式 Tab 选中底、进度条底 |
| `--color-primary-subtle` | `#EFF6FF`（blue-50） | `#172554` | 主色极浅底（Badge 底） | P2 徽标底、信息 Badge 底 |
| `--color-ring` | `rgba(37,99,235,.25)` | 同左 | focus ring | 全局 focus ring（`--ring-focus`） |

### 2.2 语义功能色（Semantic Colors）

> 值引用 IA §4.1。**用途列即基线语义映射**（`verified`/`completed`/`published` 等为基线明文），其余枚举色映射见 §3.2（🔸 落地细则）。

| Token | 值 | 基线明文用途 | 落地示例 |
|---|---|---|---|
| `--color-success` | `#16A34A`（green-600） | 成功态、`verified`、`completed`、`published` | 包级核验 `source_packets.verification_status='verified'` 徽标；`workflow_runs.status='completed'` 徽标 |
| `--color-warning` | `#D97706`（amber-600） | 警告、`needs_update`、`needs_revision` | `source_verification_status='needs_update'`；`topic_status='Needs Revision'` |
| `--color-danger` | `#DC2626`（red-600） | 错误、`failed`、`conflict`、**P0** | `workflow_runs.status='failed'`；`source_consistency='conflict'`；P0 徽标 |
| `--color-info` | `#2563EB`（blue-600） | 信息提示 | `Researching`/`Producing` 等进行中态徽标底（🔸 细则） |
| `--color-scrim` | `rgba(15,23,42,.45)` | Drawer / 弹层遮罩 | Drawer、Dialog、Command Menu 遮罩 |

### 2.3 Priority 徽标色（需求十九固定，IA §4.1）

| Priority | 前景 | 浅底 | 说明 |
|---|---|---|---|
| `P0` | `#DC2626`（red-600） | `#FEE2E2`（red-100） | 红色 = 最高优先级（`priority_score ≥ 8.0`，数据模型 §2.5） |
| `P1` | `#EA580C`（orange-600） | `#FFEDD5`（orange-100） | 橙色（`≥ 6.5`） |
| `P2` | `#2563EB`（blue-600） | `#DBEAFE`（blue-100） | 蓝色（`≥ 5.0`；`business_relevance < 4` 门控封顶 P2，数据模型 §2.5） |
| `P3` | `#64748B`（slate-500） | `#F1F5F9`（slate-100） | 🔸 中性灰（`< 5.0`；需求未指定，IA 基线追加值，本文维持） |

---

## 3. 徽标（Badge）规范

> 全站状态显性的核心载体。规格：软底（soft 变体）+ 高对比前景 + 可选状态圆点（6px）。中英文双显：`label（value）`，value 一律用数据模型 `§1 全局枚举` 英文值。

### 3.1 徽标通用规格（🔸 落地细则）

| 属性 | 规格 |
|---|---|
| 圆角 | `--radius-md`（6px）；Pill 形态用 `--radius-full`（🔸 追加形态，用于 Tag） |
| 字号 | `--text-xs`（12px）、字重 500 |
| 内边距 | 水平 `--space-2`（8px）、垂直 `--space-1`（4px） |
| 状态圆点 | 直径 6px，`--color-*` 语义色填充；进行中态（如 `running`/`Researching`）圆点加脉冲动画（🔸） |
| 变体 | `soft`（默认，浅底 + 深色前景）/ `outline`（透明底 + `--color-border-strong` 描边，用于次要信息如 `topic_type`） |
| 双重编码 | 颜色 + 圆点 + 文案三要素缺一不可；**禁止仅用颜色区分状态** |

### 3.2 状态 → 徽标色映射（全枚举落地矩阵，🔸 落地细则）

> 基线明文语义色：`success` = `verified`/`completed`/`published`；`warning` = `needs_update`/`needs_revision`；`danger` = `failed`/`conflict`/P0（IA §4.1）。其余为按语义外推的落地映射，**不改变基线语义**，实现前需评审确认（见 `deviationsFromCanonical` [REVIEW] #1）。

| 枚举（数据模型 §1） | 取值 | 徽标色 | 展示文案示例 |
|---|---|---|---|
| `topic_status`（9 态，需求一） | `Draft` | 中性（slate-500） | 草稿 Draft |
| | `Researching` | info（blue-600） | 调研中 Researching |
| | `Ready for Production` | info 深（blue-700） | 可生产 Ready for Production |
| | `Producing` | info（blue-600） | 生产中 Producing |
| | `Review` | warning（amber-600） | 待审核 Review |
| | `Needs Revision` | warning（amber-600） | 需修改 Needs Revision |
| | `Ready to Publish` | info 深（blue-700） | 可发布 Ready to Publish |
| | `Published` | success（green-600） | 已发布 Published |
| | `Archived` | 中性灰（slate-400） | 已归档 Archived |
| `source_verification_status`（5 态） | `unverified` | 中性灰 | 未核验 unverified |
| | `partially_verified` | warning 浅（amber-500） | 部分核验 partially_verified |
| | `verified` | success | 已核验 verified |
| | `conflict` | danger | 冲突 conflict |
| | `needs_update` | warning | 需更新 needs_update |
| `source_consistency` | `consistent` / `partial` / `conflict` | success / warning / danger | 一致 / 部分一致 / 冲突 |
| `workflow_run_status`（5 态） | `queued` | 中性灰 | 排队中 queued |
| | `running` | info + 脉冲圆点 | 运行中 running |
| | `completed` | success | 已完成 completed |
| | `failed` | danger | 失败 failed |
| | `needs_review` | warning + 圆点 | 待审核 needs_review |
| `workflow_task_status`（5 态） | `queued`/`running`/`completed`/`failed`/`skipped` | 同上；`skipped` = 中性灰 | 已跳过 skipped |
| `batch_status`（6 态） | `planned`（中性灰）/`dispatching`（info）/`in_progress`（info）/`needs_review`（warning）/`completed`（success）/`failed`（danger） | 同上规则 | 计划中 planned |
| `publication_status`（4 态） | `planned`（中性灰）/`ready`（info）/`published`（success）/`failed`（danger） | 同上规则 | 待发布 planned |
| `history_dedupe_status`（6 态） | `not_checked`（中性灰）/`unique`（success）/`clustered`（info）/`duplicate`（warning）/`merged`（info 深）/`review_required`（warning + 圆点） | 同上规则 | 查重通过 unique |
| `selection_status`（3 态） | `pending`（中性灰）/`selected`（success）/`eliminated`（danger） | 同上规则 | 已入选 selected |
| `knowledge_status`（6 态） | `uncovered`（中性灰）/`partial`（warning 浅）/`basic_explanation`（info）/`deep_explanation`（success）/`needs_update`（warning）/`mature`（info 深） | 同上规则 | 已成熟 mature |
| `knowledge_content_status`（8 态） | `to_research`（中性灰）/`to_produce`（中性灰）/`script_done`（info）/`wechat_done`（info）/`graphic_done`（info）/`published`（success）/`high_performing`（success 深）/`needs_remake`（warning） | 同上规则 | 脚本完成 script_done |
| `github_snapshot_status`（2 态） | `captured`（info）/`frozen`（中性深 + 锁图标 🔸） | 同上规则 | 已冻结 frozen |
| `deep_dive_plan_status`（5 态） | `drafting`（中性灰）/`review`（warning）/`needs_revision`（warning）/`approved`（success）/`archived`（中性灰） | 同上规则 | 已批准 approved |
| `topic_type`（8 类） | `hot`/`evergreen`/`technical_project`/`scenario`/`product`/`conversion`/`trend`/`knowledge` | `outline` 变体（不语义着色，避免与状态色竞争） | 热点 hot |
| `asset_type`（8 类） | `ai_weekly_script`/`short_video_script`/`wechat_article`/`github_card`/`xiaohongshu`/`sales_material`/`infographic`/`cover` | `outline` 变体 | 公众号文章 wechat_article |
| `asset_status` | `topic_status` 子集 7 态（Draft/Producing/Review/Needs Revision/Ready to Publish/Published/Archived） | 与 `topic_status` 同名色一致 | 已发布 Published |

### 3.3 PriorityBadge 组件规格（🔸 落地细则）

| 属性 | 规格 |
|---|---|
| 结构 | `PriorityBadge`（PascalCase，IA §0 命名约定）：软底 + 前景 + 文案 `P0 最高` / `P1 高` / `P2 中` / `P3 低` |
| 色值 | 见 §2.3（P0 红 / P1 橙 / P2 蓝 / P3 灰） |
| 常驻位置 | `/topics` 表格列、`/topics/[id]` §3.3 区块、Lineage 图节点边色、Dashboard KPI 行 |
| 展开行为 | 点击徽标展开 `topics.score_rationale`（jsonb）分档依据：`priority_score` 加权结果、各维分值、权重、阈值判定（P0≥8.0 / P1≥6.5 / P2≥5.0 / P3<5.0）、`business_relevance` 门控结论（<4 封顶 P2、hot/trend `timeliness=10` 兜底 P1）、`score_version`（IA §3.3） |
| 数据源 | `topics.priority`（数据模型 §3.1），推导依据 `score_rationale`；**组件只读，不参与计算**（评分由 Orchestrator 落库，workflow 基线 §2） |

---

## 4. 字体（Typography）

> 值全部引用 IA §4.2。**信息密度高 → 默认正文 14px**。

### 4.1 字体栈

| Token | 值 | 用途 |
|---|---|---|
| `--font-sans` | `Inter, -apple-system, "SF Pro Text", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif` | 全站正文；中文优先苹方/思源，保证中英混排 |
| `--font-mono` | `"JetBrains Mono", "SF Mono", ui-monospace, "Cascadia Code", monospace` | 业务 ID 与数字：`topics.topic_id`（`2026W36-001`）、`workflow_runs.run_number`（`2026W36-AI-WEEKLY-R01`）、`workflow_batches.batch_id`（`2026W36-AI-WEEKLY`）、`github_snapshots.snapshot_id`（`2026W36-GH-ORIGINAL-PURE`）、`source_packets.packet_id`（`2026W36-001-SP`）、`event_pool.candidate_id` |

### 4.2 字号阶梯（7 级）

| Token | 字号 / 行高 | 用途 | 落地示例 |
|---|---|---|---|
| `--text-xs` | 12 / 16 | 表内次要、徽标、标签 | Badge 文案、表格次字段 |
| `--text-sm` | 13 / 20 | 表格正文、元信息、Drawer 正文 | `/topics` 表格正文、`created_at` 元信息 |
| `--text-base` | 14 / 22 | **页面/区块默认正文（高密度）** | 区块正文、CardDescription |
| `--text-md` | 16 / 24 | Card 标题、区块标题 | CardTitle、Topic Detail 区块标题 |
| `--text-lg` | 18 / 28 | 页面标题（PageTitle） | `/topics` 页标题 |
| `--text-xl` | 20 / 30 | Dashboard 主标题 | `/dashboard` 页标题 |
| `--text-2xl` | 24 / 32 | KPI 大数字、展示字 | Dashboard「本周 Leads」「Demo 数」「Consultation 数」KPI 数值 |

### 4.3 字重 / 数字 / 字距（引用 IA §4.2）

| 属性 | 规格 |
|---|---|
| 字重 | 400 正文 / 500 中强（徽标）/ 600 标题与徽标 / 700 KPI 数字与数值 |
| 数字对齐 | 数字与 ID 用 `tabular-nums`（`font-variant-numeric`），保证表格列对齐 |
| 行高 / 字距 | 正文 1.5；大标题 `letter-spacing: -0.01em`；KPI 数字 `letter-spacing: -0.02em` |
| 长度约束 | 中文单行建议 ≤ 48 字换行；表格单元格超长用 `truncate` + Tooltip（🔸） |

---

## 5. 间距 / 圆角 / 阴影（Spacing / Radius / Shadow）

### 5.1 间距（4px 基数，`--space-*`，IA §4.3 全量引用）

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

**密度约定**（IA §4.3）：表格行高紧凑（cell 垂直 8-10px）；页面 padding 桌面 24 / 移动 16；Card padding 16-20；Section 间距 24。**示例**：`/topics` Table 单元格水平 padding 12、垂直 8；Topic Detail 相邻区块间距 24。

### 5.2 圆角（`--radius-*`，IA §4.3 全量引用）

| Token | 值 | 用途 |
|---|---|---|
| `--radius-xs` | 2 | Checkbox 等微型控件 |
| `--radius-sm` | 4 | Input、Button、小控件 |
| `--radius-md` | 6 | **默认控件**、Badge、Tag |
| `--radius-lg` | 8 | Card、表格容器 |
| `--radius-xl` | 12 | Drawer、Dialog、Command Menu |
| `--radius-full` | 9999 | Pill / Tag / 圆点徽标 |

### 5.3 阴影（`--shadow-*`，IA §4.3 全量引用）

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(15,23,42,.04)` | 默认卡片轻投影 |
| `--shadow-sm` | `0 1px 2px rgba(15,23,42,.05), 0 1px 3px rgba(15,23,42,.06)` | Card 常规 |
| `--shadow-md` | `0 4px 6px -1px rgba(15,23,42,.06), 0 2px 4px -2px rgba(15,23,42,.05)` | Dropdown、Popover |
| `--shadow-lg` | `0 10px 15px -3px rgba(15,23,42,.08), 0 4px 6px -4px rgba(15,23,42,.06)` | **Drawer** |
| `--shadow-xl` | `0 20px 25px -5px rgba(15,23,42,.10), 0 8px 10px -6px rgba(15,23,42,.08)` | **Command Menu**、Dialog |
| `--ring-focus` | `0 0 0 2px var(--color-ring)` | 全局 focus ring |

### 5.4 层级（Z-index 刻度，🔸 落地细则，基线未定义）

| 层级 | 值 | 载体 |
|---|---|---|
| 页面内容 | `z-0` | 全部页面区块 |
| 固定导航 | `z-10` | Topbar（56px）、Sidebar |
| 浮层 | `z-50` | DropdownMenu、Popover、Tooltip |
| 抽屉 | `z-60` | Drawer（含 `--color-scrim` 遮罩） |
| 命令面板 | `z-70` | Command Menu（⌘K） |
| 全局反馈 | `z-80` | Toast |

---

## 6. 组件清单（Component Library）

> 核心组件（需求十九指定 6 类 + Badge）全量实现，规格要点引用 IA §4.5；`shadcn/ui` 标准集（🔸 追加）按需启用。组件命名 `PascalCase`（IA §0）。

### 6.1 核心组件（需求十九指定，全量实现）

| 组件 | 规格要点（IA §4.5 引用） | 页面示例 |
|---|---|---|
| `Card` | `--radius-lg`、`--shadow-xs`、`--space-4/5` padding；含 CardHeader / CardTitle / CardDescription / CardContent / CardFooter | 全站区块容器；Dashboard 四大工作流状态卡 |
| `Table` | 紧凑行高、表头 `--color-bg-subtle`、可排序、`tabular-nums`、空态/加载态、分页；操作列右对齐 | `/topics`、`/workflows/runs`、`/content`、`/github-weekly`、`/sources`、`/publications` |
| `Badge` | 软底变体 + 状态圆点；Priority 徽标（P0 红/P1 橙/P2 蓝/P3 灰）；status/type 徽标（见 §3） | 全站状态/优先级显性 |
| `Tabs` | 下划线式（`--color-primary-soft` 底），TabsList / TabsTrigger / TabsContent | Topic Detail 内分区、Detail 页视图切换 |
| `Drawer` | 右侧滑出、`--shadow-lg` + `--color-scrim`、**640px 宽**、可堆叠 | Run 详情、候选池（`event_pool`）、核验明细、来源详情（L3 详情承载，不新增路由，IA §1.3） |
| `Command Menu` | ⌘K 全局检索，`--shadow-xl` + `--radius-xl`，cmdk；索引 = Topic（topic_id/title）+ 批次 + 资产 + 导航 + 动作 | Topbar 常驻 |
| `Timeline` | 竖向时间轴（圆点 + 连线 + 时间戳 + 状态色），数据源 `audit_log` / `workflow_tasks` / 版本历史 | Topic Detail §3.14 历史记录、Runs Drawer |

### 6.2 基础/扩展组件（🔸 追加，shadcn/ui 标准集 + 专用件）

| 分组 | 组件 |
|---|---|
| 基础控件 | `Button`（primary/secondary/ghost/destructive）、`Input`、`Select`、`Textarea`、`Checkbox`、`Switch`、`RadioGroup`、`DropdownMenu`、`Popover`、`Dialog`、`Tooltip`、`Toast` |
| 结构件 | `Separator`、`Breadcrumb`、`Avatar`、`ScrollArea`、`Collapsible`、`Pagination`、`Skeleton`、`EmptyState` |
| 数据件 | `ProgressBar`（五维评分/衍生预算条）、`Sparkline`（按平台/周指标）、`KpiCard`（统计小卡）、`StatusDot`、`Tag`（可移除标签，`--radius-full`） |
| 专用件 | `PriorityBadge`（§3.3）、`LineageGraph`（🔸 血缘有向图，Topic Detail §3.7 专用：节点 = Topic 卡（topic_id + title + priority 色边），parent 实线 / source 虚线）、`Funnel`（🔸 转化漏斗条，Analytics / Topic Detail Metrics 专用：Read → CTA Click → Lead → Registration → Demo → Sales Lead → Deal → Revenue） |

### 6.3 组件 → 页面映射（落地矩阵，🔸 依据 IA §4.5 页面示例展开）

| 页面 | 主导组件组合 |
|---|---|
| `/dashboard` | `KpiCard` 行 + `Card`（四工作流状态卡）+ `Button`（两主 CTA）+ 审查队列 `Table` + `Timeline`（最近 Runs）+ `Sparkline`/雷达图 |
| `/topics` | `FilterBar`（Input + Select + Tabs）+ `Table`（含 `PriorityBadge` + `ProgressBar` 五维条）+ 批量操作栏 + 候选池 `Drawer` |
| `/topics/[id]` | `Tabs` + 14 区块 Card + `LineageGraph` + `Table`（Source Packet 明细 / Workflow Runs / Assets）+ `Funnel` + `Timeline`（历史记录）+ CTA `Card` |
| `/workflows` | `Card`（5 类型）+ `Table`（模板版本 / 路由规则 / 批次列表）+ 操作区 |
| `/workflows/runs` | `FilterBar` + `Table`（Runs）+ Run 详情 `Drawer`（tasks `Timeline` + outputs `Table` + `parent_run_id` 调用树） |
| `/content` | `FilterBar` + `Table` + 待审核队列 + 批量操作 |
| `/content/[id]` | 资产信息头 `Card` + 编辑/预览 `Textarea` + 版本历史 `Timeline` + CTA 面板 + 审核操作按钮组 |
| `/knowledge` | 知识网格/`Table` + concept 图 + 衍生预算 `ProgressBar`（round_index 1..3）+ 开采操作 |
| `/github-weekly` | 周选择器 + 快照列表 `Table`（frozen 锁标识）+ items `Table` + Original/Replay 操作 |
| `/sources` | 三层 `Table`（sources / source_packets / source_packet_items）+ 冲突处理面板 `Card` |
| `/assets` | 素材网格 + `Badge`（ai_policy）+ Logo 保护标识 + 上传操作 |
| `/publications` | `FilterBar` + `Table`（status 徽标）+ 待发布队列 + 人工发布操作 |
| `/analytics` | `KpiCard` 行 + `Funnel` + 维度下钻 `Table`/`Sparkline` + Leads 池 `Table` |
| `/settings` | 配置表单（`Input`/`Select`/`Switch`）+ `Table`（路由规则 / Prompt 模板）+ 集成配置 |

### 6.4 交互与视觉规则（IA §4.5 引用）

- 大面积留白避免装饰性渐变/重阴影；状态通过 Badge + 颜色双重编码（不单靠颜色）。
- 表格与卡片为主叙事，图表仅用于 Metrics / Analytics / 血缘。
- 所有可点击项有 hover 反馈（`--color-bg-hover` / `--color-primary-hover`）；全局 focus ring 用 `--ring-focus`。
- 审核/发布动作按钮带"人工"标识（IA §6-5，见 DS-6）。

---

## 7. 页面骨架（Page Skeleton）

### 7.1 AppShell 三层骨架（IA §4.4 引用，D1 落地）

| 区域 | 尺寸 | 内容 |
|---|---|---|
| Sidebar（左侧导航） | 桌面 240px，可折叠为 64px 图标栏；移动端折叠为 Drawer | 品牌区、L1 主导航树（总览 / 生产 / 数据 / 系统四组）、底部当前周/用户区 |
| Topbar（顶部栏） | 56px | 面包屑（L1 / L2 / [id]）、全局 Command Menu 触发（⌘K）、当前内容周选择器、审核待办铃铛、用户菜单 |
| Content（内容区） | 剩余视口，垂直滚动 | 页面级骨架（§7.2） |

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

### 7.2 页面级骨架规范（PageLayout，IA §4.4 细化）

| 部件 | 规格 |
|---|---|
| PageHeader | 标题 `--text-lg`/`--text-xl`（18-20px）+ 副标题（一句话职责，`--color-fg-muted`）+ 右侧操作区（主 CTA 用 `--color-primary` 实底按钮，次操作 ghost/outline） |
| Toolbar / FilterBar | Input 搜索、Select 过滤、Tabs 切换，紧凑；筛选状态可一键清空 |
| Section | 内容以 Card 分组；列表类优先 Table；详情类用信息卡网格 + Drawer 承载次级视图；Section 间距 `--space-6`（24px） |
| 三态 | 加载 = `Skeleton`（保持布局稳定）；空态 = `EmptyState`（图标 + 说明 + 引导 CTA，如 `/topics` 空态 CTA = 「新建 Topic / 生成内容计划」）；错误 = 错误卡片 + 重试按钮。**禁止空白页** |
| 响应式 | 桌面 3 栏 → 平板 2 栏 → 移动端单栏；Sidebar 折叠为 Drawer；Table 降级为 Card 列表；V1 以桌面为第一优先级 |

### 7.3 关键页面骨架示例（应用以上规则）

- **`/dashboard`**：PageHeader（主标题 + 两个主 CTA）→ KPI 行（6 卡：P0 数 / P1 数 / 待审核 / 待发布 / 已发布 / Leads·Demo·Consultation）→ 四大工作流状态卡 → 待办审查队列 Table → 最近 Runs Timeline → 趋势雷达图（`trend_radar` 按周聚合）。
- **`/topics/[id]`**：顶部信息头（可固定）+ 主体两栏（左主列 = 14 区块顺序 Card；右侧栏 = CTA 与血缘摘要），区块阅读顺序严格按 IA §3 第 1-14 顺序，**不得重排/删节**（DC-35）。
- **`/workflows/runs`**：FilterBar（`workflow_type_key` / `status` / `batch_id` / `week` / Topic）→ Runs Table → 行点击打开 Run 详情 Drawer（tasks Timeline + outputs + 调用树）。

---

## 8. 落地检查清单（供 D1 及 D4-D8 引用）

| # | 检查项 | 判定标准 | 关联任务 |
|---|---|---|---|
| 1 | Token 与基线一致 | `--color-*` / `--space-*` / `--radius-*` / `--shadow-*` / `--text-*` / `--font-*` 值与 IA §4.1-§4.3 逐项一致，无改动 | D1 |
| 2 | Priority 徽标 | P0 红 `#DC2626` / P1 橙 `#EA580C` / P2 蓝 `#2563EB` / P3 灰 `#64748B`，软底 + 前景 + 文案三要素 | D1、D4、D5 |
| 3 | 三态生效 | 14 路由占位页均有 Skeleton / EmptyState / Error；无空白页 | D1 |
| 4 | AppShell 尺寸 | Sidebar 240px（折叠 64px）、Topbar 56px；移动端折叠为 Drawer | D1 |
| 5 | 枚举徽标中英双显 | 状态/类型徽标文案 = 中文标签 + 英文 value（与数据模型 §1 完全一致） | D4-D8 |
| 6 | 人工门禁显性 | 审核/发布按钮带"人工"标识；动作落 `audit_log`；无绕过路径 | D8、D14 |
| 7 | 六类核心组件齐备 | `Card`/`Table`/`Badge`/`Tabs`/`Drawer`/`Command Menu`/`Timeline` 全量实现且规格达标 | D1 起 |
| 8 | 图表克制 | 图表仅出现在 Metrics / Analytics / 血缘（`Funnel`/`Sparkline`/`LineageGraph`/雷达图） | D4、D5、D15 |

---

## 9. Open Questions（本文档悬而未决的问题）

> 编号 `OQ-DS-xx`，与 roadmap 基线 `OQ-xx`、02 文档 `OQ-IA-xx` 并行编号（本文档专属）；确认后回写本文档，不修改基线文件。

| 编号 | 问题 | 影响范围 | 推荐方案 |
|---|---|---|---|
| OQ-DS-01 | 深色主题启用时机（IA §4.1 已同构预留 Dark 值，需求未要求）：V1 首发即提供，还是 M5 后追加？ | D1、主题实现 | 推荐 V1 仅浅色，深色放 M5 后（对齐 DC-37） |
| OQ-DS-02 | 图表视觉规范（雷达图/Sparkline/Funnel 的色板、网格线、空数据表现）基线未定义：是否沿用 `--color-primary` 单色 + `--color-border` 网格？ | D4 区块 6、D15 | 推荐主序列 `--color-primary`，第二序列 `--color-success`/`--color-warning` 仅用于对比（如跨周）；空数据 = 灰虚线占位（🔸） |
| OQ-DS-03 | ⌘K Command Menu 的"动作"清单未在基线定义（IA §4.5 仅写"导航 + 动作"）：V1 支持哪些动作？（与 OQ-IA-02 同源） | D1、D4 | 推荐 V1 动作 = 两个 Dashboard CTA（生成本周内容计划 / 确认并开始生产）+ 跳转当前周批次 + 打开候选池 Drawer |
| OQ-DS-04 | `topic_type` / `asset_type` 徽标是否语义着色：本文档 §3.2 推荐 outline 中性（避免与状态色竞争），是否确认？ | D4、D7 | 推荐 outline 变体 + 文案双显；如需区分可加 `--color-primary-subtle` 底（🔸） |
| OQ-DS-05 | 表格分页默认页大小与虚拟滚动阈值：基线未定义（IA §4.5 仅"可排序 + 分页"）。 | D4、D7、D15 | 推荐默认 50 行/页（高密度）；>500 行启用虚拟滚动（🔸） |
| OQ-DS-06 | 中文字体加载策略：`--font-sans` 含系统苹方回退，是否需自托管 Inter/思源 webfont（许可与体积）？ | D1 | 推荐 V1 系统字体栈直接生效，不自托管；若品牌一致性要求高再评估 |
| OQ-DS-07 | 移动端验收边界（与 OQ-IA-08 同源）：14 页 Table → Card 降级深度与断点（🔸 建议 lg 992px）？ | D1、D4-D8 | 推荐 M1 仅要求"可浏览 + 无阻断"，完整移动端适配放 M5 后评估 |
| OQ-DS-08 | 空态/错误态文案与引导 CTA 的文案规范（copy 语气）基线未定义：是否需要统一文案模板（如「暂无 Topic，生成本周内容计划」）？ | 全部页面 | 推荐 §7.2 三态基础上，各页空态文案随 D4-D8 逐页确认（🔸） |

---

## 附录 A：本文档引用基线一览（对齐声明）

| 本文档章节 | 引用基线 | 一致性要求 |
|---|---|---|
| §1 设计原则 | 需求十九；IA §4 头注、§4.1/§4.4/§4.5、§6；数据模型 §2.8 | 三色体系、状态显性、人工门禁与基线一致 |
| §2 色彩系统 | IA §4.1（全部 token 值） | 值与基线逐项一致，不改动 |
| §3 徽标规范 | 需求十九；IA §4.1/§4.5；数据模型 §1 全部枚举 | 枚举 value 以数据模型为准；色值以 IA 为准 |
| §4 字体 | IA §4.2 | 字体栈、字号、字重与基线一致 |
| §5 间距/圆角/阴影 | IA §4.3 | token 值与基线一致 |
| §6 组件清单 | 需求十九；IA §4.5 | 六类核心组件全量实现；规格不缩水 |
| §7 页面骨架 | IA §4.4；workflow §2；roadmap D1 | AppShell 尺寸、三态、14 路由骨架一致 |
| §8 检查清单 | roadmap §3（D1 验收标准） | 判定标准可执行 |
| §9 Open Questions | IA §6、roadmap §5（OQ 并行体系） | 本文档问题以 OQ-DS-xx 编号，不覆盖基线 OQ-xx |
