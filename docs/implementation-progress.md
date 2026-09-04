# Implementation Progress（实施进度）

> **状态**：V1 核心闭环已实现（tag v1.0.0，43 表冻结）；V2 自动运行能力已实现（47 表，P0 全部完成）。
> 覆盖：模块清单 / 目录结构 / 迁移状态 / 页面清单 / AI 工作流 / 数据集成 / 已知问题 / 未完成项 / 下一阶段建议。

---

## 1. 总体进度

| 里程碑 | 状态 | 说明 |
|---|---|---|
| M0 数据模型（43 表） | ✅ | 迁移 0000+0001 全部应用，`docs/15` 审计通过 |
| M1 Topic 系统 + 来源核验 | ✅ | 5 维评分（可配置权重）、血缘链、Source Packet 双时间戳 |
| M2 AI 工作流引擎 | ✅ | 5 模板 / 5 状态机 / 版本化 Prompt / 用量日志 |
| M3 内容资产 + 发布管理 | ✅ | Content Studio（版本历史）、Brand/Visual 模板、发布计划 |
| M4 数据回流（小豆芽） | ✅ | File Import 模式，CSV 全链路 + 快照 + 匹配 + 批次留痕 |
| M5 Topic 表现闭环 | ✅ | 评分 → 推荐 → 下一轮反馈（`docs/14`） |
| 验收 | ⏳ | build + 路由 + CSV 演练（见 §6） |

## 2. 目录结构（src/）

```
src/
├─ app/(app)/                    # 22 个页面路由
│  ├─ dashboard/ topics/([id]|runs)/ sources/ knowledge/ github-weekly/
│  ├─ content/[id]/ publications/ workflows/ calendar/ topic-graph/
│  ├─ accounts/ connectors/xiaodouya/ data-import/ analytics/topics/
│  ├─ settings/ meta/
├─ app/actions/import.ts         # server action：小豆芽 CSV 导入
├─ components/{layout,shared,ui}/
├─ lib/
│  ├─ db/{index,seed.ts,schema/19 文件}   # drizzle 43 表
│  ├─ repositories/ 12 个 + index.ts      # 规格 §80
│  ├─ repo.ts                            # 兼容层（旧页面 API 转发）
│  ├─ services/{topic-score,weekly-planning,metric-normalization,topic-performance}.ts
│  ├─ connectors/{csv,xiaodouya}.ts      # 自有 RFC 4180 解析器
│  └─ ai/{providers,prompt-registry}.ts + workflows/engine.ts
ai-prompts/{orchestrator,ai-weekly,github-weekly,evergreen,wechat-deep-dive}/
drizzle/0000_*_*.sql + 0001_*_*.sql      # 已应用
```

## 3. 迁移与 Seed 状态

| 项 | 状态 |
|---|---|
| 迁移文件 | 0000（全量）+ 0001（增量 25 表 + 枚举调整）✅ 已应用 |
| Seed | `pnpm db:seed`：8 Topics / 10 血缘 / 6 来源项 / 8 仓库快照 / 5+5 runs / 6 assets / 4 publications / 6+6 快照 / 3 leads / 16+ audit 等全表覆盖 |
| 数据库 | docker postgres（content-os），43 表实测见 `docs/15` |

## 4. 页面清单（22 路由）

| 路由 | 模块 | 状态 |
|---|---|---|
| /dashboard | 工作台（状态/优先级/发布/运行统计） | ✅ |
| /topics | Topic 列表（评分/优先级/状态） | ✅ |
| /topics/[id] | Topic 详情（血缘/来源包/评分） | ✅ |
| /topics/[id]/runs | Topic 关联工作流运行 | ✅ |
| /sources | 来源包列表（一致性状态） | ✅ |
| /knowledge | 知识图谱（概念/内容状态） | ✅ |
| /github-weekly | GitHub 周榜快照 | ✅ |
| /content/[id] | Content Studio（资产/版本历史/同 Topic 导航） | ✅ 增强 |
| /publications | 发布管理 | ✅ |
| /workflows | 工作流运行列表 | ✅ |
| /calendar | 14 天发布日历 | ✅ 新增 |
| /topic-graph | Topic 血缘图（父/来源/衍生/相关） | ✅ 新增 |
| /accounts | 社交账号管理 | ✅ 新增 |
| /connectors/xiaodouya | 小豆芽连接器（作品匹配/批次） | ✅ 新增 |
| /data-import | CSV 导入工作台 | ✅ 新增 |
| /analytics/topics | Topic 表现 + 反馈闭环 | ✅ 新增 |
| /settings /meta | 配置 | ✅ |

