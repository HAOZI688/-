# 07 · AI Agent 规格（AI Agent Specification）

> **状态**：本文件是**正式文档第 07 份**，定义系统的 AI Agent 规格——AI 调用层三层（providers / orchestrator / workflows）的职责与接口、Provider 抽象、Orchestrator 调度、4 个子工作流的 agent 编排与 Prompt 契约（`/ai-prompts` 目录）、以及 AI 护栏（不自动发布 / 事实核验 / Logo 来源 / 关键数字来源）。
> **唯一事实源**：数据字段、表、枚举一律以 `_canonical-data-model.md` 为裁决依据；执行顺序、状态机、产能、调用层接口以 `_canonical-workflow.md` 为裁决依据；页面/路由以 `_canonical-ia.md` 为裁决依据；MVP 范围与任务拆分以 `_canonical-roadmap.md` 为裁决依据；需求原文为 `_requirements.md`。本文件**不新增、不改写任何表字段与枚举**，只在其上定义 Agent 层的落地契约。
> **技术基线**：Next.js + TypeScript strict + Drizzle ORM + PostgreSQL 15+（Supabase）；AI 调用层目录 `lib/ai/providers` / `lib/ai/orchestrator` / `lib/ai/workflows`；Prompt 单一来源 = `ai_prompt_templates`（DB 版本化），`/ai-prompts/*.md` 为源文件导入来源。
> **对齐阶段**：M2（D9）实现调用层骨架 + mock provider；M3（D10-D13）实现 Orchestrator 与 4 个工作流；完整 AI 逻辑在本迭代（文档阶段）**禁止实现**（需求二十）。

---

## 1. AI 调用层三层架构总览

### 1.1 三层职责与边界

遵循需求九「AI 调用层必须抽象、不把模型 SDK 散落在业务代码」。`_canonical-workflow.md §9` 的权威职责表如下，Agent 规格在此基础上定义接口与落地细节：

| 层 | 目录 | 职责 | 禁止事项 |
|---|---|---|---|
| **Providers（模型适配器）** | `lib/ai/providers` | 封装模型供应商 SDK（LLM Provider）；统一 `call()` 接口；负责 token 计数、重试、成本审计、结构化输出解析 | 禁止包含业务 Prompt 与工作流逻辑；禁止业务代码直接 `import` 供应商 SDK |
| **Orchestrator（编排回写层）** | `lib/ai/orchestrator` | 执行 12 步流水线；读 `workflow_templates.step_definition` 编排子 workflow；调用 Providers；消费 `workflow_outputs` 回写（幂等 `applied`）；管理批次 / 产能 / 路由 | 禁止内联业务 Prompt（Prompt 只存 `ai_prompt_templates`） |
| **Workflows（业务子工作流）** | `lib/ai/workflows` | 实现 4 个子 workflow（ai_weekly / github_weekly / evergreen_knowledge / wechat_deep_dive）的具体步骤序列；生成 `workflow_outputs`；经 Orchestrator 注入的 Provider 调用模型 | 禁止直接调用供应商 SDK；禁止写 `topics` 主表状态（状态迁移统一由守卫处理） |

### 1.2 调用链路与数据流（一次端到端示例）

```
Dashboard CTA「生成本周内容计划」                       UI / Dashboard（人工触发）
        │  创建 workflow_runs（workflow_type='orchestrator'，status='queued'）
        ▼
runOrchestrator({ week: "2026W36", includeRouting: true })     Orchestrator 层
        │  12 步流水线，每步落 workflow_tasks（UNIQUE(run_id, sequence)）
        │  第 1-6 步（候选接收→查重→聚类→ID→评分→优先级）→ production_plan 产物
        ▼
Dashboard CTA「确认并开始生产」                          人工审核 Topic 后
        │  workflow_routing_rules 命中 → 派发子 run（parent_run_id = orchestrator run）
        ▼
run(ctx) — ai_weekly 子工作流                             Workflows 层
        │  fact_check → score → select(5-8) → script_generate → outline_generate
        │  → trend_radar → secondary_candidates → return_writeback
        ▼
provider.call(AIRequest{ promptKey, params, outputSchema })   Providers 层
        │  返回 AIResponse{ content(结构化), usage{...} }
        ▼
workflow_outputs（output_type + content + applied=false）   留痕（原始产出）
        ▼
return_writeback（applied=true 幂等回写）                    Orchestrator 层
        │  提升 Topic、更新 Source Packet、落资产引用
        ▼
workflow_runs.status = needs_review ── 人工审核 ──► completed / 退回重跑
```

### 1.3 分层红线（Agent 规格硬约束）

1. **业务代码（页面 / 服务 / 域服务）禁止 `import` 任何模型供应商 SDK**，只允许通过 `AIProvider` 接口调用。
2. **Prompt 禁止写死在页面组件、`workflow_templates` 或任何业务代码**；唯一来源 `ai_prompt_templates`（DB），`/ai-prompts/*.md` 为导入源文件。
3. **子工作流禁止直写 `topics.status` 等主表状态**；状态迁移只能经 `_canonical-workflow.md §7` 守卫迁移表执行。
4. **所有 AI 调用结果必须先落 `workflow_outputs` 留痕**，`applied=false`；Orchestrator 消费后才置 `applied=true`（幂等，一次一消费）。
5. **Provider 由 Orchestrator 注入（RunContext.provider）**，子工作流不得自行选择供应商（`provider_class` 记录实际适配器类，用于成本/延迟审计）。

---

## 2. Provider 抽象层（lib/ai/providers）

### 2.1 职责清单

- 封装供应商 SDK 差异：统一 `call()` 签名、统一鉴权（API Key 经环境变量 / Supabase Secrets 注入，不落库明文）。
- **结构化输出解析**：将模型返回（JSON / JSONL / tool-call）解析为 `outputSchema` 声明的结构，解析失败抛出可重试错误。
- **重试**：网络错误 / 5xx / 限流（429）指数退避重试；重试次数与退避参数可配置。
- **token 计数与成本审计**：返回 `usage`，由 Orchestrator 落 `workflow_tasks.provider_class` 与 `workflow_runs.error`（审计口径见 §2.6）。
- 支持 **mock provider**（M2 D9 验收，见 §2.4）。

### 2.2 接口契约（基线 `_canonical-workflow.md §9.2`，TS strict）

