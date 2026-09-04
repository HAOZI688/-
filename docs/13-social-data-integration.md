# 13 小豆芽数据集成（Social Data Integration）

> **状态**：V1 已实现（docs 系列第 13 份）。
> 本文档记录「小豆芽数据回流」模块的设计决策、实现现状与验收要点。
> 事实源：`docs/_canonical-data-model.md`（表结构）、`docs/_canonical-workflow.md`（流程契约）。

---

## 1. 定位与原则

小豆芽是内容数据回流的核心来源：平台作品的播放/互动/转化数据经由小豆芽导出后回灌本系统，用于 **Topic 表现分析 → 下一轮选题反馈**（闭环末端，规格 §45）。

| # | 原则 | 落地 |
|---|---|---|
| 1 | **不假设存在公开 API** | V1 采用 **File Import 模式**（CSV 导入），预留 API Mode 只替换实现、不动表结构 |
| 2 | **数据留痕** | 每次导入生成 `data_import_batches` + `audit_logs` 记录，批次可回溯 |
| 3 | **作品必须与 Publication 匹配** | `external_posts.match_status` 四级：`unmatched → suggested → confirmed → conflict` |
| 4 | **指标必须映射** | 小豆芽原始列名 ≠ 系统标准指标，经 `metric_mappings` 映射（规格 §39） |
| 5 | **快照只增不改** | T+1/T+3/T+7/T+30 存 `post_metric_snapshots`，禁止覆盖最终值 |
| 6 | **所有指标绑定 Topic_ID** | `post_metric_snapshots.publication_id → publications.topic_id` |

## 2. 连接器模式（规格 §34）

| 模式 | 状态 | 说明 |
|---|---|---|
| File Import（CSV） | ✅ V1 已实现 | `src/lib/connectors/xiaodouya.ts` + 自有 RFC 4180 解析器 `csv.ts`（零第三方依赖） |
| Manual | ✅ V1 已实现 | `data_connectors` 预留 `manual` 类型 |
| API Mode | ⏳ V2 预留 | `data_connectors.config` 存凭据/端点，只替换 `importPostsCsv` 实现 |

## 3. 表与职责（规格 §34-§43）

| 表 | 职责 | 关键字段 |
|---|---|---|
| `data_connectors` | 连接器主档 | `connector_type`(xiaodouya/csv_import/manual/future_api)、`status`、`config` jsonb |
| `connector_accounts` | 连接器×社交账号映射 | `mapping_status`(unmapped/mapped/conflict) |
| `external_posts` | 平台侧作品原始记录 | `external_post_id`、`match_status`、`match_confidence`、`raw_data` |
| `data_import_batches` | 导入批次留痕 | `status`(uploaded→…→completed/failed)、成功/失败行数、`error_log` |
| `data_sync_jobs` | 同步任务记录 | `sync_type`(post/account/full/import)、读写失败计数 |
| `metric_definitions` | 标准指标主档 | 12 个标准 key（impressions/views/likes/…/five_second_retention） |
| `metric_mappings` | 来源列→标准指标 | `source_field`(如「播放量」)→`metric_key`(views) |
| `post_metric_snapshots` | 作品指标快照（T+1/3/7/30） | `captured_at` 索引，`raw_metrics` 保留原始行 |
| `account_metric_snapshots` | 账号级快照 | 粉丝/新增/主页访问，支撑「某天发什么→账号涨粉」分析 |

## 4. 导入流水线（importPostsCsv）

```
CSV 文件 → parseCsv（RFC 4180，UTF-8 BOM 剥离）
  → 必需字段校验（作品ID/作品标题/发布时间）
  → 导入批次创建（status=uploaded）
  → 账号名匹配 connector_accounts（→ mapped / unmapped）
  → external_posts upsert（external_post_id 幂等）
  → matchPublication（四步匹配，见 §5）
  → createPostSnapshot（T+1 基线快照）
  → 批次置 completed + audit_logs（data_import）
```

**入口**：`/data-import`（拖拽/选择 CSV）→ `src/app/actions/import.ts`（server action）。

**幂等**：以 `external_post_id` 为主键 upsert，重复导入不产生重复行。

## 5. 匹配规则（规格 §37）

| 优先级 | 规则 | 说明 |
|---|---|---|
| 1 | 已确认（match_status=confirmed） | 直接沿用历史确认结果 |
| 2 | URL 精确匹配 | `external_url` = `publications.published_url` → confirmed |
| 3 | 平台+账号+标题匹配 | `publications.platform` + `social_account_id` + 标题比对 → suggested |
| 4 | 无匹配 | unmatched，人工在 `/connectors/xiaodouya` 页面确认（confirmExternalPostMatch） |

## 6. 快照策略（规格 §40）

- 导入时生成 **T+1 基线快照**；
- T+3/T+7/T+30 由后续同步任务补充（`data_sync_jobs`，V1 支持手动触发/后续 cron）；
- `post_metric_snapshots` 的 `captured_at` 决定快照批次，分析聚合按时间窗取数。

## 7. 验收要点

| 编号 | GWT | 状态 |
|---|---|---|
| 13-1 | Given 合法 CSV；When 导入；Then external_posts 入库、批次 completed、audit 记录、T+1 快照生成 | ✅ seed + 手动演练 |
| 13-2 | Given 缺必需字段；When 导入；Then 批次 failed、失败行计数、无脏数据 | ✅ 校验逻辑 |
| 13-3 | Given 已存在 external_post_id；When 重复导入；Then upsert 不重复建行 | ✅ |
| 13-4 | Given 有已发布 publication 且 URL 相同；When 导入；Then match_status=confirmed | ✅ |
| 13-5 | Given 未匹配作品；When 人工确认；Then match_status 更新 + audit | ✅ `/connectors/xiaodouya` |

## 8. 已知限制与后续

- V1 仅 CSV（xlsx 依赖被安全分类器阻断后，自研 CSV 解析器兜底——见 `src/lib/connectors/csv.ts`）；
- API Mode（规格 §35「未来 API 连接器」）在 V2 按同一表结构替换实现；
- 账号级数据（粉丝/主页访问）依赖小豆芽账号导出 CSV，V1 提供对应模板位。