## 5. 关键约束落地核验

| 约束 | 实现 | 验证点 |
|---|---|---|
| AI 绝不自动发布 | 三个人工门禁（Topic Approval / Content Review / Publish Confirmation） | publications 状态机 + 无自动发布代码路径 |
| GitHub 原始快照不可覆盖 | snapshot_type=original + capture_time 不可变 | 快照只读语义 |
| 权重不写死 | topic_scoring_config（默认 25/20/20/15/20） | `topicScoreService.scoreTopic` 读配置 |
| 指标必绑 Topic | content_metrics.topic_id NOT NULL | 审计 §2.2-10 |
| 所有工作流运行留痕 | workflow_runs + tasks + outputs + audit | seed 5 状态覆盖 |

## 6. 验收状态（2026-09-04）

| 验收项 | 状态 |
|---|---|
| `tsc` 全项目零错误 | ✅ |
| 迁移幂等（0000+0001+0002 重放） | ✅ |
| `pnpm db:seed` | ✅ 全表覆盖 + 幂等重跑验证 |
| `pnpm build` | ✅ 22 路由全部编译 |
| 16 个 URL 可访问 | ✅ 16/16 冒烟 200（含动态路由 `/topics/[id]` 业务ID/UUID 双格式、`/topics/[id]/runs`、`/content/[id]`、`/workflows/runs`） |
| CSV 导入演练（/data-import） | ✅ 真实 `importPostsCsv`：4 行 / upsert 幂等 / 匹配 2 / 快照 4（演练数据已清理，seed 基线 6 快照） |
| 与 `_canonical-*` 基线对拍 | ✅ 43 表一致性见 docs/15 |

### 6.1 Seed 期间发现并修复的缺陷

| # | 缺陷 | 修复 |
|---|---|---|
| 1 | `topics.topic_score` 类型 integer 无法存加权小数（8.4） | 改 numeric(4,1)，迁移 0002；repository/service 类型适配（`string` 往返） |
| 2 | seed 中 `returning()` 未解构导致外键全空 | 批量修复 13 处解构 |
| 3 | weekly-planning 对 numeric 列做算术比较（TS2362） | Number() 转换后再比较 |

## 6.2 V2 里程碑（自动运行能力，2026-09-04）

> V1 冻结后增量开发（43 表只增不改）：新增 4 表（workflow_dependencies / workflow_inputs / weekly_plans / weekly_plan_items），共 47 表。V1 已 tag v1.0.0 并推送。

| 里程碑 | 状态 | 说明 |
|---|---|---|
| P0 Content Orchestrator | ✅ | 扫描候选（ready_for_production + GitHub selected）→ 五维评分（topic_scoring_config 权重）→ 历史表现加成（Topic Feedback）→ 路由 + 配额 → weekly_plans draft |
| P0 四个真实 AI Workflow | ✅ | ai_weekly / github_weekly / evergreen / wechat_deep_dive，结构化输出 schema 与 writeback 对齐 |
| P0 Workflow Dependency（DAG） | ✅ | workflow_dependencies 表：周报 → 常青 → 公众号；engine 完成自动 advanceDependenciesOf（动态 import 避免循环） |
| P0 Human Gate 三道门禁 | ✅ | /review：选题确认 / 内容审核 / 发布确认；全部落 audit_logs，绝不自动发布 |
| P1 Scheduler | ✅ | `/api/cron/scheduler`（POST/GET）：周一自动生成**上一自然周**计划 draft（等人工确认）；crontab 示例见路由注释 |
| P1 Topic Feedback | ✅ | previousWeekOf 取上周表现，评分加成落库 |
| 新页面 | ✅ | /planning（周计划 + DAG 视图）、/review（三道门禁待审核聚合）；dashboard 增加周一视图 |

