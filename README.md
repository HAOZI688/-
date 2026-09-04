# 图文工厂 Content OS（内容操作系统）

面向 B2B AI Agent 内容团队的内容运营系统：**Topic 选题 → 内容生产（AI 工作流 + 人工门禁）→ 发布管理 → 数据回流 → 表现反馈 → 涨粉归因 → 趋势雷达** 的每周持续运营闭环。

- **V1**（tag `v1.0.0`，43 表冻结）：Topic 系统、来源核验、AI 工作流引擎、内容资产、发布管理、数据回流（CSV 导入）、表现闭环
- **V2**（47 表）：Content Orchestrator 自动规划 + 4 个真实 AI Workflow + DAG 依赖 + 三道人工门禁 + 周一 Scheduler + Topic 反馈
- **V3**（58 表）：**Production Workbench** —— 运营工作台（/dashboard 升级）、每周计划评分明细、生产监控台、审核 Tabs、全局搜索、Trend Radar（8 信号）、涨粉归因（28 天基线概率分配）、小豆芽 Connector Production Mode（File Import 一等能力）、Notification Center

## 技术栈

Next.js 16.3.4（App Router / Turbopack）· React 19 · TypeScript 5.9 · Tailwind v4 · Drizzle ORM 0.44 + postgres.js · PostgreSQL 16（Docker）

## 快速开始

```bash
# 数据库（Docker）
docker compose up -d            # postgres://contentos:contentos@localhost:5432/contentos

# 依赖 + 迁移 + 种子
pnpm install
pnpm db:migrate                 # 0000-0004（58 表）
pnpm db:seed                    # 全表开发数据（含 V3 演示场景）

# 开发 / 生产
pnpm dev                        # :3000
pnpm build && pnpm start        # 生产构建；本机 dev 占用 3000 时用 env PORT=3210 pnpm start
```

## 目录

```
src/app/(app)/                  # 30 个页面路由（V3 工作台见 docs/16）
src/app/actions/                # server actions（返回 void + revalidatePath 契约）
src/lib/db/schema/              # 24 个 schema 文件（58 表）
src/lib/repositories/           # 按实体分层（16 个），页面不直接碰 Drizzle
src/lib/services/               # 业务层（评分/归因/趋势/通知/连接器/基线）
src/lib/workflows/engine.ts     # V2 Workflow Contract（勿破坏）
drizzle/                        # 迁移 0000-0004（历史迁移禁止重写）
scripts/v3-e2e-cdp.mjs          # Browser E2E（CDP 真实浏览器，12 项）
```

## QA 证据（V3，docs/19）

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 零错误 |
| `pnpm build` | ✅ 通过 |
| Route Smoke（22 URL，Expected/Actual/PASS/FAIL） | ✅ 22/22（/templates 从未存在，记 N/A） |
| Browser E2E（CDP 真实浏览器 12 项，含 2 条 Flight POST） | ✅ 12/12 |
| Data Model Audit（docs/15） | ✅ PASS（58 表 / 5 迁移 / 10 条 V3 一致性断言） |

## 核心约定

- **Server Action 契约**：`<form action={fn.bind(null, arg)}>` 直连；fn 返回 `void`；**禁止内联 async 函数**（会 500）
- **Topic canonical route**：`/topics/{topic_id}`（业务 ID，如 `2026W36-001`），禁止混用 UUID；趋势详情 `trend_key`（兼容 UUID）
- **三道人工门禁**：选题确认 → 内容审核 → 发布确认；**AI 绝不自动发布**
- **上一自然周严格周一~周日**，禁止滚动周；Orchestrator 周一生成 draft，人工确认后才生产
- **归因禁 LLM 猜测**：28 天基线（排除异常日）→ Incremental → 概率分配（0.4/0.3/0.2/0.1）→ high_confidence/probable/assisted，每条结果带 evidence
- **禁止 V3 页面硬编码 mock**（仅 Seed 开发数据）；避免 Dashboard N+1（Promise.all 预取）

## 文档索引（docs/）

| 文档 | 内容 |
|---|---|
| 00-14 | V1 规格与基线（vision / PRD / IA / 数据模型 / 工作流 / AI / 状态机 / 设计系统 / API / 验收 / 路线图 / 数据集成 / Topic 表现） |
| 15 | 数据模型审计（58 表，含 V3 增量审计） |
| 16 | V3 Production Workbench（页面总览 / Action Center / 评分 / 生产 / 审核 / 搜索） |
| 17 | V3 Trend Radar + Follower Attribution（8 信号 / 归因数学 / Config Version Trace） |
| 18 | V3 小豆芽 Connector Production Mode + Notification Center |
| 19 | V3 QA 与交付（Route Smoke / Browser E2E / 构建 / §56 十五节对照） |
| implementation-progress.md | 实施进度（V1/V2/V3 全记录） |
| _canonical-*.md | V1 基线文档 |

## 运行约定

- 开发：`pnpm dev`（:3000，用户使用）；生产：`env PORT=3210 pnpm start`（日志 /tmp/contentos-server.log）
- DB 查询：`node --import tsx -e "import postgres from 'postgres'; ..."`
- Browser E2E：`node scripts/v3-e2e-cdp.mjs --base=http://localhost:3210`（前置：生产构建 + seed + Chrome CDP 9223）
- 周一 Scheduler：`POST /api/cron/scheduler`（自动生成上一自然周 draft，不自动批准/发布）
