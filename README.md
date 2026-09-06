# 图文工厂 Content OS（内容操作系统）

面向 B2B AI Agent 内容团队的内容运营系统：**Topic 选题 → 内容生产（AI 工作流 + 人工门禁）→ 发布包 → 发布管理 → 数据回流 → 表现反馈 → 涨粉归因 → 趋势雷达** 的每周持续运营闭环。

- **V1**（tag `v1.0.0`，43 表冻结）：Topic 系统、来源核验、AI 工作流引擎、内容资产、发布管理、数据回流（CSV 导入）、表现闭环
- **V2**（47 表）：Content Orchestrator 自动规划 + 4 个真实 AI Workflow + DAG 依赖 + 三道人工门禁 + 周一 Scheduler + Topic 反馈
- **V3**（58 表）：**Production Workbench** —— 运营工作台（/dashboard 升级）、每周计划评分明细、生产监控台、审核 Tabs、全局搜索、Trend Radar（8 信号）、涨粉归因（28 天基线概率分配）、小豆芽 Connector Production Mode（File Import 一等能力）、Notification Center
- **V4**（61 表）：**Production Ready** —— 发布包（GitHub 周榜包 + QA 门禁 + 品牌资产中心）、CSV 导入生产化（编码检测/行级错误/失败行重试导出/历史导入/重复检测/五级匹配链）、AI Provider Resilience（超时/重试/Fallback/质量 Gate/needs_manual/幂等重试/成本留痕）、Live Operation Mode（APP_MODE + seed 排除 + 冷启动保护 + Action Center）、最小登录认证 + /system/readiness + 诚实调度状态 + 飞书出站通知、备份恢复实测 + 数据导出

## 技术栈

Next.js 16.3.4（App Router / Turbopack）· React 19 · TypeScript 5.9 · Tailwind v4 · Drizzle ORM 0.44 + postgres.js · PostgreSQL 16（Docker）

## 快速开始

```bash
# 数据库（Docker）
docker compose up -d            # postgres://contentos:contentos@localhost:5432/contentos

# 依赖 + 迁移 + 种子
pnpm install
pnpm db:migrate                 # 0000-0007（61 表）
pnpm db:seed                    # 全表开发数据（含 V3/V4 演示场景）

# 开发 / 生产
pnpm dev                        # :3000
pnpm build && pnpm start        # 生产构建；本机 dev 占用 3000 时用 env PORT=3210 pnpm start

# 上线前必须配置（.env，见 .env.example）
# AUTH_PASSWORD_HASH=  APP_MODE=live  AI Provider Key  CRON_SECRET（可选）
```

## 目录

```
src/app/(app)/                  # 33 个页面路由（V4 新增发布包/品牌资产/readiness）
src/app/proxy.ts                # 登录保护（Next.js 16 Proxy，原 Middleware）
src/app/actions/                # server actions（返回 void + revalidatePath 契约）
src/lib/db/schema/              # 25 个 schema 文件（61 表）
src/lib/repositories/           # 按实体分层（17 个），页面不直接碰 Drizzle
src/lib/services/               # 业务层（评分/归因/趋势/通知/连接器/发布包/待办/置信度/成本）
src/lib/workflows/engine.ts     # V2 Workflow Contract + V4 韧性/幂等重试（勿破坏）
src/lib/ai/providers.ts         # chatResilient（超时/重试/Provider Fallback/成本估算）
drizzle/                        # 迁移 0000-0007（历史迁移禁止重写）
scripts/v3-e2e-cdp.mjs          # Browser E2E 回归（12 项）
scripts/v4-e2e-cdp.mjs          # Browser E2E V4（14 项）
scripts/backup-db.sh            # 备份（已实测）
scripts/restore-db.sh           # 恢复（验证库模式，已实测）
```

## QA 证据（V4，docs/23）

| 检查 | 结果 |
|---|---|
| `npx tsc --noEmit` | ✅ 零错误（每 Phase 验证） |
| `pnpm build` | ✅ 通过 |
| Route Smoke（29 路由 + 4 导出端点） | ✅ 33/33 |
| V4 Browser E2E（CDP 14 项：发布包/品牌资产/导入/匹配/readiness） | ✅ 14/14 |
| V3 回归 E2E（12 项） | ✅ 12/12 |
| 备份+恢复实测（backup → 验证库 restore → 行数校验） | ✅ PASS |
| Final Status | **PRODUCTION READY EXCEPT REAL-DATA ACCEPTANCE**（真实 CSV/LLM Key 到位即可升 READY，见 docs/23 §9） |

