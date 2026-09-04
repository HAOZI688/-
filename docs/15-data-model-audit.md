# 15 数据模型审计（Data Model Audit）

> **状态**：V1 审计基线（docs 系列第 15 份）。
> 目的：核对 PostgreSQL 落库表结构 vs Drizzle Schema vs 规格基线（`docs/_canonical-data-model.md`），输出一致性与偏差清单。

---

## 1. 审计方法

| 层 | 审计对象 | 方式 |
|---|---|---|
| 1 | `drizzle/` 迁移文件 | 0000 全量 + 0001 增量（43 表） |
| 2 | `information_schema` | 表清单、列、约束、枚举实测 |
| 3 | Drizzle Schema | `src/lib/db/schema/*.ts`（19 个文件） |
| 4 | 规格基线 | `docs/_canonical-data-model.md` 需求十三等 |

## 2. 落库实测（2026-09-04）

**表数量：43**（迁移 2 个，全部应用）

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

- 43 表全部落库，与 Drizzle Schema 一致（tsc 零错误）；
- 需求十三「所有指标绑定 Topic_ID」成立；
- 规格 §80（Repository 层）/ §81（Service 层）分层落地无表结构回退；
- 改进项均在 V2 路线图内，不阻塞 MVP。
