# 10. API 契约（API Contract）

> **状态**：本文件是项目 **API 层（REST 端点 / 请求响应 / 错误码 / 分页过滤排序 / 鉴权 / 实时）的正式文档**，供 00-product-vision … 12-roadmap 中的后端实现、D1-D10 任务与前端数据契约引用。
> **事实源（唯一裁决依据，开始实现前必须对齐）**：
> - 字段命名、类型、枚举取值 → `docs/_canonical-data-model.md`
> - 工作流行为契约（run/批次状态机、Orchestrator 12 步、产物契约、AI 三层抽象）→ `docs/_canonical-workflow.md`
> - 页面结构、路由、区块顺序 → `docs/_canonical-ia.md`
> - MVP 范围与阶段 → `docs/_canonical-roadmap.md`；需求原文 → `docs/_requirements.md`
> - 冲突时以数据模型基线为裁决依据，其次工作流基线；本文件**只追加 API 层约定，不改动任何基线字段/枚举/路由/状态**。
> **约定**：正文中文，标识符、枚举、列名一律用基线英文值；本文档新增的、基线上无对应定义的 API 约定统一标注 🔸，并在文末 §18 汇总（对应任务返回值的 `deviationsFromCanonical`，均带 `[REVIEW]`）。

---

## 1. 总体约定

### 1.1 Base URL 与版本

- 技术基线：Next.js App Router（Supabase）。API 走 Next.js Route Handlers，统一前缀：
  ```
  /api/v1/...
  ```
- V1 固定版本 `v1`（🔸：版本策略，见 §17 OQ-API-1）。生产环境 Base URL 形如 `https://<project-ref>.supabase.co/...` 或自托管域名，由部署环境变量 `API_BASE_URL` 提供。
- 请求/响应媒体类型：`application/json; charset=utf-8`。
- 所有写操作请求体为 JSON 对象；字段名与数据模型基线列名完全一致（snake_case）。
- 列表响应信封（§3.5）与错误响应信封（§4.3）为全站唯一格式，不得另造。

### 1.2 标识符与 ID 格式

| 类型 | 格式 | 来源 |
|---|---|---|
| 内部主键 `id` | `uuid`（`gen_random_uuid()`） | 数据模型 §0 |
| 业务 ID `topic_id` | `^[0-9]{4}W[0-9]{2}-[0-9]{3}$`，如 `2026W36-001` | 数据模型 §2.1 |
| `batch_id` | `{ISO周}-{WORKFLOW_KIND}`，重跑追加 `-NN` | 数据模型 §2.2 |
| `run_number` | `{batch_id}-R{NN}`，如 `2026W36-AI-WEEKLY-R01` | 数据模型 §2.2 |
| `snapshot_id` | `{ISO周}-GH-{ORIGINAL\|REPLAY}-{PURE\|VALUE_FILTERED\|MIXED}` | 数据模型 §2.2 |
| `candidate_id` | `{ISO周}-AI-CAND-{NNN}` | 数据模型 §2.2 |
| `packet_id` | `{topic_id}-SP` | 数据模型 §2.2 |
| 时间戳 | ISO 8601 / RFC 3339 UTC，如 `2026-09-04T02:00:00Z`（`timestamptz`）；纯日历日 `date` 用 `YYYY-MM-DD` | 数据模型 §0 |

- 路径参数 `:id` 一律接受**内部 uuid**；`topics` 资源额外接受 `topic_id` 业务 ID 双键查找（🔸：查询实现为 `id = $1 OR topic_id = $1`，用 `UNIQUE(topic_id)` 保证唯一）。业务 ID 展示时优先 `topic_id`（IA §1.3 双显约定）。

### 1.3 幂等与并发

- **`workflow_outputs.applied` 幂等**（基线 §3.3 产物契约）：`POST /api/v1/workflow-outputs/:id/apply` 同一产物重复调用**不产生二次副作用**，返回 `200` 且响应体携带 `"already_applied": true`（含首次 `applied_at`）。仅首次调用执行回写。
- **`Idempotency-Key` 请求头**（🔸）：`POST` 创建类端点（topics、workflow-runs、event-pool、publications、content-metrics 批量）支持可选 `Idempotency-Key: <uuid>`；同 key 重复请求返回首次结果，服务端以 `(key, endpoint)` 落 `audit_log` 幂等表。
- **乐观锁（可选，🔸）**：`PATCH` 支持 `If-Match: <updated_at>`（RFC 7232），不匹配返回 `412 Precondition Failed`；V1 可不强制，服务端以最后写为准并写 `audit_log`。

### 1.4 本文档新增约定（🔸 汇总，详见 §18）

分页/过滤/排序语法（§3）、错误码体系（§4）、认证接入（§2）、实时方案（§16）、字段裁剪（§3.4）、若干端点的守卫细节，均为基线未定义、由本文档补全的落地约定。

---

## 2. 认证与授权（Supabase Auth）

### 2.1 认证流程

技术基线为 Supabase（Database/Auth/Storage，需求十六）。API 消费 Supabase Auth 签发的 JWT：

1. 客户端调用 Supabase Auth 端点获取会话（V1 推荐单账号 email/password 或 magic link；对应路线图 OQ-04，确认前以推荐方案为准）：
   ```
   POST {SUPABASE_URL}/auth/v1/token?grant_type=password
   ```
2. 成功后获得 `access_token`（JWT）与 `refresh_token`。
3. 之后所有 `/api/v1/*` 请求携带：
   ```
   Authorization: Bearer <access_token>
   ```
4. 服务端 Route Handler 校验：
   ```typescript
   // supabaseAdmin.getUser(token) 或 supabase.createServerClient() 的 auth.getUser()
   const { data: { user } } = await supabase.auth.getUser(token);
   // 无效/过期 → 401 ERR_UNAUTHENTICATED
   ```

### 2.2 actor 与审计关联（基线 §3.9 / §2.8）

- 人工动作：`audit_log.actor = auth.user.id`（Supabase 用户标识）。
- AI/工作流动作：`audit_log.actor = 'ai:run-' + workflow_runs.id`（如 `ai:run-0192f6c4-...`）。
- 写操作服务端**强制**在事务内写 `audit_log`；不存在绕过 `audit_log` 的状态变更路径（基线 §2.8，硬性 Exit 约束）。

### 2.3 权限模型（V1）

- V1 单用户、无复杂 RBAC（DC-06，路线图 §1.2）：认证即授权，无角色矩阵；`/settings` 用户/权限区仅预留。
- **"仅人工"端点**（基线 §2.8：`publications.status='published'` 仅人工触发）：服务端校验请求必须来自**人工会话**（JWT 用户），工作流内部代码禁止调用这些 HTTP 端点（工作流写 `planned → ready` 走服务函数，不经人工端点）。违规一律 `403 ERR_PUBLISH_NOT_ALLOWED`。
- 若 OQ-04 确认"无鉴权单用户"：所有端点放行，`actor` 固定为 `manual-user`；本文件其余鉴权描述自动降级为旁路（🔸 待确认）。

### 2.4 RLS 建议（🔸 实现建议，待实现阶段确认）

- 建议所有表开启 RLS，V1 策略从简：`authenticated` 可读写、`anon` 全部拒绝；服务端以 `service_role` key 执行内部写（触发器等）。
- 核心业务守卫（frozen 快照、published 仅人工、衍生预算、防环）以**应用层服务函数 + DB 触发器**为准（基线已定义），不依赖 RLS 表达业务规则。

---

## 3. 通用行为：分页 / 过滤 / 排序（🔸 本文件定义，基线未规定）

### 3.1 分页

- 查询参数：`limit`（默认 20，最大 100）、`cursor` 或 `offset`。
- 推荐 **cursor（keyset）分页**：`cursor` 为不透明 base64（编码 `(id, 排序键)`），按 `sort` 排序键取值；无 `cursor` 为第一页。
- `offset` 分页保留用于兼容（管理后台）。
- 响应 `meta`：
  ```json
  {
    "data": [ ... ],
    "meta": {
      "total": 128,          // 仅 include_total=true 时计算
      "limit": 20,
      "next_cursor": "eyJpZCI6InV1aWQ4In0",
      "has_more": true
    }
  }
  ```
- 默认排序：`created_at DESC`。

### 3.2 过滤

- 精确匹配：`?status=Draft`。
- OR 匹配：逗号分隔 `?status=Draft,Review`（URL 编码，含空格的枚举值如 `Ready for Production` 编码为 `Ready%20for%20Production`）。
- 区间：`{field}_from` / `{field}_to`（含边界），如 `?metric_date_from=2026-09-01&metric_date_to=2026-09-07`。
- 关键词：`?search=agent skills`（作用字段见各资源说明，通常 `title` / `topic_id` / 业务 ID）。
- 布尔：`?include_total=true` 等字面量。

### 3.3 排序

- `?sort=field` 升序；`?sort=-field` 降序；逗号分隔多级 `?sort=-priority,updated_at`。
- 排序字段白名单 = 该表可排序列（见各资源）；非法字段 → `400 ERR_VALIDATION`。
- `priority` 按**语义序**排序（P0 > P1 > P2 > P3），实现为 `CASE priority WHEN 'P0' THEN 0 ... END`（🔸）；`status` 类枚举按基线定义序（topic_status 按 9 态顺序）。
- NULL 值一律 `NULLS LAST`。

