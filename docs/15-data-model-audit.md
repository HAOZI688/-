# 15 数据模型审计（Data Model Audit）

> **状态**：V1 审计基线 + V3 增量审计（docs 系列第 15 份，2026-09-04 更新）。
> 目的：核对 PostgreSQL 落库表结构 vs Drizzle Schema vs 规格基线（`docs/_canonical-data-model.md`），输出一致性与偏差清单。

---

## 1. 审计方法

| 层 | 审计对象 | 方式 |
|---|---|---|
| 1 | `drizzle/` 迁移文件 | 0000 全量 + 0001/0002/0003 增量 + 0004 V3（共 58 表） |
| 2 | `information_schema` | 表清单、列、约束、枚举实测（58 表） |
| 3 | Drizzle Schema | `src/lib/db/schema/*.ts`（24 个文件） |
| 4 | 规格基线 | `docs/_canonical-data-model.md` 需求十三等 |

## 2. 落库实测（2026-09-04）

**表数量：58**（迁移 5 个：0000/0001/0002/0003/0004，全部应用）

### 2.1 表清单与归属集群

| 集群 | 表 |
|---|---|
| Topic | topics, topic_relations, tags, topic_tags, topic_scoring_config, topic_performances, trend_radar_items |
| Source | sources, source_packets, source_packet_items |
| Knowledge | knowledge_topics, knowledge_relations |
| GitHub | github_snapshots, github_snapshot_items |
| AI | workflow_templates, workflow_runs, workflow_tasks, workflow_outputs, prompt_templates, prompt_versions, ai_models, ai_usage_logs |
| Content | content_assets, content_versions, brand_assets, visual_templates, content_metrics |
| Distribution | publications, social_accounts, data_connectors, connector_accounts, external_posts, data_import_batches, data_sync_jobs |
| Data | metric_definitions, metric_mappings, post_metric_snapshots, account_metric_snapshots, leads, conversion_events |
| System | workspaces, users, audit_logs |

### 2.2 关键一致性断言（P0）

| # | 断言 | 结果 |
|---|---|---|
| 1 | topics.topic_id 唯一、业务编号格式 `2026W36-001` | ✅ |
| 2 | topic_score 落库类型 integer（加权分 0-10 取一位小数） | ✅ 见改进项 1 |
| 3 | topic_relations 支持 parent/source/derived/related 多血缘 | ✅ |
| 4 | sources 双时间戳 event_date / disclosure_date | ✅ |
| 5 | source_packet_items 含 comparison_object / applicable_scope（数字事实测试条件） | ✅ |
| 6 | content_versions 与 content_assets 1:N（版本不可覆盖） | ✅ |
| 7 | publications.social_account_id → social_accounts（可空、删置 null） | ✅ |
| 8 | external_posts.match_status 四级（unmatched/suggested/confirmed/conflict） | ✅ |
| 9 | post_metric_snapshots 按 captured_at 快照（T+1/3/7/30） | ✅ |
| 10 | 所有指标绑定 topic_id（content_metrics / post_metric_snapshots→publications→topics / leads / conversion_events） | ✅ |
| 11 | github_snapshots.snapshot_type original（原始快照不可被未来数据覆盖） | ✅ |
| 12 | audit_logs 全实体留痕（before/after jsonb） | ✅ |
| 13 | prompt_templates / prompt_versions 版本化 | ✅ |
| 14 | ai_usage_logs 记录 token/成本/延迟 | ✅ |
| 15 | topic_scoring_config 权重可配置（不写死） | ✅ |

### 2.3 枚举实测

| 枚举 | 取值 | 迁移 |
|---|---|---|
| topic_type | hot/evergreen/technical_project/scenario/product/conversion/trend/knowledge | 0000 |
| topic_status | draft/researching/ready_for_production/producing/review/needs_revision/ready_to_publish/published/archived | 0000+0001 |
| platform | wechat/douyin/xiaohongshu/bilibili/wechat_video/kuaishou/other | 0001 增 kuaishou/other |
| publication_status | planned/ready/scheduled/published/failed | 0001 增 published/scheduled |
| source_consistency | unverified/partially_verified/verified/conflict/needs_update | 0001 重建 |
| brand_asset_type | logo/product_screenshot/template/background/icon/visual_reference/cta_asset | 0001 重建 |
| workflow_run_status | queued/running/completed/failed/needs_review | 0000 |
| match_status | unmatched/suggested/confirmed/conflict | 0000 |
| mapping_status | unmapped/mapped/conflict | 0000 |
| connector_type | xiaodouya/csv_import/manual/future_api | 0000 |
| lead_type / lead_status / conversion_event_type | 见 schema/enums.ts（33 枚举） | 0000 |

## 3. 偏差与改进项