```typescript
// lib/ai/providers/types.ts — Provider 统一接口（基线权威定义）
interface AIProvider {
  readonly id: string;                  // "anthropic" | "openai" | "deepseek" | "mock" | ...
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

### 2.3 OpenAI 兼容适配器（OpenAICompatibleProvider）

OpenAI 生态的 Chat Completions 协议已成为事实标准（DeepSeek、OpenAI、各类自托管网关均兼容），V1 首选实现**一个通用 OpenAI 兼容适配器**，其余供应商差异用配置收敛：

| 项 | 值 |
|---|---|
| 类名 | `OpenAICompatibleProvider` |
| `id` | `openai-compatible`（`id` 与供应商名区分：`baseURL` + `model` 可配置） |
| 配置来源 | `/settings` → 集成区（IA §2.14）；存储于环境变量（`AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`），密钥不进 DB |
| 协议 | `POST {baseURL}/chat/completions`，`response_format` 或 tool-call 承载结构化输出 |
| 结构化输出 | 优先 `response_format: { type: "json_object" }`（或供应商 json mode）；退化用 `outputSchema` 解析兜底 |

```typescript
// lib/ai/providers/openai-compatible.ts — 构造示意
const provider = new OpenAICompatibleProvider({
  id: "deepseek-v3",
  baseURL: "https://api.deepseek.com/v1",   // 任意 OpenAI 兼容端点
  model: "deepseek-chat",
  apiKeyEnv: "AI_API_KEY",
});
```

### 2.4 mock provider（M2 D9 验收必需）

- 类名 `MockProvider`，`id = "mock"`。
- 行为：读 `AIRequest.params`，按 `promptKey` 返回预置 fixture 数据（与 `outputSchema` 形状一致）；`usage` 返回固定值（如 `{ promptTokens: 100, completionTokens: 200, costCents: 0 }`）。
- 用途：D9 跑通 run 全生命周期（`queued → running → completed`）、`needs_review` 门禁路径、`applied` 幂等、`parent_run_id` 调用树（roadmap §3 D9 验收要点）；D10 前由用户确认真实 Provider 后切换（OQ-01）。
- 开关：`system_settings` key `ai.provider.active`（`{"id": "mock" | "openai-compatible"}`），配置驱动，不硬编码。

### 2.5 未来扩展：新增 Provider 的步骤

| 步骤 | 动作 |
|---|---|
| 1 | 实现 `AIProvider` 接口（`lib/ai/providers/<name>.ts`），不修改调用方 |
| 2 | 工厂注册：`lib/ai/providers/index.ts` 的 `getProvider(id: string): AIProvider`（按 `system_settings` / env 实例化） |
| 3 | 配置侧 `/settings` 集成区增加供应商表单（baseURL / model / key 环境变量名） |
| 4 | `workflow_tasks.provider_class` 记录实际适配器类，成本/延迟审计自动生效 |

### 2.6 成本与用量审计

- 每次 `provider.call` 的 `usage`（promptTokens / completionTokens / costCents）由 Orchestrator 汇总。
- `workflow_tasks.provider_class` 记录本次步骤实际调用的适配器类（数据模型 §3.3）。
- 审计落点：`workflow_runs.error`（失败原因）、`workflow_tasks`（步骤级）；成本聚合在 `/settings` 或 `/workflows/runs` Drawer 展示（V1 最小实现：run 详情显示 usage 摘要）。
- 建议的 `system_settings` 扩展 key（落地建议，非基线字段）：`ai.provider.active`、`ai.provider.defaults`（`{"temperature": 0.3, "maxTokens": 4096}`）、`ai.retry.max_attempts`。

---

## 3. Orchestrator 编排层（lib/ai/orchestrator）

### 3.1 职责

- 执行 `_canonical-workflow.md §2.1` 流水线 12 步（`candidate_reception → history_dedupe → topic_clustering → topic_id_assignment → scoring → priority_assignment → workflow_routing → capacity_control → cta_assignment → trend_radar_management → derived_topic_management → return_writeback`）。
- 每步落 `workflow_tasks`（`UNIQUE(run_id, sequence)`），关键裁决结果落 `workflow_outputs`。
- 派发子 run（`parent_run_id = 本 run`），收集 `workflow_outputs` 后 `return_writeback` 幂等回写。
- 管理批次（`workflow_batches`）生命周期与产能（`capacity_rules`：全工作流 `concurrency_limit=1, serial_mode=true`）。
- 经注入的 `AIProvider` 调用模型（评分 / 查重 / 聚类 / CTA 判断可调模型；ID 分配、priority 分档、回写为确定性规则，不调模型）。

### 3.2 入口契约（基线权威定义）

```typescript
// lib/ai/orchestrator/orchestrator.ts — 编排入口
type OrchestratorInput = {
  week: string;                          // ISO 内容周，如 "2026W36"
  batchId?: string;                      // 如 "2026W36-AI-WEEKLY"；缺省由引擎按 §2.2 规则生成
  candidateIds?: string[];               // 候选接收（event_pool 入池），如 ["2026W36-AI-CAND-001"]
  topicIdList?: string[];                // Topic_ID_List，如 ["2026W36-001", "2026W36-002"]
  includeRouting?: boolean;              // 是否执行路由/派发（「确认并开始生产」）
  includeProductionDispatch?: boolean;   // 是否「确认并开始生产」派发子 workflow
};
async function runOrchestrator(input: OrchestratorInput): Promise<WorkflowRunId>;
// 返回 orchestrator workflow_runs.id；内部按 §3.3 顺序执行 12 步。
```

### 3.3 12 步流水线与 task 落库映射（基线 §2.1 权威表，此处给出 Agent 侧执行细节）

| 序号 | 职责（英文标识） | 落 `workflow_tasks.task_type` | 是否调模型 | 涉及 Prompt key（§5.4） | 输出 / 落库 |
|---|---|---|---|---|---|
| 1 | `candidate_reception` | `fact_check`（证据包预绑定） | 否（规则入池） | — | `event_pool` 入池（`selection_status='pending'`、`history_dedupe_status='not_checked'`） |
| 2 | `history_dedupe` | `dedupe` | 是（候选两两比对） | `orchestrator/dedupe/v1` | `event_pool.history_dedupe_status`：unique / clustered / duplicate / merged / review_required |
| 3 | `topic_clustering` | `cluster` | 是（归并/命名簇） | `orchestrator/cluster/v1` | `topic_clusters`（cluster_key、canonical_topic_id）、`topics.dedupe_cluster_id` / `dedupe_matched_topic_id` |
| 4 | `topic_id_assignment` | `id_assign` | 否（确定性规则） | — | `topics.topic_id`（`2026W36-001`，目标内容周语义、周内递增、删除不回收） |
| 5 | `scoring` | `score` | 是（五维评分） | `orchestrator/scoring/v1` | 五维落 `topics` 各列；`score_rationale`（jsonb）；`score_version` 递增 |
| 6 | `priority_assignment` | `score`（同步） | 否（阈值分档规则） | — | `topics.priority`（P0≥8.0 / P1≥6.5 / P2≥5.0 / P3<5.0；business_relevance<4 非 product/conversion 封顶 P2；hot/trend timeliness=10 兜底 P1） |
| 7 | `workflow_routing` | `route` | 否（规则表命中） | — | `workflow_routing_rules` 命中 → 指定子 workflow；`overridable=true` 可人工覆盖 |
| 8 | `capacity_control` | `capacity_check` | 否（规则） | — | 生成 `workflow_batches`（`status='dispatching'`）；按 `capacity_rules` 决定派发批次与串并行 |
| 9 | `cta_assignment` | `cta_assign` | 是（建议，人工确认） | `orchestrator/cta-assign/v1` | `topics.primary_cta`（FK→`ctas` 受控词表，单值）；进入 `Ready for Production` 前必填守卫 |
| 10 | `trend_radar_management` | `trend_radar`（管理态） | 否（规则回写；信号生成在子 workflow） | — | 管理 `trend_radar`：二次候选回写 `event_pool`、更新 `topic_clusters`；**生成在 workflow，管理在 orchestrator** |
| 11 | `derived_topic_management` | `derived_topic_manage` | 否（守卫规则） | — | `knowledge_derivations` 记账；`checkDerivedTopicBudget` 拦截超限（≤3）记 `audit_log`（action=`budget_denied`） |
| 12 | `return_writeback` | `return_writeback` | 否（幂等消费规则） | — | 消费产物（`applied=true`）：提升 Topic、更新 Source Packet、落资产引用、刷新趋势雷达；批次 `status='completed'` |

> 两段式执行：第 1-6 步 = 「生成本周内容计划」（`production_plan` 产物 → Dashboard 展示）；第 7-12 步 = 「确认并开始生产」（派发与回写）。两段可在一次 Orchestrator run 内完成，也可拆分为两次 run（`batch_status` 分别为 `planned` / `dispatching`）。

### 3.4 批次状态机与产能

- 批次状态：`planned → dispatching → in_progress → completed`；含待审产物 → `needs_review`；异常 → `failed`（枚举 `batch_status`）。
- `batch_id` 规则（数据模型 §2.2）：`{ISO周}-{WORKFLOW_KIND}`（`2026W36-AI-WEEKLY`）；同周重跑追加 `-NN`（`2026W36-AI-WEEKLY-02`）；`run_number` 追加批次内序号（`2026W36-AI-WEEKLY-R01`）。
- 产能：全工作流 `concurrency_limit=1, serial_mode=true`（编排串行，避免状态竞争）；AI Weekly `weekly_quota: {min:5, max:8}`；Evergreen 一次一主 Topic。
- V1（M3）以手动触发为主，`scheduling='weekly'` 定时器（每周一 09:00）放 M5 启用（roadmap §1.2 第 8 项、OQ-06）。

### 3.5 路由规则（基线默认映射，`overridable=true` 全量可人工覆盖）

| match_field | match_value | workflow_type_key |
|---|---|---|
| `topic_type` | `hot` / `trend` | `ai_weekly` |
| `topic_type` | `technical_project` | `github_weekly` |
| `topic_type` | `knowledge` / `evergreen` | `evergreen_knowledge` |
| `topic_type` | `scenario` / `product` / `conversion` | `wechat_deep_dive` |

命中多条时按 `priority` 取最高优先规则；规则表可审计（`workflow_routing_rules` 落库，`/workflows` 页可视化编辑）。

### 3.6 return_writeback 回写契约（workflow_outputs 11 类产物消费）

AI 原始产出一律先进 `workflow_outputs` 留痕，**仅人工审核通过后提升为 `content_assets`**。Orchestrator 按 `output_type` 消费（`applied=true` 幂等）：

| output_type | 回写动作（Orchestrator 消费） |
|---|---|
| `production_plan` | 生成 `workflow_batches`；Dashboard「本周内容计划」展示 |
| `selected_events` | 入选提升为 `topics`（`event_pool.derived_topic_id` 回填） |
| `trend_report` | 写 `trend_radar`；二次候选回写 `event_pool` |
| `secondary_candidates` | 回写 `event_pool`、更新 `topic_clusters` |
| `derived_topics` | 建 `topics`（parent_topic_id）+ 写 `knowledge_derivations` 记账 |
| `content_asset` | 审核通过后提升 `content_assets`（`asset_id` 回填；`created_by_run_id` 审计） |
| `source_packet_update` | 更新 `source_packet_items` / `source_packets`（核验结论、新事实、`event_assessment`） |
| `outline` | 供审核与后续成文 |
| `knowledge_topic` | 建 `knowledge_topic_bank` + 1:1 topics 行 |
| `deep_dive_plan` | 写 `deep_dive_plans`（`drafting → review` 人工审核蓝图） |
| `image_plan` | 写 `deep_dive_image_plans` |

### 3.7 与人工门禁衔接

- `workflow_runs.status = needs_review` 为人工门禁吸收态：人工通过 → `completed`（可联动 `topics.status = Ready to Publish`）；人工退回 → 同 run 重跑（`attempt_count+1`）或标记 `needs_revision`；失败可 retry（`failed → queued`）。
- 触发 `needs_review` 的典型场景：AI Weekly 候选不足 5 条（批次标 `low_candidate`）、查重 `review_required`、Deep Dive 蓝图（`deep_dive_plan_status=drafting → review`）、产物含敏感信息。
- 所有迁移写 `audit_log`（`actor = 用户标识 或 ai:run-xxx`）。

---

## 4. 子工作流层（lib/ai/workflows）

### 4.1 接口契约（基线权威定义）

```typescript
// lib/ai/workflows/*.ts — 子工作流入口（每个返回 output 数组）
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

