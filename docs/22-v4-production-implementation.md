# 22 · V4 Production Readiness 实现说明

> V4 目标（规格）：把系统修到「真实运营人员可以连续每周使用」。本文记录 8 个 Phase 的实现地图、
> 数据模型变更、配置项与关键设计决策。验收结果见 docs/23。

## 1. 验收目标对照（5 条）

| # | 验收目标 | 状态 | 证据 |
|---|---|---|---|
| 1 | 真实小豆芽导出数据完成回流 | 代码链路 READY，待真实文件 | CSV 导入生产化（编码检测/行级错误/匹配链全实现并脚本级验证）；**BLOCKED_BY_REAL_DATA** |
| 2 | 四个 AI Workflow 真实产出 | 代码链路 READY，待 API Key | 韧性层+质量 Gate+成本留痕实现；无 Key 时诚实显示演示模式；**BLOCKED_BY_REAL_DATA** |
| 3 | 至少一种内容类型完整发布包 | **PASS** | GitHub 周榜包：生成→QA 门禁→视觉挂载→ready→published 全流程 E2E PASS |
| 4 | 发布数据回流形成 Topic Performance | 代码链路 READY（V3 已实现），匹配链升级 | external_post_id→URL→平台+时间→标题→人工 五级匹配 + match_method 留痕 |
| 5 | 下周计划读取真实上周数据 | READY + 冷启动保护 | data_confidence 四档；数据不足时明确提示推荐依据 |

## 2. Phase 实现地图

### Phase 1 · Migration 0005/0006/0007 + Schema
- **新表**：`publish_packages`（发布包，21 列 + QA 三态 + 快照绑定）、`action_items`（统一待办，来源标记 + 自动 resolve）、`content_acceptance_stats`（按 workflow+周期验收统计）
- **data_source 标记**（规格 §20）：`external_posts` / `post_metric_snapshots` / `account_metric_snapshots` / `topic_performances` / `topic_performance_scores` / `content_assets` / `brand_assets` / `publications` 全部加 `data_source` 列（seed/manual/xiaodouya_import/workflow/user_input/historical_import）
- **匹配元数据**：external_posts 加 `match_method` / `matched_at` / `manual_confirmed_by` / `historical_import`
- **导入批次**：data_import_batches 加 `file_hash`（重复检测）/ `data_type` / `file_headers` / `failed_row_data`（结构化失败行）/ `historical_import`
- **AI 留痕**：ai_usage_logs 加 `provider` / `model` / `retry_count` / `prompt_version`；workflow_runs 加 `needs_manual` / `retry_count`；workflow_tasks 加 `retry_count`
- **品牌资产**：brand_assets 加 `locked`（锁定禁止 AI 替换）；brand_asset_type 枚举 + `cover` / `card`
- **Seed**：全部 seed 数据标记 `dataSource='seed'`（live 模式排除的依据）

### Phase 2 · CSV 导入生产化（规格 §15-§19/§21）
- **编码检测**：UTF-8 BOM → UTF-8 严格解码 → 替换符计数 vs GB18030，取替换符更少者（`readCsvFile` 返回 text/encoding/sha256）
- **行级错误**：失败行 `{rowIndex, row, error}` 结构化落库 `failed_row_data`；批次状态 completed/partial/failed
- **Retry Failed Rows**：按批次读回失败行重建 CSV 重跑（不传 fileHash 避免命中自身被重复检测跳过）
- **Export Failed Rows**：`GET /api/connectors/export-failed-rows?batchId=` CSV 下载（UTF-8 BOM）
- **历史导入模式**：勾选后 external_posts 标 `historical_import=1` + `data_source='historical_import'`；无 Publication 不算失败行
- **重复检测**：同 SHA-256 + 同 data_type 已完成批次 → 跳过并通知（不静默）
- **解析增强**：`parseNumber` 支持 千分位/万/亿/k/m；`parseDate` 支持 Excel 序列号/Unix 秒毫秒/ISO/斜杠/中文日期
- **匹配优先级链**（§21）：`external_post_id`（已确认绑定）→ `external_url` 精确 → `platform_time`（平台+账号+发布时间 ±1 天）→ `title_similarity`（平台+账号+标题 ≥4 字）→ manual；每次命中写 match_method + matched_at；人工匹配写 manual_confirmed_by='user'

### Phase 3 · AI Provider Resilience（规格 §9/§10/§12）
- **chatResilient**：超时（AI_TIMEOUT_MS 默认 90s，AbortSignal）→ 指数退避重试（AI_MAX_RETRY 默认 2 × AI_RETRY_DELAY_MS 2s）→ Provider Fallback（anthropic → content_api → openai → deepseek 按配置自动组成链）
- **状态留痕**：primary_success / fallback_success / failed；全链失败抛 `AiResilienceError` → run 标 `needs_manual=true`（不是静默失败）
- **成本**：按 token 估算（MODEL_PRICES 内置表 + AI_PRICES 覆盖），写 ai_usage_logs.cost
- **质量 Gate**（`src/lib/workflows/quality-gate.ts`）：空输出/过短、标题缺失、CTA 数量（0 或 >8）、来源包引用、Topic 关联、违禁词（默认 9 词 + AI_FORBIDDEN_WORDS 追加）、预览冒充 GA——不通过 → run 状态 `needs_review`（内容保留人工审，不静默丢弃）
- **幂等重试**：`retryWorkflowRun` 复用原 run（同 run_id/batchId），retry_count+1；已写回产物跳过 writeback（writebackDone 标记）防重复创建 Derived Topic/Content Asset
- **验收统计**：writeback 记 generated；审核通过记 approved_directly（无人工编辑版本）/ approved_after_edit（有人工编辑版本，检测 content_versions.createdBy='user'）；打回记 rejected + revision_count

