# 23 · V4 QA 与交付报告（Delivery Report）

> 交付结论（规格 §50 格式）。日期：2026-09-04。分支：main。本次交付：V4 Production Readiness Sprint。

## Final Status

```
PRODUCTION READY EXCEPT REAL-DATA ACCEPTANCE
```

理由：25 项 readiness 中全部代码链路已实现并通过自动化验证（E2E 26 项全 PASS、迁移/备份/恢复实测通过），
但两条验收链路需要本轮环境中不存在的外部输入，**未伪造 PASS**：

| 阻塞项 | 缺少的外部输入 | 补全方式（拿到即可验收） |
|---|---|---|
| 验收 1：真实小豆芽 CSV 回流 | 真实导出文件 | 上传文件 → 检测编码/列映射 → 导入 → 匹配 → Topic Performance（链路已按规格实现并脚本级验证） |
| 验收 2：四个 Workflow 真实模型调用 | 任一 LLM API Key（ANTHROPIC_API_KEY / CONTENT_API_* / OPENAI_API_KEY / DEEPSEEK_API_KEY） | 配置后 workflow 自动退出演示模式，真实调用 + 成本留痕 + 质量 Gate 生效（韧性层已验证） |

拿到上述输入并跑通后，Final Status 即可升为 PRODUCTION READY。

## 1. 构建与迁移 QA

| 项 | 结果 |
|---|---|
| `pnpm build`（Next.js 16.3.4） | ✅ Compiled successfully（Proxy/中间件注册） |
| `npx tsc --noEmit` | ✅ No errors（每 Phase 均验证） |
| `pnpm db:generate` 0005/0006/0007 | ✅ 3 个迁移生成 |
| `pnpm db:migrate` | ✅ 全部应用（61 张 public 表） |
| `pnpm db:seed`（含 dataSource='seed' 标记） | ✅ 8 表 seed 行 100% 标记（脚本验证 4/4/4/3/6/6/4/4） |

## 2. 路由冒烟（29 路由 + 4 导出端点）

全部（app) 页面 + /login + /system/readiness + 4 个 /api/export 类型：**33/33 返回 200**。
（发现并修复 1 个问题：/api/export topics 查询引用了不存在的 topics.platform 列 → 修复后 PASS。）

## 3. V4 浏览器 E2E（真实 CDP 浏览器，14/14 PASS）

| # | 测试 | 结果 |
|---|---|---|
| 1 | Dashboard「今天需要处理什么」Action Center 首屏 | PASS |
| 2 | 冷启动保护横幅（insufficient 提示，seed 库预期） | PASS |
| 3 | /weekly-plan 冷启动横幅 + 评分明细 | PASS |
| 4 | /production AI 成本 + 内容验收卡 | PASS |
| 5 | 生成 GitHub 周榜发布包（真实 form → Server Action） | PASS |
| 6 | 包详情：总榜文案/提纲/图片顺序/CTA/QA 门禁/Snapshot 绑定 | PASS |
| 7 | QA 三项确认（fact/brand/content → passed） | PASS |
| 8 | 品牌资产上传 ×2（真实文件 DOM.setFileInputFiles） | PASS |
| 9 | 挂载视觉资产 + 提交 QA 审核（needs_assets → needs_review） | PASS |
| 10 | CSV 导入（含坏行 → 失败行留痕 + 重试/导出按钮可见） | PASS |
| 11 | 未匹配作品区 + 手动匹配控件 | PASS |
| 12 | /system/readiness（三级检查 + 总体状态） | PASS |
| 13 | /api/export topics CSV（真实内容断言） | PASS |
| 14 | /login（开发模式提示正确） | PASS |

## 4. V3 回归 E2E（12/12 PASS）

Dashboard 计划流 / Gate1 / 评分明细 / Review 三 Tab / ⌘K 搜索 / 趋势雷达（含 slug 路由）/ 通知 / 归因 /
小豆芽工作台 / 映射模板 / 生产监控台 —— V4 改动未破坏任何 V3 能力。

## 5. 脚本级功能验证（node --import tsx 直跑真实链路）