### 3.4 字段裁剪（🔸）

- `?fields=id,topic_id,title,status`：列表/详情响应仅返回指定列，减负载；非法列名 → `400`。
- 缺省返回该表全量列。

### 3.5 列表响应信封

- 列表端点统一返回 `{ "data": [...], "meta": {...} }`；单资源端点直接返回资源 JSON（无信封）；动作端点返回动作结果 JSON。
- 关联资源默认**不内联**（血缘、source packet、workflow runs 用子端点按需取），保持响应稳定。

---

## 4. 状态码与错误码

### 4.1 HTTP 状态码总表（🔸 映射约定）

| HTTP | 语义 | 典型场景 |
|---|---|---|
| `200 OK` | 成功读取/更新/动作 | GET / PATCH / apply（含幂等重放） |
| `201 Created` | 创建成功 | POST topics / event-pool / publications |
| `202 Accepted` | 异步任务已受理 | POST workflow-runs（Orchestrator 触发） |
| `204 No Content` | 删除成功 | DELETE topic-relations / source-packet-items |
| `400 Bad Request` | 请求格式/参数错误 | 非法 filter 字段、limit 超界、JSON 语法错误 |
| `401 Unauthorized` | 未认证/token 失效 | Authorization 缺失或 JWT 过期 |
| `403 Forbidden` | 已认证但被业务守卫拒绝 | 冻结快照改捕获列、机器人调 mark-published |
| `404 Not Found` | 资源不存在 | id / topic_id / run_number 无匹配 |
| `405 Method Not Allowed` | 端点不支持该方法 | DELETE github-snapshots（不提供物理删除） |
| `409 Conflict` | 唯一约束/并发冲突 | 快照三重唯一、topic_id 周内重复、round_index 重复 |
| `412 Precondition Failed` | 乐观锁失败（可选启用） | If-Match 不匹配 |
| `422 Unprocessable Entity` | 业务规则校验失败 | 状态迁移非法、CTA 未填、血缘成环、衍生超限 |
| `429 Too Many Requests` | 限流（可选，成本控制） | LLM 调用配额、AI 端点频率 |
| `500 Internal Server Error` | 服务端异常 | 未捕获错误（响应不泄露内部细节） |
| `503 Service Unavailable` | 依赖不可用 | LLM Provider 全挂、Supabase 故障 |

### 4.2 应用错误码总表（`error.code`，🔸 命名约定）

| code | HTTP | 触发场景 | 对应基线规则 |
|---|---|---|---|
| `ERR_VALIDATION` | 400 | 参数/字段格式错误 | — |
| `ERR_UNAUTHENTICATED` | 401 | JWT 缺失/无效/过期 | — |
| `ERR_FORBIDDEN` | 403 | 认证但无权执行动作 | 基线 §2.8 |
| `ERR_NOT_FOUND` | 404 | 资源不存在 | — |
| `ERR_METHOD_NOT_ALLOWED` | 405 | 端点方法不支持 | — |
| `ERR_CONFLICT` | 409 | 唯一约束冲突 | 数据模型 §2.4 / §2.7 |
| `ERR_BUSINESS_RULE` | 422 | 通用业务规则违反 | — |
| `ERR_RATE_LIMITED` | 429 | 限流 | — |
| `ERR_INTERNAL` | 500 | 服务端异常 | — |
| `ERR_CTA_REQUIRED` | 422 | `Ready for Production` 前 `primary_cta` 未填 | 数据模型 §2.6 |
| `ERR_TOPIC_STATUS_TRANSITION` | 422 | 非法 `topic_status` 迁移 | 工作流 §7 |
| `ERR_RUN_STATUS_TRANSITION` | 422 | 非法 `workflow_run_status` 迁移 | 工作流 §4 |
| `ERR_LINEAGE_CYCLE` | 422 | 血缘写边成环（祖先路径含自身） | 数据模型 §2.3 |
| `ERR_DERIVED_BUDGET_EXCEEDED` | 422 | 衍生超限（round_index > 3）；服务端记 `audit_log` action=`budget_denied` | 数据模型 §2.7 |
| `ERR_SNAPSHOT_FROZEN` | 403 | `frozen` 快照 UPDATE/DELETE（触发器 RAISE EXCEPTION 的 API 预检） | 数据模型 §2.4 |
| `ERR_SNAPSHOT_DUPLICATE` | 409 | `UNIQUE(week, snapshot_type, selection_basis)` 冲突 | 数据模型 §2.4 |
| `ERR_DUPLICATE_TOPIC_ID` | 409 | `topic_id` 周内序号冲突（序号删除不回收） | 数据模型 §2.1 |
| `ERR_PUBLISH_NOT_ALLOWED` | 403 | 非人工触发 `published`；无 `publications` 记录置 `Published` | 数据模型 §2.8 |
| `ERR_PACKET_ROLLUP_MISMATCH` | 422 | 包级核验状态手填与明细 rollup 不一致 | 数据模型 §3.2 rollup 规则 |
| `ERR_OUTPUT_ALREADY_APPLIED` | 409 | （若使用冲突语义）产物已被消费；默认幂等返回 200 | 数据模型 §3.3 |
| `ERR_LOW_CANDIDATE` | 202 | AI Weekly 通过数 < 5，批次标 `low_candidate` 提示人工（非错误，随 202 返回） | 数据模型 §2.10 |

### 4.3 错误响应格式（统一信封）

```json
{
  "error": {
    "code": "ERR_CTA_REQUIRED",
    "message": "Topic 进入 Ready for Production 前必须设置 primary_cta",
    "details": { "topic_id": "2026W36-002", "guard": "primary_cta_required" },
    "request_id": "req_0192f6c4d2e5"
  }
}
```

- `details` 可携带：非法字段清单、守卫判定、冲突资源引用、`from_status → to_status`。
- `request_id` 由服务端生成并写入日志，供 `audit_log` 关联排查。
- 错误与 `audit_log` 关系：业务守卫拒绝的动作**不写** `audit_log`（未发生变更）；被拒绝时的守卫说明写入日志备注的场景仅在基线要求处（如 `budget_denied`）落库。

---

## 5. 资源端点总览

> 页面映射引用 IA §5 表；主表列名以数据模型基线为唯一事实源。

| # | 资源（端点前缀 `/api/v1`） | 主表 | 页面映射（IA §5） | 说明 |
|---|---|---|---|---|
| 1 | `/topics` | `topics` | `/topics`、`/topics/[id]` | Topic 枢纽（9 态状态机、五维评分、priority、CTA） |
| 2 | `/topics/:id/lineage`、`/topic-relations` | `topic_relations` + `topics` 投影列 | `/topics/[id]` §3.7 | 血缘权威图读写（`lineage service` 单事务） |
| 3 | `/event-pool` | `event_pool` | `/topics` 候选池 Drawer | 候选事件池（9 字段 + 入选/淘汰） |
| 4 | `/topic-clusters` | `topic_clusters` | `/topics` | 查重聚类组 |
| 5 | `/ctas` | `ctas` | `/topics/[id]` §3.13 | 主 CTA 受控词表（读为主） |
| 6 | `/sources` | `sources` | `/sources` | 来源主档（注册层） |
| 7 | `/source-packets` | `source_packets` | `/sources`、`/topics/[id]` §3.8 | 证据包（包级五态由明细 rollup） |
| 8 | `/source-packet-items` | `source_packet_items` | `/sources` | 核验明细（core_fact / key_numbers / number_test_conditions） |
| 9 | `/workflow-types` | `workflow_types` | `/workflows` | 工作流注册表（5 类） |
| 10 | `/workflow-templates` | `workflow_templates` | `/workflows` | 版本化模板（prompt_refs / step_definition） |
| 11 | `/prompt-templates` | `ai_prompt_templates` | `/settings` | Prompt 注册表（DB 单一来源） |
| 12 | `/workflow-routing-rules` | `workflow_routing_rules` | `/workflows`、`/settings` | 可审计路由规则 |
| 13 | `/workflow-batches` | `workflow_batches` | `/workflows`、`/dashboard` | 批次聚合根（batch_status 六态） |
| 14 | `/workflow-runs` | `workflow_runs` | `/workflows/runs`、`/dashboard` | 执行记录（run 五态 + parent_run_id 调用树） |
| 15 | `/workflow-tasks` | `workflow_tasks` | `/workflows/runs` Run Drawer | 步骤级执行（UNIQUE(run_id, sequence)） |
| 16 | `/workflow-outputs` | `workflow_outputs` | `/workflows/runs` | 类型化产物（applied 幂等） |
| 17 | `/github-snapshots` | `github_snapshots` | `/github-weekly` | 快照头（三重唯一 + frozen） |
| 18 | `/github-snapshot-items` | `github_snapshot_items` | `/github-weekly` | 快照明细（捕获列冻结/运营列可变） |
| 19 | `/knowledge-topics` | `knowledge_topic_bank` | `/knowledge` | AI Knowledge Topic Bank（1:1 topics） |
| 20 | `/knowledge-concept-edges` | `knowledge_concept_edges` | `/knowledge` | concept 图边（V1 可选） |
| 21 | `/knowledge-derivations` | `knowledge_derivations` | `/knowledge` | 衍生预算记账（round_index 1..3） |
| 22 | `/deep-dive-plans` | `deep_dive_plans` | `/content/[id]`（配图） | 深度蓝图（单 content_role / 单主 CTA） |
| 23 | `/deep-dive-image-plans` | `deep_dive_image_plans` | `/content/[id]` | 配图计划（来源链） |
| 24 | `/image-type-priorities` | `image_type_priorities` | —（查找表） | 配图类型优先级（只读） |
| 25 | `/content-assets` | `content_assets` | `/content`、`/content/[id]` | 逻辑资产（版本分离） |
| 26 | `/content-asset-versions` | `content_asset_versions` | `/content/[id]` | 资产版本（历史全保留） |
| 27 | `/brand-assets` | `brand_assets` | `/assets` | 品牌素材库（Logo 保护） |
| 28 | `/asset-brand-usages` | `asset_brand_usages` | `/assets` | 素材使用审计 |
| 29 | `/publications` | `publications` | `/publications`、`/content/[id]` | 发布中心（published 仅人工） |
| 30 | `/content-metrics` | `content_metrics` | `/analytics`、`/topics/[id]` §3.12 | 指标事实表（18 字段全量） |
| 31 | `/trend-radar` | `trend_radar` | `/analytics`、`/dashboard` | 趋势雷达信号 |
| 32 | `/leads` | `leads` | `/analytics` | 线索池 |
| 33 | `/audit-logs` | `audit_log` | `/topics/[id]` §3.14 | 审计（只读；含 `topic_status_history` 视图过滤） |
| 34 | `/system-settings` | `system_settings` | `/settings` | 配置驱动（权重/阈值/产能） |

