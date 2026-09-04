# 16 V3 Production Workbench（运营工作台）

> **状态**：V3 已交付（2026-09-04）。文档系列第 16 份。
> 对应规格：V3 Production Workbench（58 章节规范）。
> 原则：**禁止页面硬编码 mock**，全部真实落库（Seed 开发数据除外）；Server Action 契约见 docs/06 §6.3。

---

## 1. 页面总览

| 路由 | 页面 | 职责 |
|---|---|---|
| /dashboard | 运营工作台（升级） | Current Cycle + Weekly Action Center + Workflow Status + Priority Topic Queue + Review/Publish Queue + Performance Feedback |
| /weekly-plan | 本周内容计划（新） | 评分公式说明 + 计划项（base/trend/perf/conversion/gap 调整明细 + final_score + reason_codes）+ Approve/Pause/Reject/Edit |
| /production | 生产监控台（新） | 全局状态条（queued/running/completed/failed）+ 4 类型 DAG 卡 + 本周计划状态 + Run 明细（Retry/Cancel） |
| /review | 待审核（升级） | Tabs：选题确认 / 内容审核 / 发布确认 |
| /trend-radar | 趋势雷达（新） | 8 信号评分列表 + 详情（评分明细/来源证据/覆盖 Topic/时间线） |
| /analytics/attribution | 涨粉归因（新） | 账号基线 + 归因 Run + 结果（高置信/可能/辅助） |
| /notifications | 通知中心（新） | 9 种通知类型，read 状态 |
| /connectors/xiaodouya | 小豆芽连接器（升级） | Adapter 模式 + 新鲜度 + CSV 导入 + 未匹配手动匹配 |
| /connectors/xiaodouya/mappings | 映射模板（新） | 模板列表 + 预设保存 + 自动检测说明 |
| /api/search | 全局搜索 API（新） | topics/trends/assets/publications ILIKE 聚合 |

## 2. Dashboard 工作台（/dashboard）

### 2.1 Current Cycle + Weekly Action Center

状态驱动动作流（本周计划 `thisWeekPlan`）：

| 计划状态 | 动作 | 契约 |
|---|---|---|
| 无计划 | 生成本周内容计划 | `generatePlanAction.bind(null, thisWeek)` |
| draft | 确认本周选题 | `confirmPlanAction.bind(null, planId)` |
| confirmed | 确认并开始生产 | `startProductionAction.bind(null, planId)` |
| production | 链接 → /production | Link |

### 2.2 数据加载（一次 Promise.all，避免 N+1）

```ts
const [stats, topics, plans, assets, pubs, runs, perfRows, unread] = await Promise.all([...]);
```

- `getDashboardStats()`：V1 统计行（来源/资产/发布等）
- Workflow Status：`workflowRepository.listRunsWithTopic(100)` 一次取回后按 type×status 分组
- Priority Topic Queue：当前计划项按 `finalScore` 降序，显示 base/trend/perf/conversion/gap 调整行 + reason_codes 中文 badge
- Performance Feedback：`topicPerformanceV2Service.listAll(week.weekKey)`（上一完整自然周）

### 2.3 Topic 链接规范

**canonical route：`/topics/{topic_id}`（业务 ID，如 2026W36-007），禁止混用数据库 UUID。**

```ts
const topicByUuid = new Map(topics.map((t) => [t.id, t]));
const bizId = (uuid: string) => topicByUuid.get(uuid)?.topicId ?? uuid;
```

## 3. Weekly Plan（/weekly-plan）

- 本周计划匹配：`isoWeekKey(new Date())` 匹配 plans，回退 `plans[0]`
- 评分公式说明卡：`final = clamp(base + trend + perf + conv + gap, 0, 10)`（Orchestrator V3 数学）
  - trendAdjustment = (trendScore - 5) × 0.3（±1.5）
  - performanceAdjustment = (perfScore - 5) × 0.2（±1）
  - conversionAdjustment = (convScore - 5) × 0.15（±0.75）
  - knowledgeGapAdjustment = 无资产且无知识时 +0.5
- 计划项操作：pending → 通过/暂停/拒绝；approved → 暂停；paused → 恢复；editable → 下拉编辑（priority/contentRole/workflowType）
- 编辑表单：`<form action={editPlanItemFormAction.bind(null, item.id)}>`（包装 editPlanItemAction，读 FormData 三个 select，非空才 patch）

## 4. Production（/production）

- 全局状态条：queued/running/completed/failed 计数
- 4 类型 DAG 卡（ai_weekly/github_weekly/evergreen/wechat_deep_dive）× 状态计数
- Run 明细（前 50）：failed 行红底 + `retryRunAction`；queued/running → `cancelQueuedRunAction`
- 执行记录链接 → /workflows/runs（无单 run 详情页，避免 404）

## 5. Review（/review）

客户端 Tabs 组件（`review-tabs.tsx`），server 壳传 props：

```tsx
<ReviewTabs latestPlan={} pendingItems={} inReviewAssets={} confirmPubs={} />
```

三个 Tab 保留原 Gate 操作：confirmPlanAction / rejectPlanItemAction / startProductionAction / approveAssetAction / revisionAssetAction / confirmPublicationAction。

## 6. 全局搜索（⌘K）

- CommandMenu：`⌘K` 打开（真实 keydown 事件），300ms 防抖 → `POST /api/search {q}`
- 结果分组：页面直达（19 条 NAV_ITEMS）+ 数据组（topics ≤8 / trends ≤5 / contentAssets ≤5 / publications ≤5）
- SearchResultGroup：`{label, hint, items: {href, title, subtitle}}`

## 7. 状态与标签字典

`src/lib/labels.ts`（共享，禁止页面局部重复定义）：ITEM_STATUS_LABELS（含 paused/rejected）、REASON_CODE_LABELS（8 种中文）、NOTIFICATION_TYPE_LABELS（9 种）、TREND_STATUS_LABELS/TONES、COVERAGE_STATUS_LABELS、ATTRIBUTION_TYPE_LABELS/TONES、FRESHNESS_LABELS/TONES、RECOMMENDATION_LABELS。

## 8. 与 V2 Workflow Contract 的关系

V3 页面**不修改** V2 引擎契约（engine.ts：startWorkflowRun → executeRun → writeBackRunOutputs → advanceDependenciesOf）。V3 只新增 revalidatePath 覆盖路径（planning/review/scheduler 均补 /weekly-plan、/production）。
