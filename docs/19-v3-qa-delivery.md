# 19 V3 QA 与交付（Route Smoke / Browser E2E / 构建结果 / 交付格式）

> **状态**：V3 已交付（2026-09-04）。文档系列第 19 份。
> 对应规格：Route Smoke（22 URL 记录 Expected/Actual/PASS/FAIL）+ Browser QA 真实浏览器 CDP 12 项 + 最终交付格式（§56 十五节）。
> 原则：**Server Action 必须走真实浏览器表单（Flight 请求），禁止手造 multipart**；所有数字来自实测，不预填 PASS。

---

## 1. 构建与静态检查

| 检查 | 结果 | 说明 |
|---|---|---|
| `npx tsc --noEmit` | ✅ 零错误 | 全部 24 个 schema 文件 + 新 repository/service/action 通过 |
| `pnpm build` | ✅ 通过 | Compiled successfully in ~511ms（Turbopack），静态页 5/5 |
| 路由修复回归 | ✅ 3/3 | 趋势详情页业务 ID 修复后重跑 tsc + build + E2E 12/12（见 §3） |

**交付前发现的真实 bug（已修复）**：`/trend-radar/{非UUID}` 曾抛 PG 22P02（500）。
修复：`getTrend()` 先正则判断 UUID，再决定是否参与 `id` 比较；详情页子查询统一走 `trend.id`（UUID）；
列表页与 /api/search 的 href 改用业务 ID `trend.trendKey`。修复后：`/trend-radar/agent-skills` 200、UUID 兼容 200、不存在 ID 404（notFound，不再 500）。

## 2. Route Smoke（22 URL：Expected / Actual / PASS / FAIL）

实测环境：`next start` :3210（生产构建），2026-09-04。Expected = 200（页面可渲染）；根路径 307 重定向至 /dashboard 属预期。

| # | URL | Expected | Actual | 结果 |
|---|---|---|---|---|
| 1 | /dashboard | 200 | 200 | ✅ PASS |
| 2 | /weekly-plan | 200 | 200 | ✅ PASS |
| 3 | /production | 200 | 200 | ✅ PASS |
| 4 | /review | 200 | 200 | ✅ PASS |
| 5 | /trend-radar | 200 | 200 | ✅ PASS |
| 6 | /trend-radar/agent-skills（业务 ID 详情） | 200 | 200 | ✅ PASS |
| 7 | /analytics/attribution | 200 | 200 | ✅ PASS |
| 8 | /notifications | 200 | 200 | ✅ PASS |
| 9 | /connectors/xiaodouya | 200 | 200 | ✅ PASS |
| 10 | /connectors/xiaodouya/mappings | 200 | 200 | ✅ PASS |
| 11 | /api/search（POST，全局搜索） | 200 | 200 | ✅ PASS |
| 12 | /topics | 200 | 200 | ✅ PASS |
| 13 | /sources | 200 | 200 | ✅ PASS |
| 14 | /knowledge | 200 | 200 | ✅ PASS |
| 15 | /github-weekly | 200 | 200 | ✅ PASS |
| 16 | /workflows | 200 | 200 | ✅ PASS |
| 17 | /workflows/runs | 200 | 200 | ✅ PASS |
| 18 | /content | 200 | 200 | ✅ PASS |
| 19 | /publications | 200 | 200 | ✅ PASS |
| 20 | /accounts | 200 | 200 | ✅ PASS |
| 21 | /analytics | 200 | 200 | ✅ PASS |
| 22 | /settings | 200 | 200 | ✅ PASS |

**结果：22/22 PASS。**
补充记录：`/` 307 → /dashboard（✅ 预期重定向）；`/templates` **N/A**——该路由在代码库中从未存在（git tree 无、无导航链接、非规格要求路由），不计入 FAIL。

## 3. Browser QA（真实浏览器 / CDP 交互 12 项）

工具：`scripts/v3-e2e-cdp.mjs`（Node 22 内置 WebSocket 连 CDP，Chrome for Testing，端口 9223）。
交互基线（docs 06 §6.3）：**所有 Server Action 均通过真实浏览器表单提交**（原生 `<form action={fn.bind(null,arg)}>` → Next-Action POST，Flight 编码）；脚本只点击真实按钮 / 提交真实表单 / 断言 DOM，**不手造请求**。