---

## 6. Topics 域端点

### 6.1 `/topics`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/topics` | 列表（过滤/排序/分页） |
| POST | `/api/v1/topics` | 创建 Topic（🔸 人工创建时 `topic_id` 由服务端复用 id_assign 规则生成；`created_by_run_id` 留空） |
| GET | `/api/v1/topics/:id` | 详情（`:id` 接受 uuid 或 `topic_id` 业务 ID） |
| PATCH | `/api/v1/topics/:id` | 局部更新（可更新列见下） |
| PATCH | `/api/v1/topics/:id/status` | 状态迁移（守卫 + audit_log，见 6.1.2） |
| DELETE | 不提供 | 物理删除不支持（🔸 用 `PATCH status → Archived` 归档；保证血缘引用稳定与 `topic_id` 序号不回收） |

**GET /topics 过滤/排序**（对齐 IA §2.2 过滤栏）：

| 参数 | 作用字段（基线列名） | 取值示例 |
|---|---|---|
| `status` | `topics.status`（9 态） | `Draft,Ready%20for%20Production` |
| `priority` | `topics.priority` | `P0` |
| `topic_type` | `topics.topic_type`（8 类） | `hot,trend` |
| `content_week` | `topics.content_week` | `2026W36` |
| `history_dedupe_status` | `topics.history_dedupe_status` | `review_required` |
| `search` | `title` / `topic_id` | `agent skills` |
| `parent_topic_id` | 血缘过滤 | `null`（顶层选题） |
| `sort` | `-priority`（语义序）、`-updated_at`、`topic_id` | `-priority,updated_at` |

**POST /topics 请求体**（必填项按基线 NOT NULL 约束）：

```json
{
  "content_week": "2026W36",
  "title": "Agent Skills 成为企业 AI 落地新瓶颈",
  "description": "企业构建 Agent Skills Library 时面临的治理与成本问题",
  "topic_type": "trend",
  "trend_tags": ["agent-skills", "enterprise-ai"],
  "b2b_relevance": 8,
  "traffic_potential": 7,
  "conversion_potential": 6,
  "timeliness": 9,
  "content_value": 7,
  "business_relevance": 8
}
```

**响应 `201`**（含服务端评分与 priority 推导，落 `score_rationale` / `score_version`）：

```json
{
  "id": "0192f6c4-2e5f-7b3a-9d0e-100000000001",
  "topic_id": "2026W36-002",
  "content_week": "2026W36",
  "title": "Agent Skills 成为企业 AI 落地新瓶颈",
  "description": "企业构建 Agent Skills Library 时面临的治理与成本问题",
  "topic_type": "trend",
  "trend_tags": ["agent-skills", "enterprise-ai"],
  "parent_topic_id": null,
  "source_topic_ids": [],
  "b2b_relevance": 8, "traffic_potential": 7, "conversion_potential": 6,
  "timeliness": 9, "content_value": 7,
  "business_relevance": 8,
  "priority": "P1",
  "status": "Draft",
  "primary_cta": null,
  "history_dedupe_status": "not_checked",
  "dedupe_cluster_id": null,
  "dedupe_matched_topic_id": null,
  "score_version": 1,
  "score_rationale": {
    "dims": { "b2b_relevance": 8, "traffic_potential": 7, "conversion_potential": 6, "timeliness": 9, "content_value": 7 },
    "weights": { "b2b_relevance": 0.2, "traffic_potential": 0.2, "conversion_potential": 0.25, "timeliness": 0.2, "content_value": 0.15 },
    "priority_score": 7.15,
    "tiers": { "p0": 8.0, "p1": 6.5, "p2": 5.0, "p3": 5.0 },
    "business_relevance_gate": { "score": 8, "capped_at_p2": false },
    "verdict": "P1"
  },
  "source_packet_id": null,
  "created_by_run_id": null,
  "created_at": "2026-09-04T02:00:00Z",
  "updated_at": "2026-09-04T02:00:00Z",
  "archived_at": null
}
```

> 权重画像按 `topic_type` 取 `system_settings`（`scoring.weights.trend` 等），服务端不得硬编码（数据模型 §2.5）。

**PATCH /topics/:id 可更新列**（白名单）：`title`、`description`、`trend_tags`、`b2b_relevance`、`traffic_potential`、`conversion_potential`、`timeliness`、`content_value`、`business_relevance`、`primary_cta`、`priority`（人工覆盖，落 audit_log）、`parent_topic_id` / `source_topic_ids`（🔸 仅允许经血缘写端点修改，此处变更同步 `topic_relations` 由 `lineage service` 保证，禁止直接 PATCH）。评分五维变更时服务端重新推导 priority 并递增 `score_version`。

#### 6.1.2 `PATCH /topics/:id/status`（状态迁移守卫）

请求体：`{ "to_status": "Researching", "note": "..." }`。服务端按工作流基线 §7 校验迁移合法性：

| to_status | API 守卫（不满足 → 422/403） | 触发者 |
|---|---|---|
| `Researching` | 来源为 `Draft` | Orchestrator/AI 或人工 |
| `Ready for Production` | 证据包核验 ≥ `verified`；`primary_cta` **必填**（`ERR_CTA_REQUIRED`）；评分与 priority 已定 | 人工/Orchestrator |
| `Producing` | 来源为 `Ready for Production`；路由已命中、产能放行 | 人工/Orchestrator 派发 |
| `Review` | 来源为 `Producing`；`workflow_runs.status ∈ {completed, needs_review}`；产物已落 `workflow_outputs` | AI（子 workflow 完成） |
| `Needs Revision` | 来源为 `Review` / `Ready to Publish` | 人工 |
| `Ready to Publish` | 来源为 `Review`（或 `Needs Revision` 复核通过）；资产状态同步 | 人工 |
| `Published` | **必须存在 `publications` 记录**；仅人工（`ERR_PUBLISH_NOT_ALLOWED`） | 人工 |
| `Archived` | 任意非 Published → Archived，或 `Published → Archived` | 人工 |

每次迁移写 `audit_log`（`entity_type='topic'`，`action='status_changed'`，`from_status`/`to_status`）。

**成功响应 200**：

```json
{ "id": "0192f6c4-...", "status": "Researching", "updated_at": "2026-09-04T03:00:00Z" }
```

**守卫拒绝响应 422**：

```json
{
  "error": {
    "code": "ERR_CTA_REQUIRED",
    "message": "Topic 进入 Ready for Production 前必须设置 primary_cta",
    "details": { "topic_id": "2026W36-002", "from_status": "Researching", "to_status": "Ready for Production" },
    "request_id": "req_0192f6c4d2e5"
  }
}
```

### 6.2 血缘：`/topics/:id/lineage` 与 `/topic-relations`