## 核心约定

- **Server Action 契约**：`<form action={fn.bind(null, arg)}>` 直连；fn 返回 `void`；**禁止内联 async 函数**（会 500）
- **Topic canonical route**：`/topics/{topic_id}`（业务 ID，如 `2026W36-001`），禁止混用 UUID；趋势详情 `trend_key`（兼容 UUID）
- **三道人工门禁**：选题确认 → 内容审核 → 发布确认；**AI 绝不自动发布**
- **发布包 QA 门禁**：fact/brand/content 三项全 passed 才能 ready；视觉资产 ≥2 才能进 QA；正式 Logo 锁定后禁止自动化替换
- **数据来源标记**：每条核心运营数据带 data_source（seed/manual/xiaodouya_import/…）；APP_MODE=live 时 Dashboard/Analytics/Weekly Planning 排除 seed
- **导入永不静默失败**：行级错误留痕 + 失败行重试/导出 + 重复文件跳过并通知
- **AI 永不静默失败**：超时/重试/Fallback 全留痕；全链失败 → needs_manual；质量 Gate 拦截（空文/违禁词/冒充已发布）→ needs_review
- **上一自然周严格周一~周日**，禁止滚动周；Orchestrator 周一生成 draft，人工确认后才生产
- **归因禁 LLM 猜测**：28 天基线 → Incremental → 概率分配 → evidence；数据不足 → insufficient_data（不是 failed）
- **禁止硬编码 mock**（仅 Seed 开发数据）；避免 Dashboard N+1（Promise.all 预取）

## 文档索引（docs/）

| 文档 | 内容 |
|---|---|
| 00-14 | V1 规格与基线（vision / PRD / IA / 数据模型 / 工作流 / AI / 状态机 / 设计系统 / API / 验收 / 路线图 / 数据集成 / Topic 表现） |
| 15 | 数据模型审计（58→61 表，含 V3/V4 增量审计） |
| 16-19 | V3 Production Workbench / Trend Radar + Attribution / Connector + Notifications / V3 QA 交付 |
| 20 | 数据库备份与恢复（策略 + 实测记录） |
| 21 | **真实运营指南（非开发向：每周怎么用图文工厂）** |
| 22 | V4 Production Readiness 实现说明（8 Phase 地图 / 配置 / 设计决策） |
| 23 | V4 QA 与交付报告（Final Status / E2E / 安全 QA / 已知限制） |
| implementation-progress.md | 实施进度（V1-V4 全记录） |
| _canonical-*.md | V1 基线文档 |

## 使用 /screen 获取小豆芽数据

日常真实数据回流的两层架构：**/screen Skill = 数据采集层，Content OS Import Pipeline = 数据处理层**。

```
小豆芽数据页 → /screen 抄数（截屏→读图→结构化）
    → data/metrics-import.csv
    → Content OS 导入（/data-import 按钮 或 pnpm data:import-screen）
    → 账号/作品匹配 → 幂等快照（snapshot_date → captured_at）→ 基线/表现重算 → 下轮选题反馈
```

- Skill 位置：`~/.claude/skills/screen/`（全局，任何项目可用）；触发：项目目录下执行 `/screen 抄数`
- 输出：`data/metrics-import.csv`（宽表，`record_type=account|post` 区分行类型；`snapshot_date`=数据所属日期，`captured_at`=采集时间；`source_image` 留截图证据；页面没有的字段留空，禁止填 0）
- 导入：Web `/data-import`「导入 /screen 抄数数据」（预览→确认）或 CLI `pnpm data:import-screen`
- 平台中文名（抖音/小红书/B站/视频号/公众号）导入侧自动归一为枚举；同日期重复导入自动更新，不产生重复快照
- Web 应用不调用 Skill、Skill 不调用 Web——两边只通过 CSV 文件解耦

## 运行约定

- 开发：`pnpm dev`（:3000，用户使用）；生产：`env PORT=3210 pnpm start`（日志 /tmp/contentos-server.log）
- DB 查询：`node --import tsx -e "import postgres from 'postgres'; ..."`
- Browser E2E：`node scripts/v4-e2e-cdp.mjs --base=http://localhost:3210`（前置：生产构建 + seed + Chrome CDP 9223）
- 周一 Scheduler：`POST /api/cron/scheduler`（外部 cron 触发；配置 CRON_SECRET 后强制校验；UI 诚实显示 Not Configured）
- 备份：`bash scripts/backup-db.sh`（每周至少一次；恢复验证 `bash scripts/restore-db.sh <file>`）
