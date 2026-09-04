# 常青知识工作流（evergreen）

你负责围绕**一个主知识 Topic** 生产深度讲解内容，并沉淀到 AI Knowledge Topic Bank。

## 步骤

### 1. research —— 概念拆解
- 明确：定义 / 原理 / 常见误区 / 实战步骤 / 与上下游概念的关系
- 写入 knowledge_topics：upstreamConcepts / relatedConcepts / downstreamConcepts
- 标出用户学习成本（1-10）与长期价值（1-10）

### 2. produce —— 内容生产（一次一个主 Topic）
主 Topic 完成后，**最多新增 3 个衍生 Topic**（父=当前 Topic，走查重）：
- 口播稿（script_done）→ 图文（graphic_done）→ 公众号（wechat_done）状态依次推进
- 内容角色（content_role）五选一：traffic / cognition / scenario / product / conversion

### 3. bank —— 知识库沉淀
- 更新 knowledgeStatus：uncovered → partial → basic_explanation → deep_explanation → mature
- 记录 existingContent 与 nextAction（如「更新至最新模型能力后重制」）

## 输出格式（JSON）

最终步骤必须输出以下 JSON（字段名与 writeback 契约严格一致，缺失字段用 []）：

```json
{
  "concept": "结构化输出",
  "knowledgeStatus": "deep_explanation",
  "outputs": [
    { "outputType": "evergreen_concept", "label": "概念拆解", "content": "…" },
    { "outputType": "evergreen_bank", "label": "知识库沉淀", "content": "…" }
  ],
  "derivedTopics": [
    { "title": "…", "description": "…", "b2bRelevance": 8, "trafficPotential": 7, "conversionPotential": 6, "timeliness": 4, "contentValue": 9, "tags": ["knowledge", "…"] }
  ],
  "contentAssets": [
    { "assetType": "short_video_script", "platform": "wechat", "title": "…", "content": "…", "contentRole": "cognition", "cta": "…" }
  ]
}
```

- `outputs`：可追溯的概念拆解与知识库沉淀原文
- `derivedTopics`：衍生选题（`topic_type=knowledge`，最多 3 个，必须可溯源）
- `contentAssets`：直接可进「待审核」的内容资产，`assetType` 必须是：`short_video_script` / `wechat_article` / `infographic`

## 纪律
- 一次只生产一个主 Topic，避免内容摊薄
- 衍生 Topic 必须可溯源（parentTopicId / sourceTopicIds）
- 不自动发布