文件布局：`lib/ai/workflows/ai-weekly.ts`、`github-weekly.ts`、`evergreen-knowledge.ts`、`wechat-deep-dive.ts`（roadmap D10 明确 `ai-weekly.ts`）。

### 4.2 步骤编排通用约定

- 每个工作流 = 有序 `task_type` 序列（`workflow_templates.step_definition` 驱动，Agent 不硬编码顺序）。
- **权威 task_type 取值**（`_canonical-workflow.md §5`，Agent 可扩展性：Orchestrator 内建步骤 `dedupe/cluster/id_assign/route/capacity_check/cta_assign/derived_topic_manage` 为扩展值）：

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
| `dedupe` / `cluster` / `id_assign` / `route` / `capacity_check` / `cta_assign` / `derived_topic_manage` | Orchestrator 内建步骤 | orchestrator |

- 步骤状态 `workflow_task_status ∈ {queued, running, completed, failed, skipped}`（`skipped`：前置失败或条件不满足时跳过并记原因）。
- 每步产出经 `workflow_outputs`（`output_type` + `content` jsonb + `applied=false`）留痕，由 Orchestrator 统一 `return_writeback`。

### 4.3 ai_weekly（AI 周报工作流）

| 项 | 值 |
|---|---|
| 触发 | `weekly`（每周一 09:00 定时；M5 前手动触发）；统计口径 = 上一完整自然周（周一 00:00 – 周日 23:59，`week_start`/`week_end` 存 `workflow_batches`） |
| 入参 | `{ batch_id: "2026W36-AI-WEEKLY", week, topic_id_list: Topic_ID_List, source_packet_ids[], event_pool_ids[] }` |
| 出参 | `selected_events` / `outline` / `content_asset(ai_weekly_script)` / `trend_report` / `secondary_candidates` / `source_packet_update` |
| 产能 | `concurrency_limit=1, serial_mode=true`；`weekly_quota {min:5, max:8}`；不足 5 条按实际通过数发布，批次标 `low_candidate` 触发 `needs_review` |

