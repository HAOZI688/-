# 18 V3 小豆芽连接器生产模式与通知中心

> **状态**：V3 已交付（2026-09-04）。文档系列第 18 份。
> 对应规格：V3 §1-§9（Connector Production Mode）、§26（Metric Freshness）、§27（Notification Center）。
> 核心原则：**File Import 一等能力；API Mode 默认 Not Configured，禁止伪造 endpoint**。

---

## 1. 连接器 Adapter 契约（src/lib/services/connector-sync.ts）

```ts
interface SocialDataConnectorAdapter {
  mode: "api" | "file_import";
  testConnection(): Promise<{ ok: boolean; detail: string }>;
}
```

- 选择逻辑：`getConnectorAdapter()` 按 connector config.mode 切换
- **API Mode 未配置**：`testConnection()` 固定返回 `{ ok: false, detail: "API Mode 未配置：当前没有小豆芽公开 API Contract，不伪造 endpoint" }`——页面显示红色徽标，禁止凭空造 endpoint
- **File Import Mode**：默认模式（seed config `{ mode: "file_import" }`），CSV 全流程

## 2. CSV 导入流程（检测 → 映射 → 导入）

```
上传 CSV → detectMapping（读表头）→ matchTemplate（requiredColumns 命中比例）
→ 命中则 preview + import；未命中 → 建议保存新模板 → confirm → import
```

- 幂等：external_posts 唯一键 = connector + platform + external_post_id（缺 ID 时用 external_url 兜底）
- 账号导入：connector_accounts 按 external_account_id upsert
- 手动匹配（§37 人工兜底）：未匹配作品行内 `<select name="publicationId">` + 提交 → `manualMatchPostAction(postId, publicationId)` 改 match_status unmatched → confirmed
- 导入批次 / 同步任务留痕：data_import_batches（total/success/failed）+ data_sync_jobs

## 3. Metric Freshness（指标新鲜度，§26）

| 级别 | 条件（ageHours = now − lastCapturedAt） | 默认配置 |
|---|---|---|
| fresh | < 48h | FRESHNESS_DEFAULTS.freshHours = 48 |
| aging | 48h ~ 168h（7 天） | agingHours = 168 |
| stale | > 168h | — |

`connectorSyncService.freshness(ageHours, config?)` + `accountFreshness()` 聚合账号级最新快照。
页面「账号数据新鲜度」表：账号/平台/粉丝/新增/最近采集/数据年龄（"36h"）/新鲜度徽标（绿/橙/红）。

## 4. 映射模板（/connectors/xiaodouya/mappings）

- 列表：名称/数据类型（account/post/account_metrics/post_metrics）/版本/期望列/状态/列映射预览
- 保存：预设模板按钮（作品映射 post / 账号映射 account / 作品指标 post_metrics）→ `saveMappingTemplateAction`
- 检测逻辑：requiredColumns 命中比例决定自动匹配；active=1 才参与检测

## 5. 通知中心（§27，9 种类型）

| type | 触发场景 | severity |
|---|---|---|
| weekly_plan_ready | Orchestrator 生成周计划（seed 已含） | info |
| workflow_failed | 工作流 run 失败 | error |
| content_needs_review | 内容资产进入 in_review | info |
| publication_needs_confirmation | 发布计划待确认 | info |
| data_sync_failed | 同步任务失败 | error |
| unmatched_external_post | 导入作品无匹配 | warning |
| metrics_stale | 账号快照超 168h 未更新 | warning |
| trend_p0_detected | 趋势评分 ≥ P0 阈值 | info |
| attribution_completed | 归因 run 完成 | info |

- 字段：title/message/link/entity_type/entity_id/read/read_at/severity
- 页面 /notifications：分组渲染 + 未读数（dashboard 徽标）+ 已读/未读状态
- 服务：notificationService.notify() / countUnread() / markRead()

## 6. 前端契约要点（docs 06 §6.3）

- 所有 Server Action 走真实浏览器表单：`<form action={fn.bind(null, arg)}>`，**禁止内联 async 函数**
- CSV 文件上传：`<form action={submitXxxCsv}>`（页面内 `"use server"` 包装 → 返回 void）
- 手动匹配：页面内 inline server action 读取 select 值后调用 manualMatchPostAction
- 幂等导入测试通过 `pnpm db:seed` 的 external_posts 唯一键验证