- **读取权威路径 = `topic_relations` + `WITH RECURSIVE` 递归 CTE**（数据模型 §2.3），深度限制 3-5 层。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/topics/:id/lineage?direction=upstream\|downstream\|both&depth=3` | 血缘图（`depth` 默认 3，上限 5；`direction` 默认 `both`） |
| POST | `/api/v1/topics/:id/relations` | 写边 `{ "to_topic_id": "...", "relation_type": "parent" \| "source" }`（`lineage service` 同事务写 `topics` 投影列 + `topic_relations`；防环：祖先路径含自身 → `422 ERR_LINEAGE_CYCLE`） |
| DELETE | `/api/v1/topic-relations/:id` | 删除边（`204`；经 `lineage service` 同步投影列） |

**GET /topics/:id/lineage 响应**：

```json
{
  "data": {
    "root": { "id": "0192f6c4-...", "topic_id": "2026W36-002", "title": "Agent Skills 成为企业 AI 落地新瓶颈" },
    "nodes": [
      { "id": "0192f6c4-0001", "topic_id": "2026W36-001", "title": "Agent Skills 趋势", "priority": "P0" },
      { "id": "0192f6c4-0002", "topic_id": "2026W35-007", "title": "什么是 Agent Skills", "priority": "P2" }
    ],
    "edges": [
      { "from_topic_id": "0192f6c4-0001", "to_topic_id": "0192f6c4-...", "relation_type": "source", "depth": 1 },
      { "from_topic_id": "0192f6c4-0002", "to_topic_id": "0192f6c4-...", "relation_type": "parent", "depth": 1 }
    ],
    "depth_limit": 3
  }
}
```

- 约束：`from_topic_id <> to_topic_id`（CHECK）；新增父/源的祖先集合包含自身即拒绝（数据模型 §2.3 双保险）。

### 6.3 `/event-pool`（候选事件池）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/event-pool` | 列表；过滤 `week` / `batch_id` / `selection_status` / `history_dedupe_status` / `cluster_id`；排序 `-event_date` |
| POST | `/api/v1/event-pool` | 候选录入（V1 手动录入来源，OQ-02）；服务端生成 `candidate_id`（`2026W36-AI-CAND-001`） |
| PATCH | `/api/v1/event-pool/:id` | 更新评估字段 / `elimination_reason` / `selection_status`（人工裁决写 audit_log；`eliminated` 时 `elimination_reason` 必填） |
| POST | `/api/v1/event-pool/:id/select` | 入选（`selection_status='selected'`）；**提升为正式 `topics` 由 Orchestrator run 执行**（`derived_topic_id` 回填），本端点不直接建 Topic |

请求体字段（基线 §3.1）：`candidate_id`（服务端生成）、`batch_id`、`week`、`title`、`description`、`source_name`、`source_url`、`source_type`、`published_at`、`event_date`（入池过滤键）、`disclosure_date`、`industry_impact`、`user_perception`、`tech_change`、`application_value`、`propagation_potential`、`selection_status`、`elimination_reason`、`history_dedupe_status`、`cluster_id`、`source_packet_id`、`derived_topic_id`。

**POST 示例**：

```json
{
  "week": "2026W36",
  "title": "OpenAI 发布 Agent Skills 参考实现",
  "description": "官方示例库，社区关注度高",
  "source_name": "OpenAI Blog",
  "source_url": "https://openai.com/blog/...",
  "source_type": "official",
  "published_at": "2026-08-28T10:00:00Z",
  "event_date": "2026-08-28T10:00:00Z",
  "disclosure_date": "2026-08-28T10:00:00Z",
  "industry_impact": "企业 AI 工程化标准可能被重塑",
  "user_perception": "开发者普遍认为门槛降低",
  "tech_change": "Agent Skills 成为主流抽象",
  "application_value": "可应用于内部工具链",
  "propagation_potential": "高"
}
```

### 6.4 `/topic-clusters`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/topic-clusters` | 列表；过滤 `week` / `status`；`UNIQUE(cluster_key, week)` |
| POST | `/api/v1/topic-clusters` | 建簇（Orchestrator 聚类步骤产物；人工建簇写 audit_log） |
| PATCH | `/api/v1/topic-clusters/:id` | 更新 `canonical_topic_id` / `status`（`open → resolved / merged`） |
| GET | `/api/v1/topic-clusters/:id` | 详情（含簇内候选/ Topic 成员） |

### 6.5 `/ctas`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/ctas` | 受控词表（读为主；`key` ∈ `book_demo` / `download_whitepaper` / `join_community` / `contact_sales` / `follow_account` / `signup_newsletter` 等） |
| PATCH | `/api/v1/ctas/:id` | 仅 `label` / `target_url_template` / `active`（🔸 词表 key 冻结，避免引用漂移） |

---

## 7. Sources 域端点（三层：sources → source_packet_items → source_packets）

### 7.1 `/sources`（注册层）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/sources` | 列表；过滤 `source_type` / `source_quality_score` / `is_confidential` / `search`（source_name） |
| POST | `/api/v1/sources` | 注册来源；`UNIQUE(source_url, source_type)` 冲突 → `409 ERR_CONFLICT` |
| GET | `/api/v1/sources/:id` | 详情 |
| PATCH | `/api/v1/sources/:id` | 更新（`source_quality_score` 1-5 等） |
| DELETE | `/api/v1/sources/:id` | 删除（若被 `source_packet_items` 引用 → `409`） |

> 核验状态不在 sources 层（数据模型 §3.2）：`verification_status` 只属于 `source_packets`（包级）与 `source_packet_items`（明细级）。

### 7.2 `/source-packets`（聚合层）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/source-packets` | 列表；过滤 `topic_id` / `verification_status` / `source_consistency` |
| POST | `/api/v1/source-packets` | 建包（`packet_id` 服务端生成 `{topic_id}-SP`；`topic_id` 必填归属键） |
| GET | `/api/v1/source-packets/:id` | 详情（含 items 摘要） |
| PATCH | `/api/v1/source-packets/:id` | 更新 `source_consistency` / `conflict_fact_ids` / `notes` / `verified_by` / `verified_at`；**禁止手填 `verification_status`**（由明细 rollup，`422 ERR_PACKET_ROLLUP_MISMATCH`） |
| POST | `/api/v1/source-packets/:id/recompute` | 由明细重新 rollup 包级五态（🔸 显式重算端点；rollup 优先级：任一 `conflict` → `conflict`；任一 `needs_update` → `needs_update`；全 `verified` → `verified`；部分 → `partially_verified`；否则 `unverified`） |
| POST | `/api/v1/topics/:id/source-packet` | 关联主包指针（回填 `topics.source_packet_id`，循环引用破环方向固定"Topic 指向主包"） |

### 7.3 `/source-packet-items`（明细层）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/source-packet-items?packet_id=...` | 明细列表；过滤 `packet_id` / `source_id` / `item_verification_status` |
| POST | `/api/v1/source-packet-items` | 新增事实项（`core_fact` 必填；`key_numbers` / `number_test_conditions` 为 jsonb 结构化数组） |
| PATCH | `/api/v1/source-packet-items/:id` | 更新字段 / 人工核验结论 |
| POST | `/api/v1/source-packet-items/:id/verify` | 核验动作（写 `item_verification_status` + `verified_by` / `verified_at`，并触发包级 rollup） |
| DELETE | `/api/v1/source-packet-items/:id` | 删除事实项（`204`；触发包级 rollup） |

**key_numbers / number_test_conditions 结构（基线 §3.2）**：

```json
{
  "core_fact": "Agent Skills 官方示例库上线首周 star 数超过 5,000",
  "key_numbers": [
    { "label": "首周 star", "value": 5000, "unit": "个", "scope": "2026-08-28 ~ 2026-09-04", "captured_at": "2026-09-04T02:00:00Z", "source_url": "https://github.com/..." }
  ],
  "number_test_conditions": [
    { "key": "first_week_stars", "operator": ">=", "expected": 5000, "unit": "个", "tolerance": 0.05, "note": "以 API 快照为准" }
  ]
}
```

---

## 8. Workflow 域端点

### 8.1 `/workflow-types`（注册表）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/workflow-types` | 5 类（`orchestrator` / `ai_weekly` / `github_weekly` / `evergreen_knowledge` / `wechat_deep_dive`），展示 `scheduling` / `capacity_rules` / `enabled` |
| PATCH | `/api/v1/workflow-types/:key` | 更新 `capacity_rules` / `enabled`（Settings 页；写 audit_log） |

### 8.2 `/workflow-templates`（版本化定义）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/workflow-templates?workflow_type_key=ai_weekly` | 模板列表（`UNIQUE(workflow_type_key, version)`） |
| POST | `/api/v1/workflow-templates` | 新建版本（version 递增；`active` 唯一） |
| PATCH | `/api/v1/workflow-templates/:id` | 更新 `input_schema` / `output_schema` / `prompt_refs` / `step_definition` / `active` |
| GET | `/api/v1/workflow-templates/:id` | 详情（含 `prompt_refs` → `ai_prompt_templates.key` 或 `/ai-prompts/*.md` 路径） |

### 8.3 `/prompt-templates`（ai_prompt_templates，Prompt 单一来源）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/prompt-templates?workflow_type=ai_weekly` | 列表；`UNIQUE(key, version)` |
| POST | `/api/v1/prompt-templates` | 新建版本（`system_prompt` / `user_prompt_template` / `params_schema`） |
| PATCH | `/api/v1/prompt-templates/:id` | 更新 / `active` 切换 |

> 约束：Prompt 只存本表（或 `/ai-prompts/*.md` 导入来源），禁止写死在页面/模板（数据模型 §3.3、工作流 §9.3）。

### 8.4 `/workflow-routing-rules`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/workflow-routing-rules` | 默认映射：`hot/trend→ai_weekly`、`technical_project→github_weekly`、`knowledge/evergreen→evergreen_knowledge`、`scenario/product/conversion→wechat_deep_dive` |
| POST / PATCH | 同前缀 | 增改规则（`match_field` / `match_value` / `workflow_type_key` / `priority` / `overridable` / `active`） |