| # | 项目 | 状态 | 说明 |
|---|---|---|---|
| 1 | topic_score 类型 integer 丢小数 | 接受 | 规格五维评分最终总分 0-10；整数满足 UI 展示，如需精度改 numeric 需新迁移 |
| 2 | data_import_batches / data_sync_jobs 行数字段为 text | 接受 | 兼容小豆芽 CSV 原始字符串（含说明文字），聚合时 Number() 转换 |
| 3 | workflow_runs.output jsonb 与 workflow_outputs 并存 | 接受 | runs.output 为执行摘要，workflow_outputs 为资产产出 |
| 4 | social_accounts.metadata text | 接受 | V2 如需结构化账号元数据改 jsonb |
| 5 | trend_radar_items 表已建、V1 无页面 | 接受 | 数据源阶段输入，页面排期 V2 |
| 6 | users.role 无枚举约束 | 接受 | 单工作区 V1，认证接入时补 |

## 4. Seed 数据覆盖（对应 §5-§83 场景）

| 场景 | 行数 | 说明 |
|---|---|---|
| topics | 8 | 含 Agent Governance 血缘链（AI事件→治理→企业落地→KPI；GitHub→Skills→MCP→Workflow） |
| topic_relations | 10 | derived/source/related 三类型 |
| sources / source_packet_items | 5 / 6 | 双时间戳、comparison_object、applicable_scope |
| knowledge_topics / relations | 3 / 3 | 概念上下游 |
| github_snapshots / items | 1 / 8 | 5 选中，原始快照 |
| workflow_templates / runs / tasks / outputs | 5 / 5 / 9 / 2 | 五种 run 状态全覆盖 |
| content_assets / versions | 6 / 2 | v2 版本历史 |
| publications | 4 | 绑定账号 |
| social_accounts / connector_accounts | 4 / 2 | 抖音/小红书/公众号/视频号 |
| external_posts | 4 | confirmed/suggested/unmatched |
| post_metric_snapshots | 6 | T+1/3/7 |
| account_metric_snapshots | 6 | 双账号三时间点 |
| leads / conversion_events | 3 / 4 | 转化链 |
| audit_logs | 16+ | 全动作留痕 |
| topic_performances | 3 | 2026W35 反馈 |
| prompt_templates / versions / ai_models / ai_usage_logs | 5 / 5 / 3 / 2 | 版本化 + 用量 |
| metric_definitions / mappings | 13 / 5 | 中文列→标准 key |

## 5. 结论

- 58 表全部落库，与 Drizzle Schema 一致（tsc 零错误）；
- 需求十三「所有指标绑定 Topic_ID」成立；
- 规格 §80（Repository 层）/ §81（Service 层）分层落地无表结构回退；
- V1 43 表只增不改；V3 全部新实体走 0004 增量迁移 + 新表，无历史迁移重写；
- 改进项均在路线图内，不阻塞 MVP。

---

## 6. V3 增量审计（Production Workbench，2026-09-04）

> 迁移：`drizzle/0004_v3_workbench.sql`（12.7K，V1/V2 表零改动，只增不改）。
> V3 新增 15 表（43 → 58）：trends / trend_sources / trend_topics / trend_snapshots / trend_scoring_config / attribution_runs / attribution_results / account_growth_baselines / notifications / import_mapping_templates / topic_performance_scores + weekly_plans / weekly_plan_items / workflow_dependencies / workflow_inputs（后 4 张为 0003 V2 已有，0004 增列）。

### 6.1 新增实体与规格映射