### Phase 4 · Publish Package（规格 §13-§18）
- **GitHub 周榜包**（`src/lib/services/publish-package.ts`）：确定性组装（数字全部来自快照，不编造）：总榜文案 + 5 项目文案 + 极简提纲 + 平台标题 + 标签 + CTA + 图片顺序 + Snapshot_ID/Period 绑定；同快照幂等
- **状态机**：draft → needs_assets → needs_review → ready → published；门禁：进 QA 需 ≥2 视觉资产；ready 需 QA 三项（fact/brand/content）全 passed；published 仅从 ready
- **品牌资产中心**（/publish-packages/assets）：上传（写 public/uploads + 留痕）/预览/启用停用/锁定（locked 后禁止替换与停用）/被发布包引用；正式 Logo 约定人工上传并锁定

### Phase 5 · Live Mode + 冷启动 + Action Center（规格 §19/§20/§25/§26）
- **APP_MODE**（`src/lib/services/live-mode.ts`）：development（默认）/ live；live 模式 Performance Feedback 排除 `data_source='seed'`；UI 显示当前模式
- **数据置信度**（`data-confidence.ts`）：真实快照 + 表现×2 + 发布×3 综合信号量 → insufficient/low/medium/high（DATA_CONFIDENCE_THRESHOLDS 可配）；不足时 Dashboard + Weekly Plan 显示「数据不足，当前建议主要依据趋势与内容价值」
- **Action Center**（`action-items.ts`）：7 类来源推导应有动作（weekly_plan/workflow/review/publication/connector/data_quality/指标过期），与 action_items 表 diff——新增缺失、条件消失自动 resolve、人工 dismiss；Dashboard 首屏「今天需要处理什么」
- **归因冷启动**：周期快照数/候选作品低于阈值（ATTRIBUTION_MIN_SNAPSHOTS=2 / ATTRIBUTION_MIN_CANDIDATES=1）→ run 状态 `insufficient_data`（不是 failed，不产生误导性归因）

### Phase 6 · Auth + Readiness + Scheduler 诚实状态（规格 §28-§29）
- **最小 Auth**：AUTH_PASSWORD_HASH（sha256，推荐）/ AUTH_PASSWORD；会话 = HMAC-SHA256 签名 cookie（7 天，httpOnly）；`src/proxy.ts`（Next.js 16：Middleware 已更名 Proxy，Node runtime）保护除 /login、/api/auth、/api/cron、静态资源外全部路由；未配置凭证时放行（开发模式）但 readiness 标记
- **/system/readiness**：Critical（DB/迁移/认证/模式标记/发布包）+ Required（AI Provider/调度端点/数据回流/导入容错）+ Optional（飞书/备份）；任一 Critical FAIL → **NOT READY** 横幅
- **Scheduler 诚实状态**：设置页明示「Scheduler Endpoint Ready / External Cron Not Configured」；/api/cron/scheduler 配置 CRON_SECRET 后强制校验（header 或 query）
- **出站通知**：FEISHU_WEBHOOK_URL 配置后 notify() 同步推送飞书文本消息（5s 超时，失败静默不阻断站内通知）

### Phase 7 · Backup + Data Export（规格 §27/§31）
- **scripts/backup-db.sh**：docker exec pg_dump → gzip → backups/（保留 14 份，BACKUP_KEEP 可调）
- **scripts/restore-db.sh**：默认恢复到验证库 contentos_restore_test（不动主库、自动校验行数）；--write 才写主库（10s 反悔窗口）
- **实测**：backup 40K → restore 61 表 → topics=8 / post_metric_snapshots=6 与主库一致 → PASS（docs/20 有记录）
- **Data Export**：`GET /api/export?type=topics|publications|topic_performance|social_metrics` CSV（设置页入口，Proxy 统一鉴权）

## 3. 环境变量清单（全部可选，见 .env.example）

| 变量 | 默认 | 说明 |
|---|---|---|
| APP_MODE | development | live 排除 seed 数据 |
| AI_TIMEOUT_MS / AI_MAX_RETRY / AI_RETRY_DELAY_MS | 90000/2/2000 | AI 韧性三参 |
| AI_PRICES | 内置表 | token 价格覆盖 |
| AI_FORBIDDEN_WORDS | 内置 9 词 | 违禁词追加 |
| DATA_CONFIDENCE_THRESHOLDS | 5/20/50 | 冷启动阈值 |
| ATTRIBUTION_MIN_SNAPSHOTS / _CANDIDATES | 2/1 | 归因冷启动阈值 |
| AUTH_PASSWORD_HASH / AUTH_PASSWORD / AUTH_SECRET | 未配置 | 登录认证（LIVE 必配） |
| CRON_SECRET | 未配置 | cron 端点保护 |
| FEISHU_WEBHOOK_URL | 未配置 | 出站通知 |

## 4. 关键设计决策

1. **重复文件跳过而不是报错**：幂等已保证不重复建数据，但运营需要知道"发生了什么"——跳过时发通知说明命中已有批次。
2. **质量 Gate 不通过 → needs_review 而不是丢弃**：内容保留，人工判断去留；机器只拦截，不销毁。
3. **重试失败的导入批次不传 fileHash**：避免同内容批次被重复检测跳过（重试的对象就是失败行本身）。
4. **归因 insufficient_data ≠ failed**：数据不足是正常状态，标记后补数据重跑即可，不触发失败告警。
5. **GitHub 周榜包用确定性组装而非 AI 成文**：榜单数字来自快照，模板化组装保证零编造；AI 润色是未来可选增强。
6. **发布包视觉至少 2 个才能进 QA**：封面 + ≥1 卡片，保证"完整发布包"的最低可用性。