### 8.5 `/workflow-batches`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/workflow-batches` | 列表；过滤 `workflow_type` / `week` / `status`；排序 `-week,-created_at` |
| GET | `/api/v1/workflow-batches/:id` | 详情（含 `topic_ids` = Topic_ID_List、`week_start` / `week_end`、`orchestrator_run_id`） |
| PATCH | `/api/v1/workflow-batches/:id/status` | 批次状态迁移（`planned → dispatching → in_progress → completed`；含 `needs_review` / `failed`；守卫非法迁移 → 422） |
| POST | `/api/v1/workflow-batches/:id/rerun` | 同周重跑：新建批次（`batch_id` 追加 `-NN`，如 `2026W36-AI-WEEKLY-02`） |

### 8.6 `/workflow-runs`（执行记录，核心）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/workflow-runs` | 列表；过滤 `workflow_type_key` / `status` / `batch_id` / `week` / `topic_id` / `parent_run_id`（调用树根）；排序 `-created_at` |
| GET | `/api/v1/workflow-runs/:id` | 详情（含 `input_payload` / `output` / `error` / `attempt_count` / `template_version` 快照） |
| POST | `/api/v1/workflow-runs` | **触发 run**（Orchestrator 或子工作流入口，见下） |
| POST | `/api/v1/workflow-runs/:id/retry` | `failed → queued`（同 run 重跑，`attempt_count + 1`，不新建 run） |
| POST | `/api/v1/workflow-runs/:id/review` | 人工审核 `{ "decision": "approve" \| "reject", "note": "..." }`：approve → `needs_review → completed`（可联动 `topics.status = Ready to Publish`）；reject → `needs_review → queued`（`attempt_count + 1`） |

**POST /workflow-runs 请求体**（对齐工作流基线 §3 各工作流入参契约）：

```json
{
  "workflow_type_key": "orchestrator",
  "input_payload": {
    "week": "2026W36",
    "candidate_ids": ["2026W36-AI-CAND-001"],
    "include_routing": true,
    "include_production_dispatch": false
  }
}
```

- `orchestrator`：对应 Dashboard CTA「生成本周内容计划」（`include_production_dispatch: false`）/「确认并开始生产」（`include_production_dispatch: true`）。
- 子工作流示例：`ai_weekly` 入参 `{ "batch_id": "2026W36-AI-WEEKLY", "week": "2026W36", "topic_id_list": [...], "source_packet_ids": [...], "event_pool_ids": [...] }`。
- 服务端校验：`template_id` 取 `workflow_types.key` 对应 active 模板并快照 `template_version`；`run_number` 按 `{batch_id}-R{NN}` 生成；`parent_run_id` 由 Orchestrator 派发子 run 时写入（调用树）。

**响应 `202 Accepted`**（异步）：

```json
{
  "id": "0192f6c4-5000-0000-0000-000000000001",
  "run_number": "2026W36-ORCHESTRATOR-R01",
  "workflow_type_key": "orchestrator",
  "template_id": "0192f6c4-3000-0000-0000-000000000001",
  "template_version": 1,
  "batch_id": null,
  "topic_id": null,
  "parent_run_id": null,
  "input_payload": { "week": "2026W36", "candidate_ids": ["2026W36-AI-CAND-001"], "include_routing": true, "include_production_dispatch": false },
  "source_packet_id": null,
  "status": "queued",
  "attempt_count": 1,
  "started_at": null,
  "completed_at": null,
  "output": null,
  "error": null,
  "created_at": "2026-09-04T04:00:00Z",
  "updated_at": "2026-09-04T04:00:00Z"
}
```

**run 状态迁移表（服务端守卫，工作流基线 §4.1）**：

| 迁移 | 触发方式 | API 表达 |
|---|---|---|
| `queued → running` | 调度器（capacity_control 放行） | 内部服务，无公开端点 |
| `running → completed` | 引擎 | 内部 |
| `running → failed` | 引擎（异常/守卫） | 内部；`error` jsonb |
| `running → needs_review` | 引擎（低候选 `low_candidate`、`review_required` 查重、Deep Dive 蓝图、敏感信息） | 内部 |
| `needs_review → completed` | **人工** | `POST /workflow-runs/:id/review {decision:"approve"}` |
| `needs_review → queued` | **人工**（退回重跑） | `POST /workflow-runs/:id/review {decision:"reject"}` |
| `failed → queued` | **人工** retry | `POST /workflow-runs/:id/retry` |

非法迁移 → `422 ERR_RUN_STATUS_TRANSITION`；所有迁移写 `audit_log`。

### 8.7 `/workflow-tasks`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/workflow-tasks?run_id=...` | 步骤时间线（按 `sequence` 升序；`UNIQUE(run_id, sequence)`）；`status ∈ {queued, running, completed, failed, skipped}` |
| GET | `/api/v1/workflow-tasks/:id` | 详情（含 `input` / `output_ref` / `provider_class` / `error`） |

> `task_type` 取值见工作流基线 §5（`fact_check` / `score` / `select` / `script_generate` / `outline_generate` / `trend_radar` / `secondary_candidates` / `snapshot_capture` / `image_plan` / `return_writeback` / Orchestrator 内建 `dedupe` / `cluster` / `id_assign` / `route` / `capacity_check` / `cta_assign` / `derived_topic_manage`）。

### 8.8 `/workflow-outputs`（产物契约 + 幂等回写）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/workflow-outputs?run_id=...` | 产物列表；过滤 `output_type` / `applied` |
| GET | `/api/v1/workflow-outputs/:id` | 详情（`content` jsonb） |
| POST | `/api/v1/workflow-outputs/:id/apply` | Orchestrator 消费回写（`applied=true`、`applied_at` 落库）；**幂等**：重复调用返回 `200` + `already_applied: true` |

**apply 响应**：

```json
{
  "id": "0192f6c4-6000-...",
  "run_id": "0192f6c4-5000-...",
  "output_type": "selected_events",
  "content": { "events": [ { "candidate_id": "2026W36-AI-CAND-001", "selection_status": "selected" } ] },
  "topic_id": null,
  "asset_id": null,
  "applied": true,
  "applied_at": "2026-09-04T05:00:00Z",
  "already_applied": false
}
```

> `output_type` 白名单（11 类）：`production_plan` / `selected_events` / `trend_report` / `secondary_candidates` / `derived_topics` / `content_asset` / `source_packet_update` / `outline` / `knowledge_topic` / `deep_dive_plan` / `image_plan`。AI 原始产出先进本表留痕，**仅人工审核通过后提升为 `content_assets`**（工作流基线 §6）。

---

## 9. GitHub 快照域端点

### 9.1 `/github-snapshots`（不可变快照头）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/github-snapshots` | 列表；过滤 `week` / `snapshot_type` / `selection_basis` / `status` |
| POST | `/api/v1/github-snapshots` | 抓取建立快照（Original）：`{ "week": "2026W36", "selection_basis": "pure_weekly_rank" }`；`UNIQUE(week, snapshot_type, selection_basis)` 冲突 → `409 ERR_SNAPSHOT_DUPLICATE`；服务端生成 `snapshot_id`（`2026W36-GH-ORIGINAL-PURE`），`status='captured'` |
| POST | `/api/v1/github-snapshots/:id/freeze` | 定稿 `captured → frozen`（触发器后续禁改删） |
| POST | `/api/v1/github-snapshots/:id/replay` | Replay：**新建行**（`snapshot_type='replay'`，`source_item_id` 血缘指向 Original），**永不覆盖 Original**（数据模型 §2.4） |
| GET | `/api/v1/github-snapshots/:id` | 详情（含 items） |
| DELETE | 不提供 | **不提供物理删除**（基线 §2.4：仅允许新增 Replay 行；frozen 触发器兜底）→ 返回 `405 ERR_METHOD_NOT_ALLOWED` |

### 9.2 `/github-snapshot-items`（捕获列冻结 / 运营列可变）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/github-snapshot-items?snapshot_id=...` | 榜单明细；排序 `rank` |
| PATCH | `/api/v1/github-snapshot-items/:id` | 仅允许修改**运营列**：`verification_status`（复用 `source_verification_status` 全局枚举）/ `selected` / `elimination_reason` / `topic_id`；**捕获列**（`rank` / `repository` / `project_name` / `weekly_growth` / `total_stars` / `repo_url`）修改 → `403 ERR_SNAPSHOT_FROZEN`；`frozen` 后全部修改被拒（触发器 + API 预检）；变更记 `audit_log` |
| POST | `/api/v1/github-snapshot-items/:id/select` | 标记入选（`selected=true`），服务端引导落 Topic（`topic_type='technical_project'/'trend'`，回填 `topic_id`） |

---

## 10. Knowledge 域端点

