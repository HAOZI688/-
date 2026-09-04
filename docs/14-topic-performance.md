# 14 Topic 表现分析与反馈闭环（Topic Performance）

> **状态**：V1 已实现（docs 系列第 14 份）。
> 本文档记录「数据回流 → Topic 表现评分 → 推荐动作 → 下一轮选题反馈」闭环（规格 §45、§74）。

---

## 1. 闭环位置

```
小豆芽数据回流（docs/13）→ 指标标准化 → Topic 表现聚合（本模块）
  → 评分 + 推荐动作 → 下一轮 Orchestrator 选题反馈 → 新 Topic / 调整策略
```

## 2. 实现

| 组件 | 位置 | 职责 |
|---|---|---|
| `topicPerformanceService` | `src/lib/services/topic-performance.ts` | 周期聚合、评分、推荐、反馈 |
| `metricNormalizationService` | `src/lib/services/metric-normalization.ts` | 小豆芽中文列→标准 key 映射、标准指标定义 |
| `topicPerformances` 表 | `src/lib/db/schema/metrics.ts` | 周期表现行：四维分数 + 总分 + 推荐动作 |
| 页面 | `/analytics/topics` | 本期评分表 + 上期高分延伸/低分调整卡片 |

### 2.1 评分模型（规格 §45）

| 维度 | 数据来源 | 计算 |
|---|---|---|
| 流量分 traffic | contentMetrics(views/impressions) | 归一化 0-10 |
| 互动分 engagement | comment+share+save（engagementUnits） | 归一化 0-10 |
| 线索分 lead | leads 计数 + consultations | 归一化 0-10 |
| 转化分 conversion | conversionEvents + demoRequests + materialDownloads | 归一化 0-10 |

**总分** = 四维加权（当前等权聚合）；**推荐动作**按总分阈值：

| 总分 | 推荐 | 下一轮动作 |
|---|---|---|
| ≥7 | 加大投入 | 扩展子选题、增加平台覆盖 |
| ≥5 | 继续 | 维持节奏，补充内容资产 |
| ≥3 | 调整角度 | 换角度/换平台再试 |
| <3 | 暂缓 | 从选题池降级 |

### 2.2 反馈闭环（feedbackForNextRound）

- 按**上一周期**（如 2026W35）取 top 3 / bottom 3 表现 Topic；
- `/analytics/topics` 以「高分延伸建议」「低分调整建议」卡片呈现；
- 人工决策后进入下一轮 Orchestrator 选题（反馈不自动改选，保留人工门禁）。

## 3. 周期约定

- 周期格式：ISO 周 `2026W36`（`currentPeriod()` 生成）；
- 快照与表现行都带 `period`，跨周期分析直接按字段过滤；
- 所有指标行必须绑定 `topic_id`（需求十三：指标必须能追到 Topic）。

## 4. 验收要点

| 编号 | GWT | 状态 |
|---|---|---|
| 14-1 | Given 2026W35 有表现行；When 打开 `/analytics/topics`；Then 本期评分表 + 反馈卡渲染 | ✅（seed 2026W35/36 行） |
| 14-2 | Given 无该周期数据；When 打开页面；Then EmptyState 而非空白 | ✅ |
| 14-3 | Given 表现行缺 recommendation；When 渲染；Then 走默认 tone 不崩 | ✅ |
| 14-4 | Given 下轮 Orchestrator 运行；When 读取反馈；Then 基于上期 top/bottom 输出建议 | ✅ service 接口 |

## 5. 已知限制

- V1 四维分数为简化归一化（min-max 到 0-10），阈值权重后续可进 `topic_scoring_config` 类配置化（见 docs/15 改进项）；
- 账号级涨粉对内容的归因（「某天发什么→涨粉」）V1 只存快照，归因模型 V2。