**Agent 编排（步骤序列与 Prompt 映射）**：

| seq | task_type | Prompt key | 说明 |
|---|---|---|---|
| 1 | `fact_check` | `ai-weekly/fact-check/v1` | 执行 `source_packet_items.number_test_conditions` 逐条断言，更新 `item_verification_status` |
| 2 | `score` | `ai-weekly/event-assessment/v1` | 候选事件五维评估（行业影响/用户感知/技术变化/应用价值/传播潜力），落 `event_pool` 五列 + `source_packet_items.event_assessment`（评估与证据同源） |
| 3 | `select` | `ai-weekly/select/v1` | 选 5-8 条：`selection_status=selected/eliminated`，`elimination_reason` 必填（eliminated 时） |
| 4 | `script_generate` | `ai-weekly/script-generate/v1` | 90 秒中文口播脚本（产出 `content_asset(ai_weekly_script)` 候选） |
| 5 | `outline_generate` | `ai-weekly/outline-generate/v1` | 极简提纲 |
| 6 | `trend_radar` | `ai-weekly/trend-radar/v1` | 产出 `trend_report`（signal_strength / velocity / novelty_score 均 1-10） |
| 7 | `secondary_candidates` | `ai-weekly/secondary-candidates/v1` | 趋势雷达派生的二次候选 → 回写 `event_pool` |
| 8 | `return_writeback` | —（规则） | 产物汇总交 Orchestrator |

**事件必达字段**（`event_pool`，需求五）：`candidate_id`、`published_at`（发布时间）、`source_name`/`source_url`/`source_type`（来源）、`industry_impact`、`user_perception`、`tech_change`、`application_value`、`propagation_potential`、`selection_status`、`elimination_reason`。入池过滤键 = `event_date`（不用 `created_at`）。

### 4.4 github_weekly（GitHub 周榜工作流）

| 项 | 值 |
|---|---|
| 触发 | `weekly`（每周一抓取上一自然周 GitHub Trending Weekly；M5 前手动触发） |
| 入参 | `{ batch_id: "2026W36-GITHUB", week, snapshot_week }` |
| 出参 | `content_asset(github_card)` / `selected_events` / `source_packet_update` |
| 产能 | `concurrency_limit=1, serial_mode=true` |

**Agent 编排**：

| seq | task_type | Prompt key | 说明 |
|---|---|---|---|
| 1 | `snapshot_capture` | `github-weekly/snapshot-capture/v1` | 抓取/解析周榜 → `github_snapshots`（`snapshot_id` 如 `2026W36-GH-ORIGINAL-PURE`；`snapshot_type ∈ {original, replay}`；`selection_basis ∈ {pure_weekly_rank, value_filtered, mixed}`）；捕获列（rank/repository/project_name/weekly_growth/total_stars/repo_url）冻结 |
| 2 | `fact_check` | `github-weekly/fact-check/v1` | 核验仓库信息（复用全局核验枚举 `source_verification_status`）；运营列（verification_status/selected/elimination_reason）可变更并记 `audit_log` |
| 3 | `select` | `github-weekly/select/v1` | 评分选中：`selected=true` → 落 `topics`（`topic_type='technical_project'/'trend'`）；`elimination_reason` 记录淘汰 |
| 4 | `script_generate` | `github-weekly/card-generate/v1` | GitHub 图文卡片生成（产出 `content_asset(github_card)` 候选） |
| 5 | `return_writeback` | —（规则） | 产物汇总 |

**快照不可变（三重保障 + 按字段域冻结，数据模型 §2.4）**：① `UNIQUE(week, snapshot_type, selection_basis)`；② `status='frozen'` 后 BEFORE UPDATE/DELETE 触发器拒绝任何修改/删除；③ Replay 一律**新建行**（`source_item_id` 指向 Original），永不覆盖 Original。Replay 触发为 `/github-weekly` 页人工操作（IA §2.9），工作流仅执行新建行。

### 4.5 evergreen_knowledge（AI 常青知识工作流）

| 项 | 值 |
|---|---|
| 触发 | `manual`（Orchestrator 按 `knowledge_topic_bank.next_action` 路由，或人工点单）；**每次调用恰 1 个主 Topic** |
| 入参 | `{ batch_id: "2026W36-EVERGREEN", main_topic_id?, concept_id?, topic_id_list[] }` |
| 出参 | `knowledge_topic` / `derived_topics` / `content_asset(ai_weekly_script/wechat_article/...)` / `source_packet_update` |
| 产能 | `concurrency_limit=1, serial_mode=true`；一次一主 + 最多 3 衍生（`knowledge_derivations` `UNIQUE(workflow_run_id, round_index)` + 守卫 `checkDerivedTopicBudget` 双保险） |

**Agent 编排**：

| seq | task_type | Prompt key | 说明 |
|---|---|---|---|
| 1 | `select` | `evergreen/select-concept/v1` | 按 `next_action` / `knowledge_status`（uncovered/partial 优先）/ `current_heat` 选定开采概念 |
| 2 | `fact_check` | `evergreen/fact-check/v1` | 概念事实核验（证据包 rollup 至少 `partially_verified` 方可成文） |
| 3 | `script_generate` | `evergreen/knowledge-topic-create/v1` | 产出 `knowledge_topic`（concept/category/knowledge_status/content_status/upstream/related/downstream_concepts）+ 1:1 `topics` 行（`topic_type='knowledge'`） |
| 4 | `script_generate` | `evergreen/content-produce/v1` | 内容生产（口播脚本/公众号文章等，产出 `content_asset` 候选） |
| 5 | `select` | `evergreen/derived-topics/v1` | 衍生 Topic 生成（≤3，`parent_topic_id = main_topic_id`，`round_index ∈ 1..3`） |
| 6 | `return_writeback` | —（规则） | 产物汇总 |

**知识状态联动**：`knowledge_status`（uncovered → partial → basic_explanation → deep_explanation → needs_update → mature）与 `content_status`（to_research → to_produce → script_done → wechat_done → graphic_done → published → high_performing → needs_remake）由本工作流推进；逐资产真实状态以 `content_asset_versions.status` 为准。

### 4.6 wechat_deep_dive（公众号 / 深度专题工作流）

| 项 | 值 |
|---|---|
| 触发 | `manual`（Orchestrator 路由到 scenario/product/conversion 型 Topic；或人工指定） |
| 入参 | `{ batch_id: "2026W36-WECHAT", topic_id, source_packet_id, content_role?, target_user?, ... }` |
| 出参 | `deep_dive_plan` / `image_plan` / `outline` / `content_asset(wechat_article)` / `source_packet_update` |
| 产能 | `concurrency_limit=1, serial_mode=true` |

**Agent 编排**：