### 10.1 `/knowledge-topics`（knowledge_topic_bank，1:1 关联 topics）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/knowledge-topics` | 列表；过滤 `category` / `knowledge_status` / `content_status` / `current_heat` / `search`（concept）；排序 `-long_term_value` |
| POST | `/api/v1/knowledge-topics` | 开采概念（Orchestrator 路由入口或人工点单）：服务端创建 `knowledge_topic_bank` 行 + 1:1 `topics` 行（`topic_type='knowledge'`），触发 `evergreen_knowledge` run（一次一主 Topic） |
| GET | `/api/v1/knowledge-topics/:id` | 详情（含 `upstream_concepts` / `related_concepts` / `downstream_concepts`、`existing_content`） |
| PATCH | `/api/v1/knowledge-topics/:id` | 更新 `knowledge_status` / `content_status` / `user_learning_cost` / `long_term_value` / `current_heat` / `next_action` |
| POST | `/api/v1/knowledge-topics/:id/mine` | 开采动作（创建 `evergreen_knowledge` run，经 `knowledge_derivations` 记账） |

### 10.2 `/knowledge-concept-edges`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/knowledge-concept-edges?source_concept_id=...` | concept 图边；`edge_type ∈ {upstream, related, downstream}`；`UNIQUE(source_concept_id, target_concept_id, edge_type)` |
| POST / DELETE | 同前缀 | 建边 / 删边 |

> 注意：knowledge concept 图与 `topics` 血缘是两套独立边，互不写入（数据模型 §3.5）。

### 10.3 `/knowledge-derivations`（衍生预算记账）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/knowledge-derivations?workflow_run_id=...` | 记账明细（`main_topic_id` / `derived_topic_id` / `round_index`） |
| POST | `/api/v1/knowledge-derivations` | 记一条衍生（内部服务端点，🔸 建议仅服务间调用）：守卫 `checkDerivedTopicBudget`——`round_index > 3` 或 `UNIQUE(workflow_run_id, round_index)` 冲突 → `422 ERR_DERIVED_BUDGET_EXCEEDED` 并记 `audit_log`（`action='budget_denied'`） |

---

## 11. Deep Dive 域端点

### 11.1 `/deep-dive-plans`（蓝图，plan/asset 分离）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/deep-dive-plans?topic_id=...` | 蓝图列表；过滤 `status`；排序 `-version` |
| POST | `/api/v1/deep-dive-plans` | 创建蓝图：`content_role` 必填且**单值**（`traffic` / `cognition` / `scenario` / `product` / `conversion`）；`target_user` / `core_user_problem` / `decision_user_needs_to_make` / `primary_cta` 必填；`section_structure` 默认 12 段模板（Title / Intro / User Problem / Why It Happens / What Changed / Why Existing Solution Fails / Core Problem / Framework-Solution / Real Product Path / Who It Fits / Conclusion / CTA） |
| GET | `/api/v1/deep-dive-plans/:id` | 详情 |
| PATCH | `/api/v1/deep-dive-plans/:id` | 更新（`status: drafting → review`；人工退回 `needs_revision` 时 `version + 1`） |
| POST | `/api/v1/deep-dive-plans/:id/approve` | 人工审核通过（`review → approved`；审核校验项：`plan.primary_cta == topics.primary_cta`，不一致 → `422 ERR_BUSINESS_RULE`；通过后产出 `content_assets(wechat_article)` 进入全局 Topic 状态机） |

### 11.2 `/deep-dive-image-plans`（配图计划）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/deep-dive-image-plans?deep_dive_plan_id=...` | 配图列表；排序 `sequence` |
| POST / PATCH | 同前缀 | 新增/更新配图项：`image_type`（7 类）+ `image_priority_rank`（由 `image_type_priorities` 映射 1-7）+ `source_status`；**真实产品截图/真实 UI 必须 `from_brand_asset` 或 `from_verified_source`**（否则 `422`）；Logo 禁止 AI 重绘（`ai_policy='reference_only'`） |

### 11.3 `/image-type-priorities`（只读查找表）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/image-type-priorities` | `real_product_screenshot=1 > real_ui=2 > structure_infographic=3 > flow_diagram=4 > data_chart=5 > concept_diagram=6 > decorative=7` |

---

## 12. Assets 域端点

### 12.1 `/content-assets`（逻辑资产，版本分离）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/content-assets` | 列表；过滤 `topic_id` / `asset_type`（8 类）/ `platform` / `content_role` / `status`；排序 `-updated_at` |
| POST | `/api/v1/content-assets` | 创建资产（`asset_key` 服务端生成 `{topic_id}:{asset_type}:{platform}`，跨版本不变；`asset_type='wechat_article'` 时 `content_role` 必填 CHECK；`cta` 默认继承 `topics.primary_cta`） |
| GET | `/api/v1/content-assets/:id` | 详情（含 `current_version_id`） |
| PATCH | `/api/v1/content-assets/:id` | 更新（`cta` 单值覆盖——改文案不改动作；`platform`；`status` 走审核端点，见下） |
| PATCH | `/api/v1/content-assets/:id/status` | 资产状态迁移（`asset_status` = `topic_status` 子集：Draft / Producing / Review / Needs Revision / Ready to Publish / Published / Archived；守卫 + audit_log） |
| POST | `/api/v1/content-assets/:id/approve` | 人工审核通过（`Review → Ready to Publish`；UI 显性"人工"标识） |
| DELETE | 不提供 | 历史全保留，不做覆盖删除（基线 §3.7）→ 用 `Archived` 归档 |

### 12.2 `/content-asset-versions`（版本全保留）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/content-asset-versions?asset_id=...` | 版本列表（`UNIQUE(asset_id, version)`；`is_current` 标记；含 `created_by_run_id` 审计） |
| POST | `/api/v1/content-asset-versions` | 新版本（version 从 1 递增；每次修改/AI 重生成产生新版本） |
| POST | `/api/v1/content-asset-versions/:id/make-current` | 切换当前版本（`is_current` 唯一；旧版本保留可回滚） |

### 12.3 `/brand-assets`（品牌素材库 + Storage）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/brand-assets` | 列表；过滤 `type` / `active` / `ai_policy` |
| POST | `/api/v1/brand-assets/upload` | 上传（两步，🔸 见下） |
| POST | `/api/v1/brand-assets` | 建记录（`name` / `type` / `file_url` / `version` / `usage_notes` / `active` / `ai_policy`） |
| PATCH | `/api/v1/brand-assets/:id` | 更新（**`type='logo'` 强制 `ai_policy='reference_only'`**（CHECK），禁止改回；`is_primary_logo` 全局唯一 PARTIAL UNIQUE） |
| GET | `/api/v1/brand-assets/:id/usages` | 使用审计反查（`asset_brand_usages`） |

**上传流程（🔸 推荐，基线仅规定 `file_url` 存 Supabase Storage）**：

1. `POST /api/v1/brand-assets/upload { "content_type": "image/png", "filename": "primary-logo.png" }` → 返回预签名 PUT URL 与 bucket 路径（`brand-assets/`）。
2. 客户端 PUT 文件至预签名 URL。
3. `POST /api/v1/brand-assets` 提交元数据（`file_url` 为已上传路径）完成建档。

### 12.4 `/asset-brand-usages`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/asset-brand-usages?content_asset_id=...` | 使用审计（`usage_kind ∈ {logo_composition, background, template, reference}`） |
| POST | `/api/v1/asset-brand-usages` | 记录一次使用（服务端内部或人工标记） |

---

## 13. Publication / Metrics 域端点

### 13.1 `/publications`（发布中心；V1 绝不自动发布）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/publications` | 列表；过滤 `topic_id` / `asset_id` / `platform`（5 枚举）/ `status` / `scheduled_date_from/to`；排序 `-scheduled_date` |
| POST | `/api/v1/publications` | 创建发布计划（`status='planned'`；`platform ∈ {wechat, douyin, xiaohongshu, bilibili, wechat_video}`；`asset_version_id` 精确到被发布版本） |
| PATCH | `/api/v1/publications/:id` | 更新计划（`scheduled_date` 等；系统/工作流仅允许生成 `planned → ready`） |
| POST | `/api/v1/publications/:id/mark-ready` | `planned → ready`（可由系统/工作流触发，对齐基线 §2.8"只生成 planned → ready"） |
| POST | `/api/v1/publications/:id/mark-published` | **仅人工**：回填 `published_date`（服务端当前时间）/ `published_url`（请求体）/ `published_by`（当前用户标识）；机器人/服务调用 → `403 ERR_PUBLISH_NOT_ALLOWED`；成功后联动 `topics.status → Published`（需存在 publications 记录） |
| PATCH | `/api/v1/publications/:id/status` | `published → failed`（人工回填失败标记，🔸 追加；`failed` 后可重新计划） |

**mark-published 请求/响应**：

```json
// POST /api/v1/publications/0192f6c4-9000-.../mark-published
{ "published_url": "https://mp.weixin.qq.com/s/xxxx" }
```

```json
{
  "id": "0192f6c4-9000-...",
  "topic_id": "0192f6c4-1000-...",
  "asset_id": "0192f6c4-8000-...",
  "asset_version_id": "0192f6c4-8100-...",
  "platform": "wechat",
  "scheduled_date": "2026-09-05T09:00:00Z",
  "published_date": "2026-09-05T09:12:00Z",
  "published_url": "https://mp.weixin.qq.com/s/xxxx",
  "published_by": "0192f6c4-aaaa-...",
  "status": "published",
  "created_at": "2026-09-04T06:00:00Z",
  "updated_at": "2026-09-05T09:12:00Z"
}
```

