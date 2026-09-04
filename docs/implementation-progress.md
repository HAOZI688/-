# Implementation Progress（实施进度）

> **状态**：V1 核心闭环已实现（tag v1.0.0，43 表冻结）；V2 自动运行能力已实现（47 表，P0 全部完成）；V3 Production Workbench 已交付（58 表，QA 全绿）；**V4 Production Readiness 已交付（61 表，E2E 26/26，Final Status: PRODUCTION READY EXCEPT REAL-DATA ACCEPTANCE，见 docs/23）**。
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
│  ├─ db/{index,seed.ts,schema/24 文件}   # drizzle 58 表（V3 新增 15 表）
│  ├─ repositories/ 16 个 + index.ts      # 规格 §80（+trend/attribution/notification）
│  ├─ repo.ts                            # 兼容层（旧页面 API 转发）
│  ├─ services/（+trend-radar/trend-scoring/attribution/account-growth-baseline/connector-sync/notification/topic-performance-v2）
│  ├─ connectors/{csv,xiaodouya}.ts      # 自有 RFC 4180 解析器
│  └─ ai/{providers,prompt-registry}.ts + workflows/engine.ts
ai-prompts/{orchestrator,ai-weekly,github-weekly,evergreen,wechat-deep-dive}/
drizzle/0000_*_*.sql + 0001 + 0002 + 0003 + 0004_v3_workbench.sql   # 已应用（0004 只增不改）
```

## 3. 迁移与 Seed 状态

| 项 | 状态 |
|---|---|
| 迁移文件 | 0000（全量）+ 0001（增量 25 表 + 枚举调整）+ 0005/0006/0007（V4：publish_packages/action_items/data_source/match 列/file_hash/failed_row_data/auth 枚举）✅ 全部应用，61 张表 |
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

## 6.4 V3 Production Workbench（2026-09-04 交付）

> V3 全部为增量：迁移 0004（新增 15 表 → 58 表，V1/V2 表零改动）；新 Repository/Services 按实体分层；
> **禁止 V3 页面硬编码 mock**（仅 Seed 开发数据）；Server Action 一律 `返回 void` + 真实浏览器表单（docs 06 §6.3）。

| 能力 | 实现 | 验证 |
|---|---|---|
| Production Workbench（10 页面） | /dashboard 升级 + /weekly-plan + /production + /review Tabs + /trend-radar(+[id]) + /analytics/attribution + /notifications + /connectors/xiaodouya(+mappings) + /api/search | 22 路由冒烟 22/22 |
| Dashboard Action Center | 状态机：无计划→生成本周计划 / draft→确认本周选题 / confirmed→确认并开始生产 / production→链接 | E2E #2-3（真实 Flight POST 两条） |
| Weekly Planning V2 | 每项记录 base/trend/perf/conversion/gap 全部 adjustment + final_score + reason_codes；公式说明卡 | E2E #4 |
| Orchestrator V3 数学 | trendAdjustment=(trendScore-5)×0.3；perf×0.2；conv×0.15；gap 无资产且无知识+0.5；clamp(0,10)；priority ≥8.5 P0 / ≥7 P1 | seed 计划项可见 |
| Trend Radar | 8 信号评分（trend_scoring_config 权重）+ 状态机（rising/declining/emerging/stable）+ 覆盖状态 + Trend→Topic Approval Gate + 快照时间线；详情路由业务 ID trend_key（兼容 UUID） | E2E #7；/trend-radar/agent-skills 200 |
| Follower Attribution v1 | 28 天基线（排除 >2σ / >5×median 异常日）→ Incremental → 概率分配（0.4/0.3/0.2/0.1）→ high_confidence ≥0.6 / probable ≥0.35 / assisted；evidence jsonb 禁 LLM 猜测；幂等 getRunByPeriod | E2E #9 |
| 小豆芽 Production Mode | Adapter 契约（api/file_import）；API Mode 未配置不伪造 endpoint；CSV detectMapping→模板命中→幂等导入；未匹配手动匹配；Freshness <48h fresh / 48h-168h aging / >168h stale | E2E #10-11 |
| Notification Center | 9 类型（weekly_plan_ready/workflow_failed/content_needs_review/publication_needs_confirmation/data_sync_failed/unmatched_external_post/metrics_stale/trend_p0_detected/attribution_completed），severity + read 流 | E2E #8 |
| Topic Performance V2 | topic_performance_scores（6 维 + recommendation + reason_codes + config_version v2.1）+ 兼容回写 V1 performanceScore | seed 6 行 |
| Config Version Trace | trends.config_version / attribution_runs.config_version / topic_performance_scores.config_version / trend_scoring_config.active | 复盘可查 |
| 全局搜索 | ⌘K → POST /api/search（topics/trends/assets/publications ILIKE 聚合，href 用业务 ID） | E2E #6 |

**QA 结果（docs/19）**：tsc 零错误 ✅；pnpm build ✅；Route Smoke 22/22 ✅（/templates N/A）；Browser E2E 12/12 ✅（CDP 真实浏览器，2 条 Flight POST 网络确认）；Data Model Audit docs/15 更新 PASS ✅。

**交付期修复的真实缺陷**：`/trend-radar/{非UUID}` 曾 500（PG 22P02）→ getTrend 先正则判定 UUID；子查询走 trend.id；列表/搜索 href 改 trend_key。修复后 200/200/404 三态验证 + E2E 重跑 12/12。

## 6.6 V4 Production Readiness（2026-09-04 交付）

详细实现地图见 docs/22，QA 证据见 docs/23。

| 能力 | 状态 |
|---|---|
| 发布包（GitHub 周榜包：总榜+5项目文案+提纲+标题+标签+图片顺序+Snapshot 绑定；QA 三项门禁；视觉挂载；状态机） | ✅（E2E 5-9 PASS） |
| 品牌资产中心（上传/预览/启用停用/锁定/引用；正式 Logo 禁 AI 替换） | ✅（E2E 8 PASS） |
| CSV 导入生产化（UTF-8/GB18030 编码检测、行级错误留痕、失败行重试/导出、历史导入模式、SHA-256 重复检测、万/亿/Excel 序列号解析、五级匹配链 external_post_id→URL→平台+时间→标题→人工） | ✅（脚本级 + E2E 10 PASS；真实文件 BLOCKED_BY_REAL_DATA） |
| AI Provider Resilience（90s 超时/指数退避×2/Provider Fallback/成本估算留痕；全链失败 needs_manual） | ✅（代码路径验证；真实 Key BLOCKED_BY_REAL_DATA） |
| 工作流质量 Gate（空文/短文/无标题/CTA 数量/来源引用/违禁词/冒充已发布 → needs_review） | ✅（7 项脚本验证） |
| 幂等重试（复用原 run，writeback 防重复）+ 内容验收统计（直接通过/修改后通过/打回/通过率/平均修订）+ AI 成本展示 | ✅ |
| Live Operation Mode（APP_MODE=live 排除 seed；数据来源标记 8 表；冷启动 data_confidence 四档 + 提示文案；归因 insufficient_data） | ✅ |
| Action Center（7 来源统一待办 + 自动 resolve + dismiss；Dashboard「今天需要处理什么」首屏） | ✅（E2E 1 PASS，同步幂等验证） |
| 最小登录认证（AUTH_PASSWORD_HASH/HMAC 会话/Proxy 路由保护/登出） | ✅（核心逻辑验证；E2E 14 PASS 开发模式提示） |
| /system/readiness（Critical/Required/Optional 三级，Critical FAIL → NOT READY） | ✅（E2E 12 PASS） |
| Scheduler 诚实状态（Endpoint Ready / External Cron Not Configured；CRON_SECRET 保护）+ 飞书出站通知（可选） | ✅ |
| 备份恢复（scripts/backup-db.sh + restore-db.sh 验证库模式；实测 backup 40K → restore 61 表行数一致） | ✅ PASS |
| 数据导出（/api/export：topics/publications/topic_performance/social_metrics CSV） | ✅（E2E 13 PASS） |
| 文档（20 备份/21 非开发运营指南/22 实现说明/23 QA 交付报告） | ✅ |

## 7. 已知问题（与基线偏差）

| # | 问题 | 影响 | 处理 |
|---|---|---|---|
| 1 | drizzle-kit/tsx 运行时偶发 "does not provide an export" | 仅运行时告警 | 已规避（seed 直接 import 路径） |
| 2 | 迁移中有 Postgres 标识符截断 NOTICE | 无害 | 忽略 |
| 3 | topic_score integer 丢小数 | 精度 | V2 numeric 迁移（docs/15） |
| 4 | 小豆芽 CSV 依赖人工导出 | 操作成本 | V2 API Mode |
| 5 | xlsx 依赖被安全分类器阻断 | 已绕行 | 自研 CSV 解析器（覆盖需求） |
| 6 | 真实小豆芽文件 / LLM Key 未在本轮环境提供 | 验收 1/2 无法闭环 | 标记 BLOCKED_BY_REAL_DATA（docs/23 §9 给出 30 分钟补全跑法），未伪造 PASS |

## 8. 未完成项（V1 收尾 / V2）

- [x] build 全绿 + 22 路由冒烟 ✅（V1 封版 v1.0.0；V2 后 8 端点复测 200）
- [x] CSV 导入端到端演练并回填验收记录 ✅
- [x] 定时调度（weekly 自动触发）✅（V2 P1：/api/cron/scheduler，周一自动生成上一自然周 draft，人工确认后才生产）
- [x] Trend Radar 页面 + Trend→Topic Gate ✅（V3）
- [x] 账号涨粉归因模型 ✅（V3 attribution v1，含 28 天基线 + 概率分配）
- [x] 小豆芽 Connector Production Mode（File Import 一等能力 + 未匹配手动匹配 + 映射模板）✅（V3）
- [x] Notification Center（9 类型）✅（V3）
- [x] Topic Performance V2 + Weekly Planning V2（adjustment 明细）✅（V3）
- [x] 生产化认证（单用户密码登录 + 路由保护 + readiness 检查）✅（V4；复杂 RBAC 仍按规格不做）
- [x] 备份/恢复 + 数据导出 + 系统就绪检查 ✅（V4）
- [ ] 真实小豆芽 CSV 回流验收 → 等真实导出文件（链路已就绪，docs/23 §9）
- [ ] 四个 Workflow 真实 LLM 调用验收 → 等 API Key 配置（韧性层已就绪）
- [ ] 发布平台 OpenAPI 接入 → 当前人工发布回填链接
- [ ] 小豆芽 API Mode → 需官方 API Contract 确认后接入（Adapter 契约已预留，未配置不伪造 endpoint）
- [ ] 发布平台 OpenAPI 接入 → 当前人工发布回填链接
- [ ] 小豆芽 API Mode → 需官方 API Contract 确认后接入（V3 已预留 Adapter 契约，未配置不伪造 endpoint）

## 9. 下一阶段建议（V3 之后）

1. **小豆芽 API Mode**：拿到官方 API Contract 后按 Adapter 契约实现（docs/18 §1，testConnection 已预留）；当前 File Import 为默认且可用；
2. **认证接入**：workspaces/users 已建表，接入认证即用；
3. **归因模型 v2**：接入小豆芽 API 作品级播放/主页数据后提升 direct 占比（当前概率分配 v1 已可解释）；
4. **指标阈值配置化**：topic_performance 权重与 freshness 阈值（48h/168h）进配置表；
5. **趋势信号扩展**：trend_scoring_config 权重已可配置，可加更多信号源（如全网舆情平台，属规格外扩展需另行确认）。