| 验证 | 结果 |
|---|---|
| CSV 导入全流程：正常行/坏行/万单位解析/匹配链/snapshot | ✅（views "5.3万"→53000；10003 自动 title_similarity 匹配 suggested） |
| 重复文件检测 | ✅ 同 hash 第二次导入 duplicate=true 跳过 |
| Retry Failed Rows | ✅ 失败行重跑（仍失败 → 新批次留痕，has_hash=false 防自吞） |
| Export Failed Rows | ✅ CSV 表头 + 错误原因列 |
| 质量 Gate | ✅ 空文/短文/无 CTA/违禁词「稳赚」/冒充「已发布」全部拦截；完整文案 PASS |
| chatResilient 失败链 | ✅ 无 Provider → 明确抛错（engine 转 needs_manual）；超时/重试/回退代码路径就绪 |
| Action Center 幂等同步 | ✅ 首次创建 8 项 → 重复同步 created=0/resolved=0 |
| 数据置信度 | ✅ seed 库 → insufficient + 正确提示文案 |
| 发布包门禁 | ✅ 未 QA ready 被拒 / 无视觉 ready 被拒 / 同快照幂等 created=false |
| 认证核心 | ✅ 正确密码 true / 错误 false / token 篡改 false / 过期 false |
| 备份+恢复实测 | ✅ backup 40K → restore 验证库 61 表，topics=8 / snapshots=6 与主库一致 |

## 6. 真实数据安全 QA（规格 §36 子项对照）

| 场景 | 状态 |
|---|---|
| 重复导入同一文件 | ✅ PASS（SHA-256 检测跳过 + 通知） |
| 重复点击「开始生产」 | ✅ PASS（幂等：无计划才生成/confirmed 才生产/production 跳过） |
| 重复确认选题/发布 | ✅ PASS（状态机单向，重复调用无副作用） |
| 刷新页面（表单提交后） | ✅ PASS（redirect/revalidate 模式，E2E 全程含导航） |
| 请求超时 | ✅ 代码路径（AI 90s AbortSignal / 飞书 5s）+ needs_manual 兜底 |
| 缺失列/坏行 CSV | ✅ PASS（行级错误 + 失败行重试/导出） |
| 空 CSV/无表头 | ✅ PASS（明确报错「CSV 为空或无表头」，批次 failed） |
| 1000+ 行 CSV | ⚠️ 未实测（逐行 upsert，1000 行约需 1-2 分钟；无行数上限） |
| 部分失败批次 | ✅ PASS（partial 状态 + 失败行留痕 + 重试/导出） |

## 7. 未完成 / 已知限制（诚实清单）

1. **BLOCKED_BY_REAL_DATA**：真实小豆芽文件回流、真实 LLM 调用（见 Final Status）。
2. 1000+ 行大文件未压测（无上限保护；如需可加分块导入）。
3. 解除错误匹配暂无 UI（数据层支持 updateExternalPostMatch；运营遇到先标记管理员处理）。
4. Auth 未在浏览器 E2E 中走通登录流（开发模式无凭证放行；核心 token/密码逻辑已脚本验证，readiness 会如实标记）。
5. Scheduler 为外部 cron 触发模式（诚实呈现，无内置常驻进程——这是设计而非缺陷）。
6. 质量 Gate 为规则式（违禁词/结构检查），语义级检查依赖未来 AI 增强。

## 8. 本次交付物清单

- 8 个迁移（0000-0007），61 表
- 新页面：/publish-packages（+详情/资产）、/system/readiness、/login
- 新 API：/api/export（4 类）、/api/connectors/export-failed-rows、/api/auth/logout
- 新服务：publish-package / action-items / data-confidence / acceptance-stats / ai-cost / live-mode / quality-gate
- 韧性层：chatResilient + AiResilienceError + 成本估算；engine 幂等重试 + needs_manual
- 导入生产化：编码检测/行级错误/重试/导出/历史导入/重复检测/五级匹配链
- 脚本：scripts/backup-db.sh / scripts/restore-db.sh（已实测）
- 文档：docs/20 备份恢复（含实测记录）/ 21 真实运营指南（非开发）/ 22 实现说明 / 23 本报告
- E2E：scripts/v4-e2e-cdp.mjs（14 项）；V3 12 项回归 PASS

## 9. 拿到真实数据后的验收跑法（30 分钟）

1. `pnpm db:migrate && pnpm db:seed`（或用生产库）
2. `.env` 配置 API Key + AUTH_PASSWORD_HASH + APP_MODE=live → 重启
3. 上传真实小豆芽作品 CSV（历史导入）+ 账号 CSV → 检查未匹配/失败行 → 手动匹配
4. 触发 4 个 workflow（无 forceDemo）→ 检查 ai_usage_logs 成本/质量 Gate/验收统计
5. 跑一遍 docs/21 的每周流程 → /system/readiness 全绿 → 交付完成