| 规格 V3 章节 | 实体 | 表 | 关键约束 / 设计点 | 状态 |
|---|---|---|---|---|
| §10-§16 Trend Radar | Trend | trends | trend_key 唯一；status 枚举（emerging/rising/stable/declining/archived）；coverage_status（uncovered/partial/covered/saturated）；score_breakdown jsonb 信号明细 | ✅ |
| §10-§16 | TrendEvidence | trend_sources | source_type（ai_weekly/github_weekly/knowledge/manual/content_performance/social_data/user_question）+ weight + evidence 文本 | ✅ |
| §10-§16 | TrendScoreConfig | trend_scoring_config | 8 信号权重（15/15/10/15/15/10/10/10）可配置，tech_keywords JSON，active 开关 | ✅ |
| §10-§16 | TrendSnapshot | trend_snapshots | 每次计算落一条（时间线支撑 velocity / 走势图），signals jsonb | ✅ |
| §17-§20 Attribution | AttributionRun | attribution_runs | (social_account_id, period_start, period_end)；observed - expected = incremental；model_version + config_version 可复盘；completed_at | ✅ |
| §17-§20 | AttributionResult | attribution_results | run_id 级联；publication_id / external_post_id / topic_id 三向可空；attribution_score numeric(4,3)；attribution_type 枚举（direct/high_confidence/probable/assisted/unattributed）；evidence jsonb 证据文本 | ✅ |
| §17-§20 | AccountGrowthBaseline | account_growth_baselines | unique(social_account_id, period_start, period_end)；avg/median/std_dev/anomaly_days/sample_days（28 天基线，排除异常日） | ✅ |
| §7 Import Mapping | ImportMappingTemplate | import_mapping_templates | connector_type 默认 xiaodouya；data_type（account/post/account_metrics/post_metrics）；column_mapping jsonb；required_columns JSON 数组；active | ✅ |
| §26 Metric Freshness | MetricFreshness（派生） | account_metric_snapshots + connector 配置 | freshness(ageHours, config)：<48h fresh / 48h-168h aging / >168h stale（FRESHNESS_DEFAULTS） | ✅ |
| §27 Notification Center | Notification | notifications | type 9 种（weekly_plan_ready/workflow_failed/content_needs_review/publication_needs_confirmation/data_sync_failed/unmatched_external_post/metrics_stale/trend_p0_detected/attribution_completed）；severity；read/read_at；link | ✅ |
| §22 Topic Performance V2 | TopicPerformanceScore | topic_performance_scores | 6 维评分（traffic/engagement/follower/lead/conversion/trend）+ performance_score + recommendation + reason_codes text[]；period 按周 | ✅ |
| §22 | WeeklyPlanScoreBreakdown（派生） | weekly_plan_items 新列 | base_score/trend_adjustment/performance_adjustment/conversion_adjustment/knowledge_gap_adjustment/final_score/reason_codes/sort_order/run_id（0004 增列） | ✅ |
| §23 Config Version | ConfigVersionTrace（派生） | trends.config_version / attribution_runs.config_version / topic_performance_scores.config_version / trend_scoring_config.active | 每类计算落版本号，可复盘 | ✅ |
| §37 人工兜底 | Manual Match | external_posts.match_status + manualMatch 服务 | unmatched → confirmed（人工选择 publication_id） | ✅ |

### 6.2 V3 关键一致性断言

| # | 断言 | 结果 |
|---|---|---|
| 1 | V1 43 表结构零改动（0004 只新增表 + weekly_plan_items 增列） | ✅ 0004 无 ALTER 历史表 |
| 2 | attribution_results 至少一个归因载体（publication/external_post 可空但 topic 兜底） | ✅ |
| 3 | attribution_runs 幂等：同账号同周期重复计算先查再插 | ✅ getRunByPeriod |
| 4 | account_growth_baselines 唯一约束（账号×周期） | ✅ uniqueIndex |
| 5 | trends.trend_key 唯一（归一化趋势名） | ✅ unique |
| 6 | trend_sources 可挂 workflow_run_id（来源可追溯执行记录） | ✅ |
| 7 | notifications 9 种 type 全 enum 化（varchar + 校验） | ✅ |
| 8 | topic_performance_scores.period 格式与 weekly 周 key 一致（2026W35） | ✅ |
| 9 | weekly_plan_items 调整字段 numeric(4,1) 非空默认 "0"（每项必须记录全部 adjustment 明细） | ✅ 0004 |
| 10 | import_mapping_templates.required_columns 参与自动检测（命中比例） | ✅ |

### 6.3 V3 Seed 数据覆盖（`src/lib/db/seed.ts` V3 段）

| 场景 | 行数 | 说明 |
|---|---|---|
| trends | 3 | Rising（Agent Skills 8.7/+4.2）/ Stable（MCP 6.4/+0.3）/ Declining（低代码 4.2/-2.1） |
| trend_sources | 9 | ai_weekly/github_weekly/knowledge/manual 证据链 |
| trend_snapshots | 9 | 每趋势 3 时间点（时间线） |
| trend_topics | 4 | covered/suggested/derived 三关系 |
| trend_scoring_config | 1 | 8 权重 15/15/10/15/15/10/10/10 |
| attribution_runs | 2 | 抖音高增量（470/180/+290）+ 小红书自然增长（90/88/+2） |
| attribution_results | 4 | high_confidence 0.82 / probable 0.45（未匹配 ep4）/ probable 0.35 / assisted 0.2 |
| account_growth_baselines | 2 | 28 天基线（抖音 25.6±8.2 anomaly 2 / 小红书 8.4±1.2 anomaly 0） |
| notifications | 5 | content_needs_review / metrics_stale / unmatched_external_post / trend_p0_detected / attribution_completed |
| import_mapping_templates | 2 | 作品导出 v2.1 / 账号导出 v1.0 |
| topic_performance_scores | 6 | 2026W35 六维度（HIGH_CONVERSION/RISING_TREND/HIGH_TRAFFIC_LOW_CONVERSION/HIGH_FOLLOWER_IMPACT+KNOWLEDGE_GAP/CONTENT_SATURATION/LOW_PERFORMANCE）+ 回写 V1 |
| account_metric_snapshots（stale） | +1 | 公众号 12 天前快照 → metrics_stale |
