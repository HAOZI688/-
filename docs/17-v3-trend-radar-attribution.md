# 17 V3 Trend Radar 与 Follower Attribution（趋势雷达与涨粉归因）

> **状态**：V3 已交付（2026-09-04）。文档系列第 17 份。
> 对应规格：V3 §10-§16（Trend Radar）、§17-§20（Follower Attribution）。
> 核心原则：**规则模型可解释，禁止 LLM 猜测**；所有评分/归因产出 evidence 文本 + config_version 可复盘。

---

## 1. Trend Radar（/trend-radar）

### 1.1 8 信号评分（trend_scoring_config 权重可配置）

| 信号 | 权重（默认） | 说明 |
|---|---|---|
| Recurrence | 15 | 事件频次：同一趋势在周期内出现次数 |
| Velocity | 15 | 速度：相比上一周期的增减斜率 |
| Source Diversity | 10 | 来源多样性：跨来源数（AI Weekly/GitHub/知识库/人工/内容表现/社交数据/用户提问） |
| Technical Significance | 15 | 技术显著性：tech_keywords 命中（agent/ai/llm/model/mcp/rpa/automation） |
| B2B Relevance | 15 | B2B 相关度 |
| Content Performance | 10 | 内容表现：覆盖内容的流量/互动 |
| Conversion | 10 | 转化：线索/演示请求 |
| Knowledge Gap | 10 | 知识缺口：无资产且无知识条目则加分 |

综合分 0-10：`currentScore = Σ(信号分 × 权重) / 100 × 10`，保留一位小数。

### 1.2 状态机（velocity_score 派生）

| 条件 | status |
|---|---|
| velocity > 3 | rising |
| velocity < -3 | declining |
| ≤ 1 事件 | emerging |
| 其余 | stable |

### 1.3 覆盖状态（trend_topics 计数）

uncovered（无覆盖 Topic）→ partial（部分）→ covered（已覆盖）→ saturated（内容饱和）。

### 1.4 Trend → Topic 的 Gate

趋势进入 Topic 必须走 **Topic Approval Gate**（/topics 或 /review 选题确认），**不能自动生产**。trend_topics.relation：source（来源）/ covered（已覆盖）/ suggested（建议生产）/ derived（衍生）。

### 1.5 时间线（trend_snapshots）

每次计算落一条快照（snapshot_date/current_score/velocity_score/source_count/covered_topic_count/signals），详情页时间线即来自该表——**禁止只存最终值**。

## 2. Follower Attribution（/analytics/attribution）

### 2.1 模型 v1（规则模型，可解释）

```
Expected = 28 天滚动日均增长（排除异常日）
Incremental = Observed − Expected
```

- **基线计算**（accountGrowthBaselines）：取过去 28 天账号日增长，排除异常日（`> 2σ` 或 `> 5 × median` 的天），样本 ≥ 26 天
- **周期**：上一自然周（周一 00:00 ~ 周日 23:59:59），**禁止滚动周**
- **幂等**：同账号同周期已有 run 则跳过（getRunByPeriod）

### 2.2 概率分配（attribution_results）

增量按作品信号概率分配：

| 权重 | 信号 | 计算 |
|---|---|---|
| 0.4 | viewPercentile | 作品播放分位（周期内） |
| 0.3 | engagementRate | 互动率 |
| 0.2 | profileVisits | 主页访问增量 |
| 0.1 | recency | 时间接近度 |

`score >= 0.6 → high_confidence`；`>= 0.35 → probable`；`< 0.35 → assisted`。
平台直接数据（如抖音官方面板直接给到作品归因粉丝数）→ `direct`。
无法分配的增量 → `unattributed`（run 级别记录）。

### 2.3 Evidence 文本

每个 result 必须带 evidence jsonb（viewPercentile/engagementRate/profileVisits/recencyPercentile/windowDays/concurrentPosts/note），页面直接渲染为证据列——**可解释是硬要求**。

### 2.4 未匹配外部作品兜底

external_post 无 publication 时仍可参与归因（external_post_id 维度），attribution_type 降级为 probable/assisted（无内容证据）。

## 3. 配置版本追踪（Config Version Trace）

| 计算 | 版本字段 |
|---|---|
| Trend 评分 | trends.config_version + trend_scoring_config.active |
| Attribution | attribution_runs.config_version（1.0）+ model_version（v1） |
| Topic Performance V2 | topic_performance_scores.config_version（v2.1） |

版本号只增不改，复盘时按版本取回当时的配置。

## 4. 页面数据流

- 列表页：账号 → baseline（getLatestBaseline）+ 最新快照；runs → results（按 run 预取，`<details>` 展开）
- 运行按钮：`runAttributionAction`（server action，返回 void，revalidate /analytics/attribution + /analytics + /dashboard）——**form action 契约，禁止内联 async 函数**
- 趋势页：列表（评分/速度/覆盖/来源类型/最后出现）→ 详情（评分明细 8 信号进度条 + 来源证据 + 覆盖 Topic + 快照时间线 + 重新评分）