### 13.2 `/content-metrics`（18 字段全量，强制绑定 topic_id）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/content-metrics` | 列表/聚合；过滤 `topic_id` / `platform` / `metric_date_from/to` / `publication_id` / `asset_id` |
| POST | `/api/v1/content-metrics` | 单条录入（`topic_id` / `platform` / `metric_date` 必填；18 字段默认 0） |
| POST | `/api/v1/content-metrics/batch` | 批量录入（数组 ≤ 1000；🔸 upsert 语义：`UNIQUE(topic_id, asset_id, platform, metric_date, COALESCE(publication_id,''))` 冲突时覆盖更新，幂等可重放） |
| GET | `/api/v1/content-metrics/conversion-funnel?topic_id=...&platform=wechat&metric_date_from=...` | Conversion Funnel 派生视图（SQL 视图 `conversion_funnel`：Read=reads（视频另看 views）→ CTA Click=cta_clicks → Lead=registrations+dm_count → Registration=registrations → Demo=demo_requests → Sales Lead=sales_leads → Deal=deals → Revenue=revenue；映射固化在视图，不新增字段） |

**18 字段清单**：`impressions` / `views` / `reads` / `completion_rate`(numeric(5,4)) / `five_second_retention`(numeric(5,4)) / `save_count` / `share_count` / `comment_count` / `profile_visits` / `cta_clicks` / `dm_count` / `registrations` / `material_downloads` / `demo_requests` / `consultations` / `sales_leads` / `deals` / `revenue`(numeric(12,2))。

### 13.3 `/trend-radar`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/trend-radar?radar_week=2026W36&topic_id=...` | 信号列表；`source_workflow ∈ {ai_weekly, github_weekly, evergreen_knowledge, manual}`；`signal_strength` / `velocity` / `novelty_score` 均 smallint 1-10 |
| POST | `/api/v1/trend-radar` | 信号写入（由 `trend_radar` task 产出的 `trend_report` 回写；人工可补 `manual` 信号） |
| GET | `/api/v1/trend-radar/summary?from_week=&to_week=` | 跨周聚合（M5 趋势雷达跨周对比） |

### 13.4 `/leads`（线索池）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/leads` | 列表；过滤 `topic_id` / `source_platform` / `lead_type` / `lead_urgency` / `lead_status` / `owner` |
| POST | `/api/v1/leads` | 新增线索（`lead_type ∈ {product_inquiry, feature_request, usage_issue, cooperation, industry_opinion, negative, invalid}`；`suggested_reply` 为 AI 建议仅展示**不自动回复**） |
| PATCH | `/api/v1/leads/:id` | 更新（`status: new → assigned → contacted → closed`；`owner` 分配；写 audit_log） |

---

## 14. 审计与配置端点

### 14.1 `/audit-logs`（只读；统一落点）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/audit-logs` | 过滤 `entity_type` / `entity_id` / `action` / `actor` / `workflow_run_id` / `created_at_from/to`；排序 `-created_at` |
| GET | `/api/v1/topics/:id/history` | **Topic Detail §3.14 历史时间线**：`audit_log WHERE entity_type='topic' AND action='status_changed'`（视图 `topic_status_history`）；同源可并入 `source_packet_verifications` 视图（🔸 IA §3.14 扩展） |

> 全部写入由服务端完成，API 只读（基线 §3.9：审计表为统一落点，不另建重复表）。

### 14.2 `/system-settings`（配置驱动）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/system-settings` | 配置列表（`key` ∈ `scoring.weights.default/hot/evergreen/conversion`、`scoring.threshold.p0/p1/p2`、`capacity.global_concurrency` 等；`value` jsonb） |
| GET | `/api/v1/system-settings/:key` | 单项 |
| PATCH | `/api/v1/system-settings/:key` | 更新 `value`（Settings 页；写 audit_log，评分权重变更后触发 score_version 校验） |

---

## 15. 完整请求 / 响应示例

### 15.1 创建 Topic（人工，空态 CTA「新建 Topic」）

```http
POST /api/v1/topics
Authorization: Bearer eyJhbGciOi...（Supabase JWT）
Content-Type: application/json

{
  "content_week": "2026W36",
  "title": "企业 Agent Skills Governance 白皮书",
  "description": "面向 CTO 的治理框架选题",
  "topic_type": "scenario",
  "trend_tags": ["agent-skills", "governance"],
  "b2b_relevance": 9,
  "traffic_potential": 6,
  "conversion_potential": 8,
  "timeliness": 7,
  "content_value": 8,
  "business_relevance": 9
}
```

```http
HTTP/1.1 201 Created

{ "id": "0192f6c4-...", "topic_id": "2026W36-003", "priority": "P0", "status": "Draft",
  "score_rationale": { "...": "..." }, "score_version": 1, "...": "全量字段（同 6.1 示例）" }
```

### 15.2 触发 Orchestrator（Dashboard CTA「生成本周内容计划」）

```http
POST /api/v1/workflow-runs
Authorization: Bearer <JWT>
Content-Type: application/json

{ "workflow_type_key": "orchestrator",
  "input_payload": { "week": "2026W36", "include_routing": true, "include_production_dispatch": false } }
```

```http
HTTP/1.1 202 Accepted
Location: /api/v1/workflow-runs/0192f6c4-5000-0000-0000-000000000001

{ "id": "0192f6c4-5000-...", "run_number": "2026W36-ORCHESTRATOR-R01", "status": "queued", "...": "同 8.6 示例" }
```

前端随后轮询 `GET /api/v1/workflow-runs/:id` 直到 `completed`（或 `needs_review` / `failed`）。

### 15.3 Topic 状态迁移（成功 + 守卫拒绝）

```http
PATCH /api/v1/topics/2026W36-003/status
Authorization: Bearer <JWT>

{ "to_status": "Researching", "note": "人工确认进入调研" }
```

```http
HTTP/1.1 200 OK
{ "id": "0192f6c4-...", "status": "Researching", "updated_at": "2026-09-04T07:00:00Z" }
```

```http
PATCH /api/v1/topics/2026W36-003/status
{ "to_status": "Ready for Production" }
```

```http
HTTP/1.1 422 Unprocessable Entity
{ "error": { "code": "ERR_CTA_REQUIRED",
  "message": "Topic 进入 Ready for Production 前必须设置 primary_cta",
  "details": { "topic_id": "2026W36-003", "from_status": "Researching", "to_status": "Ready for Production" },
  "request_id": "req_..." } }
```

### 15.4 血缘查询

```http
GET /api/v1/topics/2026W36-003/lineage?direction=both&depth=3
Authorization: Bearer <JWT>
```

```http
HTTP/1.1 200 OK
{ "data": { "root": { "id": "...", "topic_id": "2026W36-003", "title": "企业 Agent Skills Governance 白皮书" },
  "nodes": [ { "id": "...", "topic_id": "2026W36-001", "title": "Agent Skills 趋势", "priority": "P0" } ],
  "edges": [ { "from_topic_id": "...", "to_topic_id": "...", "relation_type": "source", "depth": 1 } ],
  "depth_limit": 3 } }
```

### 15.5 核验单条事实（含数字测试条件执行）

```http
POST /api/v1/source-packet-items/0192f6c4-7000-.../verify
Authorization: Bearer <JWT>

{ "item_verification_status": "verified", "notes": "与 GitHub API 快照一致" }
```

```http
HTTP/1.1 200 OK
{ "id": "0192f6c4-7000-...", "item_verification_status": "verified", "verified_by": "<user-id>",
  "verified_at": "2026-09-04T08:00:00Z", "packet_id": "0192f6c4-6500-...",
  "packet_rollup": { "verification_status": "partially_verified", "source_consistency": "consistent" } }
```

### 15.6 快照冻结，及冻结后写入被拒

```http
POST /api/v1/github-snapshots/0192f6c4-9500-.../freeze
Authorization: Bearer <JWT>
```

```http
HTTP/1.1 200 OK
{ "id": "0192f6c4-9500-...", "snapshot_id": "2026W36-GH-ORIGINAL-PURE", "status": "frozen", "updated_at": "2026-09-07T09:00:00Z" }
```

```http
PATCH /api/v1/github-snapshot-items/0192f6c4-9600-...
{ "total_stars": 99999 }
```

```http
HTTP/1.1 403 Forbidden
{ "error": { "code": "ERR_SNAPSHOT_FROZEN",
  "message": "frozen 快照不可修改（捕获列冻结 + 触发器拒绝）",
  "details": { "snapshot_id": "2026W36-GH-ORIGINAL-PURE", "field": "total_stars" },
  "request_id": "req_..." } }
```

### 15.7 人工发布回填

```http
POST /api/v1/publications/0192f6c4-9000-.../mark-published
Authorization: Bearer <JWT>

{ "published_url": "https://mp.weixin.qq.com/s/xxxx" }
```

```http
HTTP/1.1 200 OK
{ "id": "0192f6c4-9000-...", "status": "published", "published_date": "2026-09-05T09:12:00Z",
  "published_url": "https://mp.weixin.qq.com/s/xxxx", "published_by": "<user-id>" }
```

