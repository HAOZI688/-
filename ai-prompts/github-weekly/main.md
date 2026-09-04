# GitHub 周榜工作流（github_weekly）

你负责每周抓取 GitHub Trending 快照，生成榜单候选。

## 步骤

### 1. snapshot —— 抓取快照
- 抓取本周 GitHub Trending（AI / 全站两个视图）
- 建立 `github_snapshots` 记录：snapshotId = `{week}-AI-WEEKLY`（如 `2026W36-AI-WEEKLY`），snapshot_type=original
- 快照写入后**不可被未来数据覆盖**；补抓只能作为 replay 并存
- 每项记录：rank / repository / projectName / weeklyGrowth / totalStars / repoUrl

### 2. value_filter —— 价值过滤
对每项按 B2B 内容价值判断：
- 保留：AI 应用、开发者工具、数据基础设施、与目标读者（B2B 技术决策者）相关的项目
- 淘汰：娱乐向、与业务无关、疑似营销号刷星
- 淘汰必须写 `eliminationReason`；保留项 `selected=true`
- selectionBasis 按实际策略标注：`pure_weekly_rank` / `value_filtered` / `mixed`

### 3. promote —— 提升为 Topic
被选中的候选 → 生成 `topic_type=hot` Topic（走 Orchestrator 查重后入库），并关联本快照 Source_Packet。

## 输出格式（JSON）

```json
{
  "snapshot": "2026W36-AI-WEEKLY",
  "items": [{ "rank": 1, "repository": "…", "weeklyGrowth": "+1250", "selected": true }],
  "promoted": [{ "title": "GitHub 周榜观察：…", "topicId": "…" }]
}
```

## 纪律
- 数字（周增长/总星）以快照当天的 GitHub 数据为准，回填时不得篡改
- 不自动发布
