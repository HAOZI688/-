# 24 · 真实 AI 运营（Real AI Operation）

> B-3：把四个 AI Workflow 切到真实模型生产。本文是配置与操作手册；**本文档不含任何真实 Secret**。

## 1. 环境配置（全部只放服务端 .env / .env.local，禁止提交 Git）

```bash
# 运行模式（live = 真实运营：排除 seed、禁止演示假产出、manual/screen 数据参与评分）
APP_MODE=live

# Primary / Fallback（值：anthropic | openai | deepseek | content_api）
AI_PRIMARY_PROVIDER=anthropic
AI_PRIMARY_MODEL=claude-sonnet-5
AI_FALLBACK_PROVIDER=deepseek
AI_FALLBACK_MODEL=deepseek-chat

# 对应 Provider 的 Key（配置哪个 Provider 就填哪组；FALLBACK 的 Key 也必须真实可用）
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=
# 或 OpenAI 兼容中转（唯元智创 CONTENT_API）
CONTENT_API_BASE_URL=
CONTENT_API_KEY=
CONTENT_MODEL=

# 韧性与成本
AI_TIMEOUT_MS=90000        # 单次请求超时
AI_MAX_RETRY=2             # 单 Provider 重试次数
AI_RETRY_DELAY_MS=2000     # 指数退避基数
AI_MAX_COST_PER_RUN=0.50   # 单 run 成本上限（USD 估算；超限中止转 needs_manual。0=不限）
AI_PRICES=                 # 可选：模型价格表覆盖（每 1M tokens：输入/输出）
```

安全规则：
- Key 只存在于服务端环境变量；禁止提交 Git、写入数据库明文、进 client bundle、用 NEXT_PUBLIC_、打印到日志
- readiness 页与生产监控台只显示 **configured/missing、可达性、模型名、成本**，永不显示 Key

## 2. 健康检查（readiness 页）

`/system/readiness` 的 AI 项是**真实请求验证**（发一条最小 completion），不是"环境变量存在"：

- `AI Primary Provider`：PASS = 实际请求成功（显示 Provider/Model/延迟）；FAIL = 未配置（Live）或请求失败（显示错误类型 TIMEOUT/AUTH/RATE_LIMIT）
- `AI Fallback Provider`：同上；未配置显示 optional WARN（单 Provider 也可运行）
- 检查结果有 5 分钟缓存

## 3. Provider 未配置 / 全失败时的行为（不伪造产出）

| 场景 | Run 结果 |
|---|---|
| Live Mode + 未配置任何 Key | 立即 `failed + needs_manual`，error=AI_PROVIDER_NOT_CONFIGURED，**不产生任何演示正文** |
| Primary 超时/错误（重试后） | 自动切 Fallback Provider → 成功则 `completed`（ai_usage_logs.fallback_used=true） |
| 全部 Provider 失败 | `failed + needs_manual`，error 保留最后一个 Provider 的错误 |
| 单 run 成本超 AI_MAX_COST_PER_RUN | 中止后续步骤 → `failed + needs_manual`，error=AI_COST_LIMIT_EXCEEDED |

修复配置后在「生产监控台」点**重试**（幂等：复用原 run，不重复创建 Topic/Asset）。

## 4. 第一次真实 Production 步骤

1. 确认 `/system/readiness`：AI Primary = PASS、Real Metrics 有数据、APP_MODE=live
2. Dashboard → 生成本周内容计划 → 确认选题 → 开始生产（DAG 触发四工作流）
3. `/production` 监控：每条 run 的状态、重试率、成本；失败/needs_manual 的 run 修复后重试
4. 产出内容 → `/review` 审核（直接通过/修改后通过/打回——计入验收统计）
5. GitHub 周榜 → 发布包 → QA 三项 → 视觉资产 → ready → **人工发布**
6. `/production` 底部查看本周 AI 成本与内容验收率

## 5. AI 用量与成本

- 每步真实调用写 `ai_usage_logs`：provider / model / prompt_version / input_tokens / output_tokens / total_tokens / cost / latency / retry_count / fallback_used / estimated
- cost 是**估算值**（AI_PRICES 价格表 × token），`estimated=true` 标记；Provider 未返回 usage 时 token 记 0 + estimated=true，禁止伪造精确值
- `/production` 按工作流展示：调用数 / Tokens / 成本 / 平均延迟 / 重试率 + 本周总成本 + 单篇已发布成本

## 6. needs_manual 处理流程

1. 生产监控台 → 找到 needs_manual / 失败 run → 看 error
2. 常见错误：AI_PROVIDER_NOT_CONFIGURED（配 Key）· TIMEOUT（网络/超时，重试）· AUTH（Key 失效）· AI_COST_LIMIT_EXCEEDED（调高上限或接受部分产出）
3. 修复后点「重试」→ run 复用原 ID 重新执行（retry_count+1，writeback 幂等）
4. Dashboard 待办「AI 调用失败需人工介入」在 run 成功后自动消失

## 7. Prompt Version

- 四工作流的正式版本在 `prompt_templates` 登记（ai_weekly / github_weekly / evergreen / wechat_deep_dive → current_version），文件在 `ai-prompts/<type>/main.md`
- Run 启动时自动记录所用 version 到 ai_usage_logs.prompt_version——不从代码里拼新 Prompt 绕开版本系统