| seq | task_type | Prompt key | 说明 |
|---|---|---|---|
| 1 | `select` | `wechat-deep-dive/plan-create/v1` | 定义 **Content Role**（单值，仅选一个：`traffic/cognition/scenario/product/conversion`）+ Target User / Core User Problem / Decision User Needs to Make / Primary CTA → 写 `deep_dive_plans`（`status='drafting'`） |
| 2 | `image_plan` | `wechat-deep-dive/image-plan/v1` | 配图计划 → `deep_dive_image_plans`（`image_type` 7 类，按 `image_type_priorities` 优先级：真实产品截图=1 > 真实UI=2 > 结构信息图=3 > 流程图=4 > 数据图=5 > 概念图=6 > 装饰图=7；真实截图/UI 必须 `from_brand_asset`/`from_verified_source`） |
| 3 | `outline_generate` | `wechat-deep-dive/outline-generate/v1` | 深度提纲（对齐 12 段默认结构） |
| 4 | `script_generate` | `wechat-deep-dive/article-write/v1` | 成文（产出 `content_asset(wechat_article)` 候选） |
| 5 | `return_writeback` | —（规则） | 产物汇总 |

**Deep Dive 硬约束**：单值 `content_role`（CHECK 强制）；每篇仅一个主 CTA（`deep_dive_plans.primary_cta` 默认继承 `topics.primary_cta`，审核校验 `plan.primary_cta == topic.primary_cta`）；蓝图状态机 `drafting → review →（needs_revision ⇄）approved → archived`，`approved` 后才产出资产，进入 Topic 全局状态机（Producing → Review → …）。

---

## 5. Prompt 契约与 /ai-prompts 目录

### 5.1 Prompt 单一来源与取用链路（基线 §9.3）

```
workflow_templates.prompt_refs ──► ai_prompt_templates.key（DB 单一来源）
    或 ──► /ai-prompts/*.md（源文件导入来源）
workflow_templates.step_definition ──► [task_type, provider_class, params]
```

- Prompt 单一来源 = `ai_prompt_templates`（DB 版本化，`UNIQUE(key, version)`；字段：key / workflow_type / name / system_prompt / user_prompt_template / params_schema / version / active）。
- `workflow_templates` 版本化（`UNIQUE(workflow_type_key, version)`）；`workflow_runs` 快照 `template_id + template_version`，保证历史 run 可复现。
- `provider.call` 只收 `promptKey` + `params`，由 Providers 层从 `ai_prompt_templates` 读取渲染后的完整 prompt（模板渲染在 Providers 层完成，业务层不拼接 Prompt 字符串）。
- **禁止**：把 Prompt 写死在页面组件；业务代码直接 `import` 模型 SDK。

### 5.2 key 命名规范（沿用基线示例 `ai-weekly/event-assessment/v1`）

- 格式：`{workflow-slug}/{step-slug}/{v版本}`，全部小写连字符。
- workflow-slug 映射：`orchestrator` / `ai-weekly` / `github-weekly` / `evergreen` / `wechat-deep-dive`。
- 文件 ↔ key 转换：`/ai-prompts/ai-weekly/event-assessment-v1.md` ↔ key `ai-weekly/event-assessment/v1`。

### 5.3 /ai-prompts 目录规划（落地建议：目录尚未创建，见 Deviations [REVIEW]）

```
/ai-prompts/
├── README.md                        # 导入规范（导入脚本 → ai_prompt_templates，版本递增）
├── orchestrator/
│   ├── dedupe-v1.md                 # 候选查重
│   ├── cluster-v1.md                # 聚类归并
│   ├── scoring-v1.md                # 五维评分
│   └── cta-assign-v1.md             # 主 CTA 建议
├── ai-weekly/
│   ├── fact-check-v1.md
│   ├── event-assessment-v1.md       # 基线示例 key 对应文件
│   ├── select-v1.md
│   ├── script-generate-v1.md        # 90 秒中文口播
│   ├── outline-generate-v1.md
│   ├── trend-radar-v1.md
│   └── secondary-candidates-v1.md
├── github-weekly/
│   ├── snapshot-capture-v1.md
│   ├── fact-check-v1.md
│   ├── select-v1.md
│   └── card-generate-v1.md
├── evergreen/
│   ├── select-concept-v1.md
│   ├── fact-check-v1.md
│   ├── knowledge-topic-create-v1.md
│   ├── content-produce-v1.md
│   └── derived-topics-v1.md
└── wechat-deep-dive/
    ├── plan-create-v1.md
    ├── image-plan-v1.md
    ├── outline-generate-v1.md
    └── article-write-v1.md
```

### 5.4 Prompt 契约明细

> 契约 = 输入参数（params_schema）→ 输出结构（与 `workflow_outputs.content` 对齐）→ 核心指令要点 → 护栏绑定。**Prompt 正文不写入本文档**（正文存 `/ai-prompts/*.md` 源文件，导入 `ai_prompt_templates`）。

#### 5.4.1 orchestrator

| key | name | 输入 params | 输出要求 | 护栏绑定 |
|---|---|---|---|---|
| `orchestrator/dedupe/v1` | 候选查重 | `candidates[{candidate_id,title,description,source_name,event_date}]`, `existing_topics[{topic_id,title,trend_tags}]` | 每候选返回 `{candidate_id, dedupe_status: "unique"|"clustered"|"duplicate"|"merged"|"review_required", matched_topic_id?, reason}` | `review_required` 一律转人工裁决，AI 不得自行合并 |
| `orchestrator/cluster/v1` | 聚类归并 | `candidates[]`（查重结果） | `{cluster_key, cluster_name, canonical_topic_id?, member_candidate_ids[]}` | 簇内只允许一个 `canonical_topic_id`；收敛结果需人工可见（`/topics` 候选池 Drawer） |
| `orchestrator/scoring/v1` | 五维评分 | `{topic_id, title, description, topic_type, trend_tags, source_summary}` | `{b2b_relevance, traffic_potential, conversion_potential, timeliness, content_value}（1-10）+ 每维 rationale（≤120 字）` | 每维必须给 rationale；数字依据须引用 `source_packet_items.key_numbers[].source_url`；输出落 `topics.score_rationale` |
| `orchestrator/cta-assign/v1` | 主 CTA 建议 | `{topic_id, business_relevance, topic_type, primary_cta 现状}` | `{cta_key: "book_demo"|"download_whitepaper"|"join_community"|"contact_sales"|"follow_account"|"signup_newsletter", rationale}` | **仅建议**；最终由人工确认（`Ready for Production` 前必填守卫）；每 Topic 仅一个主 CTA |

#### 5.4.2 ai-weekly

