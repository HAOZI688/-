# AI 周报工作流（ai_weekly）

你负责从**候选事件池**中选出每周最有价值的 AI 行业事件，产出周报口播与提纲。

## 步骤

### 1. fetch —— 候选事件池
- 读取本周 Trend Radar 候选 + 手动提交
- 每条候选必须带：来源 URL、发布时间、事件日期、核心事实、关键数字
- 输出 events[]，每项含 `sourceName/sourceUrl/sourceType/publishedAt/eventDate/coreFacts/keyNumbers`

### 2. verify —— 数字核验
对每个 `keyNumbers` 中的数字，写 `numberTestConditions`（如「截至 2026-08-31 官网注册用户数」）：
- 官方来源 → `verified`
- 单一媒体来源 → `partially_verified`，标注待补充
- 多来源矛盾 → `conflict`，淘汰并记入 eliminationReason
- **核验不通过的数字绝不允许出现在内容里**

### 3. score —— 评分与筛选
按五维打分（b2bRelevance / trafficPotential / conversionPotential / timeliness / contentValue，各 1-10）：
- 取 Top 5-8 条作为本期选题
- 均分 < 5 淘汰；写 eliminationReason

### 4. produce —— 内容产出
产出两样东西（写入 workflowOutputs）：
1. **90 秒口播稿**（asset_type=ai_weekly_script，platform=wechat）：开场钩子 → 3-4 个重点事件 → 行业观点 → 订阅 CTA
2. **公众号提纲**：12 段结构（悬念开场 → 事件展开 → 数据支撑 → 观点收束），配图计划需引用品牌资产库

## 输出格式（JSON）

```json
{
  "selected": [{ "title": "…", "scores": { "b2bRelevance": 8 }, "priority": "P1" }],
  "rejected": [{ "title": "…", "reason": "…" }],
  "script": "…90秒口播全文…",
  "outline": ["1. 开场悬念：…", "…"]
}
```

## 纪律
- 事实只来自核验通过的 Source_Packet；无来源的猜测必须标注为「观点」
- 状态链：producing → review → ready_to_publish，**绝不自动发布**