```http
# 服务进程（无人工会话）调用 → 拒绝
HTTP/1.1 403 Forbidden
{ "error": { "code": "ERR_PUBLISH_NOT_ALLOWED",
  "message": "publications.status=published 仅人工触发（V1 绝不自动发布）",
  "details": { "publication_id": "0192f6c4-9000-..." }, "request_id": "req_..." } }
```

### 15.8 指标批量录入

```http
POST /api/v1/content-metrics/batch
Authorization: Bearer <JWT>

[ { "topic_id": "0192f6c4-1000-...", "publication_id": "0192f6c4-9000-...", "platform": "wechat",
    "metric_date": "2026-09-07", "impressions": 12000, "views": 9000, "reads": 5200, "cta_clicks": 340,
    "registrations": 42, "demo_requests": 5, "sales_leads": 3, "revenue": 0 },
  { "topic_id": "0192f6c4-1000-...", "platform": "xiaohongshu", "metric_date": "2026-09-07",
    "impressions": 30000, "views": 21000, "reads": 0, "cta_clicks": 120, "save_count": 800 } ]
```

```http
HTTP/1.1 200 OK
{ "applied": 2, "skipped": 0, "errors": [] }
```

---

## 16. 实时需求

### 16.1 实时面与目标场景

| 场景 | 需要实时感知的数据 | 页面 |
|---|---|---|
| Run 状态推进 | `workflow_runs.status`（queued → running → completed / needs_review / failed） | `/dashboard` 最近 runs、`/workflows/runs` |
| 步骤级进度 | `workflow_tasks.status` / `workflow_outputs` 新产物 | Run 详情 Drawer |
| 批次推进 | `workflow_batches.status`（planned → dispatching → in_progress → …） | `/workflows`、Dashboard 四卡 |
| 审核待办计数 | `needs_review` runs / `Review` 态资产 / `conflict` 证据包数量 | Topbar 审核铃铛 |

### 16.2 V1（M0-M3）轮询策略（🔸 基线未定义实时方案，本文档推荐）

- 无自动发布、无定时器（路线图 §1.2 第 8 项），M3 以手动触发为主 → **轮询已足够**：

| 端点 | 轮询间隔 |
|---|---|
| `GET /api/v1/workflow-runs?status=running&...` | Dashboard 30s |
| `GET /api/v1/workflow-runs/:id`（+ `workflow-tasks`） | Run 详情 5s |
| 审核待办计数 | 15s |

- 轮询优化：`GET /api/v1/workflow-runs/:id/events?since=<updated_at>` 返回增量变更（🔸，`If-None-Match` / `ETag` 支持 `304 Not Modified`）。

### 16.3 中期（M5+）：Supabase Realtime（🔸 推荐，待确认）

- 技术栈自带 Supabase，可用 **Postgres Changes（WAL）** 订阅 `workflow_runs` / `workflow_batches` / `workflow_outputs` 表变更：
  ```typescript
  supabase.channel('workflow-realtime')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workflow_runs' },
        (payload) => { /* 按 run id 更新 UI */ })
    .subscribe();
  ```
- 订阅通道经 RLS 过滤（§2.4）；人工审核动作仍以服务端响应为准，Realtime 仅作 UI 加速。
- 与需求十八"不要优先实现实时全网爬虫"无冲突：Realtime 是**推送机制**，不是爬虫能力。

### 16.4 一致性约定

- 任何实时通知**不替代业务响应**：状态变更以写操作的 HTTP 响应为权威，Realtime 事件带 `request_id` 可去重。
- `audit_log` 为最终一致性落点；UI 时间线一律读 `audit_log`，不依赖推送事件。

---

## 17. Open Questions

### 17.1 继承基线未决问题（引用路线图 §5，本 API 已采用其推荐方案，需用户确认）

| 编号 | 问题 | 本 API 的关联实现（推荐） |
|---|---|---|
| OQ-04 | 认证与单用户：是否启用 Supabase Auth？ | §2 全文按"启用 Supabase Auth 单账号"编写；若不启用，`actor` 固定 `manual-user`、鉴权旁路 |
| OQ-01 | LLM Provider 选型 | 影响 `POST /workflow-runs` 的 provider_class 注入（工作流 §9.2），与 API 形状无关 |
| OQ-02 | 候选事件池数据来源 | `POST /api/v1/event-pool` 支持手动录入；半自动导入（RSS/订阅）待确认是否追加批量端点 |
| OQ-03 | GitHub Trending 抓取方式 | `POST /api/v1/github-snapshots` 入参不变，仅影响内部 `snapshot_capture` 实现 |
| OQ-06 | 定时调度启用时机 | M5 前 `scheduling='weekly'` 定时器不启用，API 无定时触发端点；M5 后由服务端定时器调 `POST /workflow-runs` |
| OQ-08 | 发布渠道接入方式 | 人工发布 + 回填：`POST /publications/:id/mark-published` 已按此设计；平台 OpenAPI 接入会影响"失败自动回写"能力 |

### 17.2 本文档新增开放问题（🔸 API 层特有，编号 API-OQ）

| 编号 | 问题 | 影响范围 | 推荐方案 |
|---|---|---|---|
| API-OQ-1 | API 版本策略：`/api/v1` 前缀是否足够？后续破坏性变更如何处理（URL 版本 vs 响应协商）？ | 全部端点 | V1 用 URL 前缀；破坏性变更开 `/api/v2`，保留 v1 三个月过渡 |
| API-OQ-2 | 实时方案确认：V1 轮询（§16.2）与 M5 Supabase Realtime（§16.3）是否按推荐实施？ | D4、D9、Dashboard | 按 §16 推荐实施，Realtime 延后到 M5 |
| API-OQ-3 | 错误码是否需要与前端共享生成 SDK/类型（如 OpenAPI 3.1 导出 + `openapi-typescript`）？ | 全栈 | 推荐：以本文件为源生成 OpenAPI 规格，前端类型自动生成 |
| API-OQ-4 | `content-metrics` 批量录入是否支持 CSV 导入（M4 `/analytics` 数据回填场景）？ | D15 | 推荐 JSON 批量端点先行，CSV 作为 D15 追加项 |
| API-OQ-5 | 分页默认值（limit=20）与 `include_total` 性能开销是否可接受？超大数据集（audit_log）是否需要更细的时序分区？ | 全站列表 | V1 接受；audit_log 大表按 `created_at` 分区延后评估 |
| API-OQ-6 | `audit-logs` 是否需要导出端点（CSV/JSON 下载）供合规审计？ | D8 后 | V1 不做，延后评估 |

---

## 18. 本文档补充约定汇总（对应返回值 `deviationsFromCanonical`）

> 以下均为**基线未定义、本文档补全**的落地约定（🔸），未改动任何基线字段/枚举/路由/状态；若与后续裁决冲突，以本表标记的 `[REVIEW]` 项为准修订本文档。

| # | 补充项 | 位置 | 状态 |
|---|---|---|---|
| 1 | API 前缀 `/api/v1`、REST 端点命名与 URL 结构（§5 全表） | §1.1、§5 | [REVIEW] |
| 2 | 分页/过滤/排序语法与默认值（cursor/offset、`filter` 逗号 OR、`sort` 语义序、`fields` 裁剪） | §3 | [REVIEW] |
| 3 | HTTP 状态码映射与 `ERR_*` 应用错误码体系 | §4 | [REVIEW] |
| 4 | Supabase Auth 集成细节（Bearer JWT、RLS 建议、actor 映射、"仅人工"端点强制） | §2 | [REVIEW]（OQ-04 未决） |
| 5 | 实时方案（V1 轮询 + M5 Supabase Realtime 推荐 + 增量事件端点） | §16 | [REVIEW]（API-OQ-2 未决） |
| 6 | 人工创建 Topic 时 `topic_id` 由服务端复用 id_assign 规则生成（基线 §2.1 仅规定 Orchestrator 分配） | §6.1 | [REVIEW] |
| 7 | 不提供物理删除的端点延伸：topics/content_assets 用归档替代（基线仅对 github_snapshots 明确"不提供物理删除"） | §6.1、§12.1 | [REVIEW] |
| 8 | 业务 ID 双键查找（`:id` 接受 uuid 或 `topic_id`） | §1.2 | [REVIEW] |
| 9 | `content-metrics/batch` upsert 语义（UNIQUE 冲突覆盖更新、幂等可重放） | §13.2 | [REVIEW] |
| 10 | `Idempotency-Key` 请求头与乐观锁（`If-Match`）可选约定 | §1.3 | [REVIEW] |
| 11 | 若干动作端点（recompute / select / approve / mark-ready / freeze / replay / make-current 等）与 `low_candidate` 随 202 返回的约定 | §6-§13 | [REVIEW] |
| 12 | `publications.status: published → failed` 人工失败标记端点 | §13.1 | [REVIEW] |

---

*本文件为 13 份正式文档之一（docs/10-api-contract.md）。实现阶段（D1-D10）凡涉及 HTTP 接口均以本文件为准；字段、枚举、状态、路由的一切冲突以 `_canonical-data-model.md` / `_canonical-workflow.md` / `_canonical-ia.md` / `_canonical-roadmap.md` 为最终裁决依据。*