| key | name | 输入 params | 输出要求 | 护栏绑定 |
|---|---|---|---|---|
| `ai-weekly/fact-check/v1` | 事件事实核验 | `packet_id`, `facts[{core_fact, key_numbers, number_test_conditions, source_url}]` | 逐条 `{fact_id, status: "verified"|"partially_verified"|"conflict"|"needs_update", notes, checked_number_results[]}` | 执行 `number_test_conditions` 断言（operator/expected/tolerance）；`conflict` 置包级 `source_consistency=conflict`；仅 `verified`/`partially_verified` 可进入成文素材 |
| `ai-weekly/event-assessment/v1` | 事件五维评估 | `{event: {candidate_id,title,description,source_name,source_url,published_at,event_date}, source_packet 摘要}` | `{industry_impact, user_perception, technical_change, application_value, propagation_potential}（1-10 + rationale）` | 评估与证据同源：`source_packet_items.event_assessment`（`assessed_by: "ai:run-xxx"`）；关键数字必须引用 `source_url` |
| `ai-weekly/select/v1` | 入选筛选（5-8） | `assessed_events[]`, `quota: {min:5, max:8}` | `{selected: [{candidate_id, rank, selection_status: "selected"}], eliminated: [{candidate_id, elimination_reason}]}` | 入选数量硬约束 5-8；不足 5 条 → 批次标 `low_candidate` 触发 `needs_review`；淘汰必须给原因 |
| `ai-weekly/script-generate/v1` | 90 秒中文口播 | `{event: {...}, key_numbers, verified_facts[]}` | `{script_text, duration_estimate_sec, cta_text, fact_citations[]}` | 仅引用已核验事实；关键数字逐一带 `source_url` 标注；默认中文（OQ-07） |
| `ai-weekly/outline-generate/v1` | 极简提纲 | `{event: {...}, script_text}` | `{title, bullets[≤5]}` | 提纲不得引入未核验数字 |
| `ai-weekly/trend-radar/v1` | 趋势雷达 | `events[]`, `existing trend_radar 摘要` | `{signals: [{topic_id, signal_strength(1-10), velocity(1-10), novelty_score(1-10), b2b_angle}]}` | 三信号分量 CHECK 1-10；`trend_source='ai_weekly'` |
| `ai-weekly/secondary-candidates/v1` | 二次内容候选 | `trend_report`, `event_pool 现状` | `{candidates: [{title, description, source_topic_ids, trend_tags}]}` | 回写 `event_pool`（`selection_status='pending'`）再走查重流程，不直接建 Topic |

#### 5.4.3 github-weekly

| key | name | 输入 params | 输出要求 | 护栏绑定 |
|---|---|---|---|---|
| `github-weekly/snapshot-capture/v1` | 快照抓取/解析 | `raw_rows[]`（数据源见 OQ-03） | `{snapshot_id, selection_basis, items: [{rank, repository, project_name, weekly_growth, total_stars, repo_url}]}` | 捕获列冻结后不可变；同口径同周唯一（`UNIQUE(week, snapshot_type, selection_basis)`） |
| `github-weekly/fact-check/v1` | 仓库核验 | `items[]`, `packet_id` | 逐条 `{repository, verification_status, notes}` | 复用全局 `source_verification_status` 枚举；`is_confidential` 来源不进白名单 |
| `github-weekly/select/v1` | 榜单筛选 | `items[]`, `selection_basis` | `{selected: [{repository, selected: true}], eliminated: [{repository, elimination_reason}]}` | `selected=true` 落 `topics`（`topic_type='technical_project'/'trend'`） |
| `github-weekly/card-generate/v1` | 图文卡片 | `{repository, project_name, weekly_growth, total_stars, repo_url, 核验结论}` | `{card_text, key_numbers_with_source[]}` | `weekly_growth`/`total_stars` 必须引用快照捕获值 + `repo_url` 来源 |

#### 5.4.4 evergreen

| key | name | 输入 params | 输出要求 | 护栏绑定 |
|---|---|---|---|---|
| `evergreen/select-concept/v1` | 概念选择 | `bank_items[{concept, knowledge_status, content_status, current_heat, next_action}]` | `{concept_id, reason}` | 优先 `uncovered`/`partial`；一次仅选 1 个主概念 |
| `evergreen/fact-check/v1` | 概念核验 | `facts[]`（同 ai-weekly） | 同 ai-weekly `fact-check` | 证据包至少 `partially_verified` 方可成文 |
| `evergreen/knowledge-topic-create/v1` | 知识 Topic 建库 | `{concept, 核验结论, upstream_concepts[], related_concepts[], downstream_concepts[]}` | `{concept, category: "ai_technology"|"ai_product"|"methodology"|"industry_practice"|"tool_tutorial", knowledge_status, learning_cost, long_term_value, current_heat, next_action}` | 概念边（upstream/related/downstream）与 Topic 血缘两套独立边，不互写 |
| `evergreen/content-produce/v1` | 内容生产 | `{concept, key_numbers, 核验结论}` | 同 ai-weekly `script-generate` 输出 | 引用已核验事实与来源 |
| `evergreen/derived-topics/v1` | 衍生 Topic | `{main_topic, bank 图谱}` | `{derived: [{title, description, relation_reason}]}` | **硬约束 ≤3**（`round_index ∈ 1..3`）；超限被 `checkDerivedTopicBudget` 拦截并记 `audit_log`（action=`budget_denied`） |

#### 5.4.5 wechat-deep-dive

| key | name | 输入 params | 输出要求 | 护栏绑定 |
|---|---|---|---|---|
| `wechat-deep-dive/plan-create/v1` | 蓝图创建 | `{topic, source_packet, topics.primary_cta}` | `{content_role(单值), target_user, core_user_problem, decision_user_needs_to_make, primary_cta, section_structure(12 段)}` | `content_role` 单值（CHECK）；`primary_cta` 默认继承 `topics.primary_cta`（审核校验相等）；蓝图进 `deep_dive_plans`（`drafting`） |
| `wechat-deep-dive/image-plan/v1` | 配图计划 | `{section_structure, 可用 brand_assets[]}` | `{images: [{section_key, image_type, description, image_purpose, source_status, source_ref_id?}]}` | 真实截图/UI 必须 `from_brand_asset`/`from_verified_source`；Logo 必须从 Brand Asset Library 取（禁止重绘）；按 `image_type_priorities` 排序 |
| `wechat-deep-dive/outline-generate/v1` | 深度提纲 | `{plan, source_packet}` | `{outline: [12 段逐段要点]}` | 对齐 `section_structure` 12 段默认模板；关键数字标注来源 |
| `wechat-deep-dive/article-write/v1` | 成文 | `{plan, outline, verified_facts, key_numbers}` | `{title, article_text, cta_text, fact_citations[]}` | 关键数字必须带 `source_url`；未经核验事实禁止入文；每篇仅一个主 CTA |

**12 段默认结构**（基线需求八）：Title / Intro / User Problem / Why It Happens / What Changed / Why Existing Solution Fails / Core Problem / Framework-Solution / Real Product Path / Who It Fits / Conclusion / CTA。

### 5.5 版本化与导入流程

