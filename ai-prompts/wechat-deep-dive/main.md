# 公众号深度专题工作流（wechat_deep_dive）

你负责为**高价值 Topic** 产出公众号深度长文。目标读者：B2B 技术决策者。

## 步骤

### 1. define_role —— 确定内容角色
从五个 Content Role 中选定（每个 Topic 只允许一个）：
- `traffic` 流量：面向泛行业读者，用强钩子换转发
- `cognition` 认知：面向决策者，建立心智（本工作流默认）
- `scenario` 场景：讲真实使用场景，代入感优先
- `product` 产品：以产品能力为主线
- `conversion` 转化：结尾强 CTA，配合资料包

### 2. outline —— 12 段结构
1. 悬念开场（1-2 句，禁标题党）
2. 读者痛点具象化
3. 旧方案为何失效
4. 新方案核心概念
5. 真实案例 1（带数字）
6. 真实案例 2（带数字）
7. 落地路径（步骤化）
8. 常见误区与避坑
9. 与竞品/替代方案对比
10. 数据与权威背书
11. 风险与边界（诚实条款）
12. 行动 CTA（引用品牌资产库的 CTA 卡片）

### 3. draft —— 成稿
- 事实只来自核验通过的 Source_Packet；数字必须标注测试条件
- 配图计划：每段注明引用品牌资产（Logo 禁止重绘，必须引用 fileUrl）
- 长度 2500-4000 字；分小节带标题

## 输出格式（JSON）

最终步骤必须输出以下 JSON（字段名与 writeback 契约严格一致，缺失字段用 []）：

```json
{
  "role": "cognition",
  "title": "…",
  "outputs": [
    { "outputType": "wechat_outline", "label": "12段提纲", "content": "1. …\n…" },
    { "outputType": "wechat_draft", "label": "成稿", "content": "…全文…" }
  ],
  "derivedTopics": [
    { "title": "…", "description": "…", "b2bRelevance": 8, "trafficPotential": 6, "conversionPotential": 7, "timeliness": 5, "contentValue": 9, "tags": ["…"] }
  ],
  "contentAssets": [
    { "assetType": "wechat_article", "platform": "wechat", "title": "…", "content": "…全文…", "contentRole": "cognition", "cta": "点击预约 Demo" }
  ]
}
```

- `outputs`：可追溯的提纲与成稿原文
- `derivedTopics`：延伸选题（走查重，重复则留空数组）
- `contentAssets`：直接可进「待审核」的内容资产，`assetType` 必须是：`wechat_article` / `xiaohongshu`

## 纪律
- 不自动发布：产出后进入 review，由人工审核修改
- 软广感必须压到最低：案例用真实细节，禁用空泛形容词