| # | 测试项 | 结果 | 证据 |
|---|---|---|---|
| 1 | Dashboard 工作台渲染（本周内容运营卡 / 优先级队列） | ✅ | 页面文本断言 |
| 2 | 生成本周计划（Server Action form） | ✅ | 点击「生成本周内容计划」→ 出现 Gate 1 确认按钮 |
| 3 | 确认选题（Gate 1） | ✅ | 计划 confirmed，出现「开始生产」 |
| 4 | /weekly-plan 评分公式说明 + 计划项明细 | ✅ | 公式说明卡可见 |
| 5 | /review 三 Tab（选题/内容/发布） | ✅ | Tab 可切换 |
| 6 | 全局搜索（⌘K 真实 keydown → POST /api/search） | ✅ | 命中 Agent Skills 趋势/话题 |
| 7 | /trend-radar 列表（上升/稳定/下滑）+ 详情页 | ✅ | 状态徽标 + 覆盖 + 评分明细页 |
| 8 | /notifications（种子通知渲染） | ✅ | 通知条目可见 |
| 9 | /analytics/attribution（基线/增量/置信度） | ✅ | `<details>` 展开后高置信/可能可见 |
| 10 | 小豆芽连接器（新鲜度/CSV 导入/未匹配） | ✅ | 新鲜度表 + 导入表单 + 未匹配区 |
| 11 | 映射模板列表 + 预设保存按钮 | ✅ | 模板行 + 保存动作 |
| 12 | /production 监控台（DAG 状态 + Run 明细） | ✅ | 状态统计 + 运行明细 |

**结果：12/12 PASS。**

网络层确认（Server Action 真实 Flight POST，Network.requestWillBeSent 捕获）：

```
- POST http://localhost:3210/dashboard action=["2026W36"]        ← 生成本周计划
- POST http://localhost:3210/dashboard action=[uuid]            ← 确认选题（Gate 1）
```

完整输出：`/tmp/v3-e2e-results.md`（12/12 PASS，含 2 条 Flight POST）。

## 4. Data Model Audit（docs/15 更新）

- 状态：✅ PASS（V1 基线 + V3 增量审计两节）
- V3 新增 15 表（43 → 58），0004 迁移只增不改；10 条 V3 一致性断言全部 ✅；
- 实体映射表（Trend/TrendEvidence/TrendScoreConfig/AttributionRun/Result/AccountGrowthBaseline/ImportMappingTemplates/MetricFreshness/Notifications/WeeklyPlanScoreBreakdown/ConfigVersionTrace）全部 ✅。

## 5. 交付格式对照（§56 十五节）

| 节 | 交付物 | 位置 | 状态 |
|---|---|---|---|
| 1 | V3 页面（10 路由，无硬编码 mock） | src/app/(app)/* + /api/search | ✅ |
| 2 | Production Workbench（Dashboard/Weekly Plan/Production/Review） | docs/16 | ✅ |
| 3 | Trend Radar（8 信号 + Gate + 快照时间线） | docs/17 | ✅ |
| 4 | Follower Attribution（基线/增量/概率分配/evidence） | docs/17 | ✅ |
| 5 | 小豆芽 Connector Production Mode（File Import/Adapter/未匹配） | docs/18 | ✅ |
| 6 | Metric Freshness（<48h / 48h-168h / >168h） | docs/18 | ✅ |
| 7 | Notification Center（9 类型） | docs/18 | ✅ |
| 8 | Topic Performance V2 + Weekly Planning V2（adjustment 明细） | docs/16 + docs/15 §6.1 | ✅ |
| 9 | 增量 Migration 0004（58 表，零历史重写） | drizzle/0004_v3_workbench.sql | ✅ |
| 10 | Seed 覆盖（3 trends/2 增长场景/低置信/未匹配/stale） | src/lib/db/seed.ts V3 段 | ✅ |
| 11 | Data Model Audit（PASS/WARNING/FAIL） | docs/15 | ✅ |
| 12 | Route Smoke（22 URL Expected/Actual/PASS/FAIL） | 本文档 §2 | ✅ 22/22 |
| 13 | Browser QA（CDP 12 项 + Flight POST 证据） | 本文档 §3 | ✅ 12/12 |
| 14 | 构建（tsc 零错误 + pnpm build 通过） | 本文档 §1 | ✅ |
| 15 | 实现进度 + README | docs/implementation-progress.md + README.md | ✅ |

## 6. 已知取舍

- 趋势详情路由使用 `trend_key`（业务 ID），同时兼容 UUID（不 404/500）；Topic 路由按规范仅业务 ID。
- `/templates` 路由 N/A（从未存在于代码库，非规格要求）。
- 归因结果在 `<details>` 折叠内（页面结构使然），E2E 通过展开 DOM 断言，不影响真实用户。