1. 编辑 `/ai-prompts/<workflow>/<step>-v{n}.md`（n = 当前版本 + 1）。
2. 导入脚本将 md 内容（front-matter 声明 `key` / `workflow_type` / `params_schema`）写入 `ai_prompt_templates` 新版本行（`UNIQUE(key, version)`），旧版本保留（历史 run 可复现）。
3. `workflow_templates.prompt_refs` 指向新版本 key；`default_template_version` 更新。
4. `workflow_runs` 快照 `template_id + template_version` 保证重跑同模板。

---

## 6. AI Agent 护栏（Guardrails）

### 6.1 护栏总览

| 护栏 | 英文标识 | 强制层级 | 落地位置 |
|---|---|---|---|
| 不自动发布 | `No Auto Publish` | DB 触发器 + 应用层守卫 | `publications` / `topics.status` / `workflow_runs.needs_review` |
| 事实核验 | `Fact Check` | Workflow 步骤 + 状态机守卫 | `fact_check` task、`source_packets` rollup、`Ready for Production` 前置 |
| Logo 必须来自 Brand Asset Library | `Logo From Brand Library` | DB CHECK + 应用层校验 | `brand_assets.ai_policy`、`deep_dive_image_plans.source_status` |
| 关键数字必须有来源 | `Numbers Need Sources` | Prompt 契约 + 落库校验 | `key_numbers[].source_url`、`fact_citations`、`score_rationale` |
| 执行留痕与审计 | `Audit Trail` | 全局约束 | `workflow_runs` / `workflow_tasks` / `workflow_outputs` / `audit_log` |

### 6.2 护栏一：不自动发布（硬性原则 5/6）

- **V1 绝不自动发布**：`publications.status` 只能由人工触发置为 `published` 并回填 `published_date / published_url / published_by`；系统/工作流只生成 `planned → ready`；DB 触发器或应用层权限禁止 workflow 直接写 `published`。
- `topics.status = Published` 仅由人工确认（需存在 `publications` 记录）后进入。
- AI 产出一律先落 `workflow_outputs`（`applied=false`），**仅人工审核通过后提升为 `content_assets`**（两表边界 = 原始产出 vs 审核后资产）。
- run 级门禁吸收态：`workflow_runs.status = needs_review`；人工通过 → `completed`（可联动 `topics.status = Ready to Publish`）。
- UI 所有发布/审核动作显性「人工」标识并关联 `audit_log`，不存在绕过路径（IA §6 决策 5）。

### 6.3 护栏二：事实核验

- 每个 Topic 关联 Source_Packet（三层：`sources` → `source_packet_items` → `source_packets`）；`fact_check` task 执行 `number_test_conditions` 逐条断言并更新核验状态。
- 包级五态 rollup 规则（禁止手填与明细不一致）：任何 `conflict` → 包=`conflict`；任何 `needs_update` → 包=`needs_update`；全部 `verified` → `verified`；部分 → `partially_verified`；否则 `unverified`。
- 来源冲突置 `source_consistency=conflict`，`conflict_fact_ids` 记录冲突事实项，人工逐条裁决（写 `audit_log`，action=`conflict_resolved`）。
- 守卫：`Researching → Ready for Production` 要求证据包核验 ≥ `verified`（部分敏感 Topic 可放宽至 `partially_verified`，由人工确认）。
- `sources.is_confidential=true`（internal 类机密来源）**不进入 AI 成文/送审白名单**。

### 6.4 护栏三：Logo 必须来自 Brand Asset Library

- 数据层强制：`brand_assets` `CHECK (type='logo' → ai_policy='reference_only')` —— Logo 强制"仅参考引用"，**禁止 AI 重绘**（需求十一）。
- 仅 `active=true` 的品牌素材允许 AI 工作流取用；`is_primary_logo` 全局唯一（官方 Logo 兜底指向）。
- 配图计划：`deep_dive_image_plans.source_status` 真实产品截图/UI 必须 `from_brand_asset` 或 `from_verified_source`；`source_ref_id` 指向 `brand_assets.id` 或 `source_packet_items.id`。
- 使用审计：每次取用写 `asset_brand_usages`（usage_kind ∈ logo_composition/background/template/reference）；Logo 类素材禁止 `logo_composition` 之外的合成式使用。
- Prompt 契约绑定：`image-plan` 类 Prompt 的输入参数显式携带可用 `brand_assets[]`（仅 active + 符合 ai_policy 的素材），输出 `source_ref_id` 必须命中该清单。

### 6.5 护栏四：关键数字必须有来源

- 结构化关键数字：`source_packet_items.key_numbers` 数组元素 `{label, value, unit, scope, captured_at, source_url}` —— **`source_url` 为必填项**（落地校验：缺 source_url 的 key_number 不允许进入成文素材）。
- 数字测试条件：`number_test_conditions` 数组 `{key, operator, expected, unit, tolerance, note}` 由 `fact_check` 逐条执行。
- 成文契约：所有 script/article/card 类 Prompt 输出必须含 `fact_citations[]`（引用 `key_numbers` 与 `source_url`）；评分 `score_rationale` 的数字依据须引用来源。
- 示例（`key_numbers` 落库形态）：

```json
[
  {"label": "周 Star 增量", "value": 1234, "unit": "stars", "scope": "2026W35", "captured_at": "2026-09-01T09:00:00Z", "source_url": "https://github.com/owner/repo"}
]
```

- 示例（`number_test_conditions` 落库形态）：

```json
[
  {"key": "total_stars", "operator": ">=", "expected": 5000, "unit": "stars", "tolerance": 0.01, "note": "与仓库主页累计 Star 核对"}
]
```

### 6.6 护栏五：执行留痕与审计

- 所有评分、定级、查重、聚类、CTA 判断、路由、状态迁移由 Orchestrator 作为 `workflow_type='orchestrator'` 的 run 落库；子 workflow 经 `parent_run_id` 挂父 run，形成可审计调用树。
- 任何人工审核动作与状态变更写 `audit_log`（`actor = 用户标识 或 ai:run-xxx`）；`topic_status_history` / `source_packet_verifications` 为 `audit_log` 视图。
- 产物幂等：`workflow_outputs.applied` 标记 Orchestrator 是否已消费，同一产物只消费一次。

---

## 7. 错误处理与重试

| 场景 | 处理 |
|---|---|
| Provider 网络错误 / 5xx / 429 | Provider 层指数退避重试（可配置次数）；仍失败 → task `failed` → run `failed`（`error` jsonb 记原因）→ 人工 `failed → queued` retry（`attempt_count+1`，模板/输入不变） |
| 结构化输出解析失败 | Provider 层重试（修正 temperature=0 或换 json mode）；持续失败 → task failed |
| 单步骤失败（可跳过） | task `skipped`（记原因），后续步骤按 `step_definition` 条件继续或终止 |
| 产物需人工审核 | run → `needs_review`；人工通过 → `completed`；退回 → 同 run 重跑（`attempt_count+1`，不新建 run） |
| 同批整体重跑 | 新建 `workflow_batches`（batch_id 追加 `-NN`），同模板同输入可复现 |
| 衍生超限 | `checkDerivedTopicBudget` 拦截 → `audit_log`（action=`budget_denied`），run 可正常完成但超限部分丢弃并提示 |
| token 超限 | `AIRequest.maxTokens` 由 `system_settings` 默认值控制（建议 4096），超限在 Provider 层截断 + 记审计 |