### 6.3 V2 表单契约与 Server Action 发现（Next.js 16.3.4）

| # | 发现 | 结论 |
|---|---|---|
| 1 | server action 返回数据会触发 TS2322 表单契约错误 | 全部 action 改为 `Promise<void>`，数据读库渲染 |
| 2 | `actionOf` wrapper 包装 bound action → render 阶段执行 revalidatePath → 全部 V2 页面 500 | 移除 wrapper，表单直接 `<form action={action.bind(null, arg)}>` |
| 3 | fetch-action 手造 multipart body 返回 500 "Connection closed"（曾误判为生产环境 bug） | 根因：手造 body 与浏览器格式不符。真实浏览器（CDP 实测）：简单 bound 参数用 **text/plain flight 编码**（`encodeReply([arg])`），非 multipart；点击 → 200 + DAG 跑通 |
| 4 | MPA 渐进增强路径 | 普通 form POST（无 Next-Action header）同样完整可用，跑通 DAG 全链路 |
| 5 | 绑定参数的 form 编码 | `$ACTION_REF_0`（空）+ `$ACTION_0:1`（bound JSON）+ `$ACTION_0:0`（ref JSON），REF→args→ref 顺序 |
| 6 | 可选尾参 + bind 破坏签名 | rejectAssetAction 拆为 approve/revision 两个 1 参 action |
| 7 | 服务器运行方式 | dev :3000（用户）/ prod :3210（`next start`，日志 /tmp/contentos-server.log）；DB 查询 `node --import tsx -e "import postgres from 'postgres'; ..."`

## 7. 已知问题（与基线偏差）

| # | 问题 | 影响 | 处理 |
|---|---|---|---|
| 1 | drizzle-kit/tsx 运行时偶发 "does not provide an export" | 仅运行时告警 | 已规避（seed 直接 import 路径） |
| 2 | 迁移中有 Postgres 标识符截断 NOTICE | 无害 | 忽略 |
| 3 | topic_score integer 丢小数 | 精度 | V2 numeric 迁移（docs/15） |
| 4 | 小豆芽 CSV 依赖人工导出 | 操作成本 | V2 API Mode |
| 5 | xlsx 依赖被安全分类器阻断 | 已绕行 | 自研 CSV 解析器（覆盖需求） |

## 8. 未完成项（V1 收尾 / V2）

- [x] build 全绿 + 22 路由冒烟 ✅（V1 封版 v1.0.0；V2 后 8 端点复测 200）
- [x] CSV 导入端到端演练并回填验收记录 ✅
- [x] 定时调度（weekly 自动触发）✅（V2 P1：/api/cron/scheduler，周一自动生成上一自然周 draft，人工确认后才生产）
- [ ] 认证接入（users.role 启用）→ V2 之后（用户明确暂不做认证/RBAC）
- [ ] trend_radar_items 页面 → V2 之后
- [ ] 账号涨粉归因模型 → V2 之后
- [ ] 发布平台 OpenAPI 接入 → V2 之后（当前人工发布回填链接）
- [ ] 小豆芽 API Mode → V2 之后

## 9. 下一阶段建议（V2 优先级）

1. **定时 Orchestrator**：weekly scheduling（周一 09:00 自动触发，仍保留人工门禁）；
2. **API Mode 连接器**：按 docs/13 §8 替换导入实现；
3. **多工作区**：workspaces/users 已建表，接入认证即用；
4. **指标阈值配置化**：topic_performance 四维权重进配置表。