---

## 8. 落地路径（对齐 _canonical-roadmap）

| 阶段 | 任务 | Agent 规格落地内容 |
|---|---|---|
| M0（D2） | 迁移与种子 | `ai_prompt_templates` 初版种子（本文件 §5.4 的 key 清单）；`workflow_types` / `workflow_templates` v1（input_schema / output_schema / prompt_refs / step_definition） |
| M2（D9） | Workflow 引擎核心 + AI 抽象层 | `/lib/ai/providers` 统一 `call()`（`AIRequest`/`AIResponse` + mock provider）；`/lib/ai/orchestrator`、`/lib/ai/workflows` 目录与类型契约；`ai_prompt_templates` 读取链路；验收：mock 跑通 run 全生命周期 + `needs_review` + `applied` 幂等 |
| M3（D10） | Orchestrator + ai_weekly 垂直切片 | §3.3 十二步流水线 + §4.3 ai_weekly 端到端；Dashboard 两 CTA 可用；Prompt 模板全部落 `ai_prompt_templates` |
| M3（D11-D13） | github_weekly / evergreen_knowledge / wechat_deep_dive | §4.4 / §4.5 / §4.6 编排与 Prompt 契约落地 |
| M5 | 优化闭环 | `scheduling='weekly'` 定时器（每周一 09:00）、`next_action` 驱动开采、趋势雷达跨周 |

**前置决策**（roadmap 开放问题）：OQ-01（真实 Provider 选型，D9 mock → D10 真实）、OQ-03（GitHub Trending 数据源）、OQ-07（默认中文）。

---

## 9. Open Questions（本文档悬而未决）

| 编号 | 问题 | 影响范围 | 推荐方案 |
|---|---|---|---|
| AOQ-01 | 真实 LLM Provider 的最终选型与 OpenAI 兼容性确认：若选 DeepSeek/自托管网关走 OpenAI 兼容协议，`OpenAICompatibleProvider` 即为唯一实现；若选 Anthropic 原生 SDK 是否值得单独实现 `AnthropicProvider`？ | D9、D10、成本 | 推荐 V1 全部经 OpenAI 兼容协议收敛（baseURL 可切换），暂不实现 Anthropic 原生适配器；OQ-01 确认后定 |
| AOQ-02 | 结构化输出契约的落地载体：`outputSchema` 用 `ZodType` 还是 `JSONSchema`？（基线二者并列） | D9、全部 workflow | 推荐 Zod（TS 项目内类型安全 + 校验错误信息友好），Provider 层内部转 JSON Schema 发给模型 |
| AOQ-03 | `/ai-prompts/*.md` 与 `ai_prompt_templates`（DB）的同步机制：迁移脚本一次性导入 / 运行时热同步 / 仅手动导入？ | D2、D9、Settings | 推荐迁移/脚本导入（md 为源，DB 为运行态），并支持 `/settings` 查看版本；不运行时热同步 |
| AOQ-04 | 90 秒中文口播的时长↔字数换算规则（约 240-270 字/90 秒？）与 `script-generate` 的生成方式（一次成稿 vs 先列要点再成稿）？ | D10、ai_weekly | 推荐单轮生成 + 字数上限约束（prompt 参数 `max_chars≈270`）；验收时人工微调 |
| AOQ-05 | token/成本预算上限：是否需要 `system_settings` 增加 `ai.provider.defaults`（temperature/maxTokens）与 `ai.retry.max_attempts` 等配置 key？（数据模型 `system_settings` 未枚举 AI 侧 key） | D9、Settings、成本审计 | 推荐追加（属"只追加不删减"；需在实现时登记到 `system_settings` 种子） |
| AOQ-06 | Provider API Key 的存储与读取：环境变量 / Supabase Secrets / `system_settings`（落库须掩码）？ | D9、Settings、安全 | 推荐环境变量 + 运行时注入（`/settings` 只展示已配置状态与模型名，不存密钥） |
| AOQ-07 | 趋势雷达管理（Orchestrator 第 10 步）是否需要模型参与（跨工作流信号汇总/去噪），还是纯规则回写？ | D10、M5 | 推荐 V1 纯规则回写（生成已在 workflow 完成），M5 视信号质量再评估 |
| AOQ-08 | 中文语言假设与文风基线确认（口播/公众号默认中文；Prompt 模板显式声明）；是否需要品牌语气（voice & tone）文档作为 Prompt 全局上下文？ | D10、Prompt 模板 | 推荐默认中文（OQ-07 确认）+ 首版以需求十九 UI 风格推导的克制/专业语气，品牌 voice 文档后置 |
| AOQ-09 | `/ai-prompts` 目录（§5.3）与 `ai_prompt_templates` 种子数据的建立时机：随 D2 建初版，还是 D10 建首个垂直切片所需的子集？ | D2、D10 | 推荐 D2 只建注册表骨架 + D10 建 ai_weekly 子集，避免空 Prompt 种子 |

---

## 附录 A：术语速查（英文 → 中文）

| 英文标识符 | 中文 | 枚举/取值 |
|---|---|---|
| `AIProvider` | 模型适配器统一接口 | id：anthropic / openai / deepseek / mock / openai-compatible |
| `AIRequest` | AI 请求 | promptKey / params / outputSchema / maxTokens / temperature |
| `AIResponse` | AI 响应 | content（结构化）/ usage（promptTokens/completionTokens/costCents） |
| `provider_class` | Provider 适配器类 | workflow_tasks 列，成本/延迟审计 |
| `promptKey` | Prompt 模板 key | `ai-weekly/event-assessment/v1` 模式（`{workflow}/{step}/{v版本}`） |
| `workflow_type` | 工作流类型 | orchestrator / ai_weekly / github_weekly / evergreen_knowledge / wechat_deep_dive |
| `workflow_output_type` | 产物类型 | production_plan / selected_events / trend_report / secondary_candidates / derived_topics / content_asset / source_packet_update / outline / knowledge_topic / deep_dive_plan / image_plan |
| `workflow_run_status` | Run 状态 | queued / running / completed / failed / needs_review |
| `workflow_task_status` | 步骤状态 | queued / running / completed / failed / skipped |
| `batch_status` | 批次状态 | planned / dispatching / in_progress / needs_review / completed / failed |
| `selection_basis` | 榜单口径 | pure_weekly_rank / value_filtered / mixed |
| `snapshot_type` | 快照类型 | original / replay |
| `content_role` | 内容角色 | traffic / cognition / scenario / product / conversion（单值） |
| `ai_policy` | 素材 AI 取用策略 | allow_remix / reference_only / prohibited（type='logo' 强制 reference_only） |
