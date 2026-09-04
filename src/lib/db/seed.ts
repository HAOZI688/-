/**
 * Seed 数据：V1 演示完整业务样例（规格 §5-§83 覆盖）。
 *
 * 覆盖：
 * - 8 个指定 Topics（含 Agent Governance 血缘链：AI事件→Agent Governance→企业Agent→Agent KPI；
 *   GitHub→Agent Skills→Plugins→MCP/Workflow），topic_relations 多来源血缘 + tags
 * - Sources 主档（双时间：event_date / disclosure_date）+ Source Packets（comparison_object / applicable_scope）
 * - Knowledge Topics + 概念血缘（upstream/related/downstream）
 * - GitHub 快照（8 仓库，5 选中，不可覆盖）
 * - Workflow：5 模板 + 5 runs（2 completed / 1 needs_review / 1 running / 1 failed）+ tasks + outputs
 * - Prompt Templates/Versions + AI Models + AI Usage Logs
 * - Content Assets（含版本）+ Brand Assets + Visual Templates
 * - Publications（绑定 Social Accounts）
 * - Social Accounts（抖音/小红书/公众号/视频号）+ Connectors（小豆芽）
 * - External Posts + Post Metric Snapshots（T+1/3/7）+ Account Metric Snapshots
 * - Topic Performances（2026W36 评分+推荐）
 * - Leads + Conversion Events
 * - Audit Logs
 * - Workspace / User
 *
 * 运行：pnpm db:seed
 */
import { db } from "./index";
import { sql } from "drizzle-orm";
import { topicScoreService } from "../services/topic-score";
import { auditRepository } from "../repositories";

const W = "2026W36";

/* ============================================================
 * 0. 清空（TRUNCATE CASCADE 全表，保证幂等）
 * ============================================================ */
async function reset() {
  await db.execute(sql`
    TRUNCATE TABLE
      audit_logs, ai_usage_logs, prompt_versions, prompt_templates, ai_models,
      workflow_outputs, workflow_tasks, workflow_runs, workflow_templates,
      github_snapshot_items, github_snapshots,
      knowledge_relations, knowledge_topics,
      topic_relations, topic_tags, tags,
      topic_performances, leads, conversion_events,
      post_metric_snapshots, account_metric_snapshots, metric_mappings, metric_definitions,
      external_posts, connector_accounts, data_sync_jobs, data_import_batches, data_connectors,
      content_versions, content_assets, content_metrics, brand_assets, visual_templates,
      publications, social_accounts,
      source_packet_items, source_packets, sources,
      topics, topic_scoring_config, trend_radar_items,
      workspaces, users
    CASCADE
  `);
}

export async function seed() {
  console.log("🌱 清空旧数据…");
  await reset();

  console.log("🏢 Workspace / User…");
  const [ws] = await db.insert(schema.workspaces).values({
    name: "AI 工场内容运营部",
    slug: "ai-factory-content",
  }).returning();
  await db.insert(schema.users).values({
    workspaceId: ws.id,
    email: "operator@aifactory.example.com",
    name: "内容运营主理人",
    role: "owner",
  });

  console.log("🏷️ Tags…");
  const tagNames = ["AI Agent", "Agent治理", "企业级落地", "KPI设计", "开源", "GitHub", "MCP", "Plugins", "Skills", "Workflow", "数据回流", "B2B", "转化"];
  const tags = new Map<string, { id: string; slug: string; name: string }>();
  for (const name of tagNames) {
    const [t] = await db.insert(schema.tags).values({
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
    }).returning();
    tags.set(name, t);
  }

  console.log("📌 Topics（8 个，含血缘链）…");
  const [t1] = await db.insert(schema.topics).values({
    topicId: "2026W36-001",
    title: "AI Agent 治理全景观察：从行业事件到企业落地",
    topicType: "hot",
    description: "本周 AI Agent 领域关键事件梳理（Anthropic Skills 发布、MCP 生态扩张、企业治理实践），作为 Agent 治理选题的来源主线。",
    primaryCta: "阅读治理专题",
    businessRelevance: "面向企业 AI 负责人与架构团队，输出可执行的治理清单",
    b2bRelevance: 9, trafficPotential: 8, conversionPotential: 7, timeliness: 10, contentValue: 8,
    status: "ready_to_publish",
    trendTags: ["AI Agent", "行业事件", "治理"],
    historyDedupeStatus: "confirmed_new",
  }).returning();

  const [t2] = await db.insert(schema.topics).values({
    topicId: "2026W36-002",
    title: "Agent Governance：企业级 AI Agent 治理体系",
    topicType: "knowledge",
    description: "企业部署多个 AI Agent 后的治理框架：权限、审计、可追溯、合规、人机协作边界。",
    primaryCta: "获取治理清单",
    businessRelevance: "企业 Agent 规模化前的必经之路",
    b2bRelevance: 10, trafficPotential: 7, conversionPotential: 8, timeliness: 9, contentValue: 9,
    status: "review",
    trendTags: ["Agent治理", "合规"],
    historyDedupeStatus: "confirmed_new",
  }).returning();

  const [t3] = await db.insert(schema.topics).values({
    topicId: "2026W36-003",
    title: "企业级 Agent 落地：从试点到 KPI 闭环",
    topicType: "scenario",
    description: "销售/客服/运营三个场景的 Agent 试点路径：指标设定、成本核算、人机分工。",
    primaryCta: "预约一对一咨询",
    businessRelevance: "直接关联产品 Demo 与转化",
    b2bRelevance: 10, trafficPotential: 7, conversionPotential: 10, timeliness: 8, contentValue: 8,
    status: "producing",
    trendTags: ["企业级落地", "场景"],
    historyDedupeStatus: "confirmed_new",
  }).returning();

  const [t4] = await db.insert(schema.topics).values({
    topicId: "2026W36-004",
    title: "Agent KPI 设计：衡量 AI Agent 的真实业务价值",
    topicType: "conversion",
    description: "Agent 不该只看 token 消耗：任务完成率、人工接管率、单客成本、营收影响。",
    primaryCta: "下载 KPI 框架",
    businessRelevance: "客户采购决策的核心评估维度",
    b2bRelevance: 9, trafficPotential: 6, conversionPotential: 9, timeliness: 8, contentValue: 7,
    status: "ready_for_production",
    trendTags: ["KPI设计", "转化"],
    historyDedupeStatus: "confirmed_new",
  }).returning();

  const [t5] = await db.insert(schema.topics).values({
    topicId: "2026W36-005",
    title: "GitHub 周榜观察 2026W36：本周值得关注的开源 AI 项目",
    topicType: "hot",
    description: "基于 GitHub Trending 快照，本周 star 增长最快的 AI 项目盘点（8 个候选，5 个入选）。",
    primaryCta: "查看项目详情",
    businessRelevance: "洞察开源生态，反哺产品与内容选题",
    b2bRelevance: 7, trafficPotential: 8, conversionPotential: 5, timeliness: 9, contentValue: 7,
    status: "producing",
    trendTags: ["GitHub", "开源"],
    historyDedupeStatus: "confirmed_new",
  }).returning();

  const [t6] = await db.insert(schema.topics).values({
    topicId: "2026W36-006",
    title: "Agent Skills：让 AI Agent 掌握领域技能",
    topicType: "knowledge",
    description: "Anthropic 引入 Agent Skills 后，Agent 从「会聊天」到「会干活」：技能封装、版本管理、权限边界。",
    primaryCta: "了解 Skills 机制",
    businessRelevance: "技能即资产：企业沉淀可复用的 Agent 能力",
    b2bRelevance: 8, trafficPotential: 8, conversionPotential: 6, timeliness: 9, contentValue: 8,
    status: "review",
    trendTags: ["Skills", "AI Agent"],
    historyDedupeStatus: "related",
  }).returning();

  const [t7] = await db.insert(schema.topics).values({
    topicId: "2026W36-007",
    title: "Plugins 与 MCP：Agent 的工具生态协议",
    topicType: "evergreen",
    description: "从 Plugin 到 MCP（Model Context Protocol）：工具标准化、生态位竞争与企业的选择策略。",
    primaryCta: "获取协议对比表",
    businessRelevance: "MCP 已事实成为 Agent 工具层标准，影响集成成本",
    b2bRelevance: 8, trafficPotential: 7, conversionPotential: 7, timeliness: 8, contentValue: 8,
    status: "ready_for_production",
    trendTags: ["MCP", "Plugins"],
    historyDedupeStatus: "related",
  }).returning();

  const [t8] = await db.insert(schema.topics).values({
    topicId: "2026W36-008",
    title: "Workflow 编排：从 MCP 工具到生产级流水线",
    topicType: "technical_project",
    description: "用一个真实案例串起：MCP 工具 → 任务编排 → 人工审核 → 发布 → 数据回流，完整内容生产流水线。",
    primaryCta: "预约产品演示",
    businessRelevance: "产品核心卖点：内容生产全链路自动化",
    b2bRelevance: 8, trafficPotential: 6, conversionPotential: 9, timeliness: 7, contentValue: 8,
    status: "ready_for_production",
    trendTags: ["Workflow", "MCP"],
    historyDedupeStatus: "confirmed_new",
  }).returning();

  // 血缘链（规格 §7，topic_relations 多来源）
  // AI事件(t1) → 治理(t2)；治理(t2) → 企业落地(t3) → KPI(t4)
  // GitHub(t5) → Skills(t6)；Skills(t6) → Plugins/MCP(t7) → Workflow(t8)
  await db.insert(schema.topicRelations).values([
    { sourceTopicId: t1.id, targetTopicId: t2.id, relationType: "derived" },
    { sourceTopicId: t1.id, targetTopicId: t2.id, relationType: "source" },
    { sourceTopicId: t2.id, targetTopicId: t3.id, relationType: "derived" },
    { sourceTopicId: t1.id, targetTopicId: t3.id, relationType: "source" },
    { sourceTopicId: t3.id, targetTopicId: t4.id, relationType: "derived" },
    { sourceTopicId: t5.id, targetTopicId: t6.id, relationType: "source" },
    { sourceTopicId: t6.id, targetTopicId: t7.id, relationType: "derived" },
    { sourceTopicId: t6.id, targetTopicId: t7.id, relationType: "related" },
    { sourceTopicId: t7.id, targetTopicId: t8.id, relationType: "derived" },
    { sourceTopicId: t5.id, targetTopicId: t8.id, relationType: "related" },
  ]);
  // 兼容旧字段
  await db.update(schema.topics).set({ parentTopicId: t1.id }).where(sql`${schema.topics.id} = ${t2.id}`);
  await db.update(schema.topics).set({ parentTopicId: t2.id, sourceTopicIds: [t1.id] }).where(sql`${schema.topics.id} = ${t3.id}`);
  await db.update(schema.topics).set({ parentTopicId: t3.id }).where(sql`${schema.topics.id} = ${t4.id}`);
  await db.update(schema.topics).set({ parentTopicId: t6.id }).where(sql`${schema.topics.id} = ${t7.id}`);
  await db.update(schema.topics).set({ parentTopicId: t7.id }).where(sql`${schema.topics.id} = ${t8.id}`);

  // Topic × Tag
  await db.insert(schema.topicTags).values([
    { topicId: t1.id, tagId: tags.get("AI Agent")!.id },
    { topicId: t1.id, tagId: tags.get("Agent治理")!.id },
    { topicId: t2.id, tagId: tags.get("Agent治理")!.id },
    { topicId: t2.id, tagId: tags.get("B2B")!.id },
    { topicId: t3.id, tagId: tags.get("企业级落地")!.id },
    { topicId: t3.id, tagId: tags.get("B2B")!.id },
    { topicId: t4.id, tagId: tags.get("KPI设计")!.id },
    { topicId: t4.id, tagId: tags.get("转化")!.id },
    { topicId: t5.id, tagId: tags.get("GitHub")!.id },
    { topicId: t5.id, tagId: tags.get("开源")!.id },
    { topicId: t6.id, tagId: tags.get("Skills")!.id },
    { topicId: t6.id, tagId: tags.get("AI Agent")!.id },
    { topicId: t7.id, tagId: tags.get("MCP")!.id },
    { topicId: t7.id, tagId: tags.get("Plugins")!.id },
    { topicId: t8.id, tagId: tags.get("Workflow")!.id },
    { topicId: t8.id, tagId: tags.get("MCP")!.id },
    { topicId: t8.id, tagId: tags.get("数据回流")!.id },
  ]);

  // 评分（规格 §12）：调用真实服务，权重来自 topic_scoring_config（seed 末尾写入配置）
  console.log("🧮 Topic 五维评分（topicScoreService）…");
  const topicInputs = [
    [t1, { b2bRelevance: 9, trafficPotential: 8, conversionPotential: 7, timeliness: 10, contentValue: 8 }],
    [t2, { b2bRelevance: 10, trafficPotential: 7, conversionPotential: 8, timeliness: 9, contentValue: 9 }],
    [t3, { b2bRelevance: 10, trafficPotential: 7, conversionPotential: 10, timeliness: 8, contentValue: 8 }],
    [t4, { b2bRelevance: 9, trafficPotential: 6, conversionPotential: 9, timeliness: 8, contentValue: 7 }],
    [t5, { b2bRelevance: 7, trafficPotential: 8, conversionPotential: 5, timeliness: 9, contentValue: 7 }],
    [t6, { b2bRelevance: 8, trafficPotential: 8, conversionPotential: 6, timeliness: 9, contentValue: 8 }],
    [t7, { b2bRelevance: 8, trafficPotential: 7, conversionPotential: 7, timeliness: 8, contentValue: 8 }],
    [t8, { b2bRelevance: 8, trafficPotential: 6, conversionPotential: 9, timeliness: 7, contentValue: 8 }],
  ] as const;
  for (const [t, input] of topicInputs) {
    const scored = await topicScoreService.scoreTopic(t.id, input, { actor: "seed", source: "orchestrator" });
    await auditRepository.log({
      action: "topic_update", entityType: "topics", entityId: t.id,
      actor: "seed:scoreTopic", before: null, after: { topicScore: scored.topicScore, priority: scored.priority },
      notes: `五维评分 → 加权 ${scored.topicScore} → ${scored.priority}（config=${scored.config}）`,
    });
  }

  console.log("📰 Sources 主档（双时间戳）…");
  const [srcAnthropic] = await db.insert(schema.sources).values({
    name: "Anthropic 官方公告：Introducing Agent Skills",
    url: "https://www.anthropic.com/news/agent-skills",
    sourceType: "official",
    publisher: "Anthropic",
    publishedAt: new Date("2026-08-27T15:00:00Z"),
    eventDate: new Date("2026-08-27T15:00:00Z"),
    disclosureDate: new Date("2026-08-27T15:00:00Z"),
    metadata: { kind: "release_announcement" },
  }).returning();
  const [srcGithub] = await db.insert(schema.sources).values({
    name: "GitHub 官方博客：MCP 生态 2026 年中报告",
    url: "https://github.blog/2026-08/mcp-ecosystem-report",
    sourceType: "official",
    publisher: "GitHub Blog",
    publishedAt: new Date("2026-08-25T10:00:00Z"),
    eventDate: new Date("2026-08-25T10:00:00Z"),
    disclosureDate: new Date("2026-08-25T10:00:00Z"),
    metadata: { kind: "ecosystem_report" },
  }).returning();
  const [srcInfoq] = await db.insert(schema.sources).values({
    name: "InfoQ 中文：企业 Agent 治理实践调研",
    url: "https://www.infoq.cn/article/agent-governance-2026",
    sourceType: "authoritative_media",
    publisher: "InfoQ 中国",
    publishedAt: new Date("2026-08-20T08:00:00Z"),
    eventDate: new Date("2026-07-15T00:00:00Z"), // 调研实际进行时间
    disclosureDate: new Date("2026-08-20T08:00:00Z"), // 公开披露时间
    metadata: { surveySize: 312 },
  }).returning();
  const [srcKpi] = await db.insert(schema.sources).values({
    name: "企业 Agent KPI 白皮书（内部方法论）",
    url: "internal://methodology/agent-kpi",
    sourceType: "internal",
    publisher: "AI 工场方法论组",
    publishedAt: new Date("2026-08-15T00:00:00Z"),
    eventDate: new Date("2026-08-15T00:00:00Z"),
    disclosureDate: new Date("2026-08-15T00:00:00Z"),
    metadata: { kind: "internal_whitepaper" },
  }).returning();
  const [srcTrending] = await db.insert(schema.sources).values({
    name: "GitHub Trending（2026W36 快照）",
    url: "https://github.com/trending",
    sourceType: "github",
    publisher: "GitHub",
    publishedAt: new Date("2026-09-04T08:00:00Z"),
    eventDate: new Date("2026-09-04T08:00:00Z"),
    disclosureDate: new Date("2026-09-04T08:00:00Z"),
    metadata: { snapshotWeek: W },
  }).returning();

  console.log("🔍 Source Packets（含比较对象/适用范围）…");
  const [p1] = await db.insert(schema.sourcePackets).values({
    topicId: t2.id,
    consistency: "verified",
    notes: "官方公告 + 权威调研交叉核验通过。",
  }).returning();
  const [p2] = await db.insert(schema.sourcePackets).values({
    topicId: t3.id,
    consistency: "verified",
    notes: "内部白皮书 + 行业调研。",
  }).returning();
  const [p3] = await db.insert(schema.sourcePackets).values({
    topicId: t5.id,
    consistency: "verified",
    notes: "GitHub Trending 快照直接生成。",
  }).returning();
  const [p4] = await db.insert(schema.sourcePackets).values({
    topicId: t6.id,
    consistency: "partially_verified",
    notes: "官方公告已核验；生态影响为推测，待验证。",
  }).returning();
  const [p5] = await db.insert(schema.sourcePackets).values({
    topicId: t7.id,
    consistency: "verified",
    notes: "GitHub 官方生态报告。",
  }).returning();

  await db.insert(schema.sourcePacketItems).values([
    {
      sourcePacketId: p1.id, sourceId: srcAnthropic.id,
      sourceName: "Anthropic 官方公告：Introducing Agent Skills",
      sourceUrl: "https://www.anthropic.com/news/agent-skills",
      sourceType: "official",
      publishedAt: new Date("2026-08-27T15:00:00Z"),
      eventDate: new Date("2026-08-27T15:00:00Z"),
      disclosureDate: new Date("2026-08-27T15:00:00Z"),
      coreFacts: "Claude 引入 Agent Skills：把领域流程封装为可版本化的技能文件，供 Agent 按需加载。",
      keyNumbers: { "首批技能数量": 40, "技能单次加载时间": 0.3 },
      numberTestConditions: "Anthropic 官方公告数据，截至 2026-08-27",
      comparisonObject: "此前插件系统（无版本管理）",
      applicableScope: "Claude 家族模型，Enterprise 计划",
      verificationStatus: "verified",
      verifiedAt: new Date("2026-08-28T09:00:00Z"),
    },
    {
      sourcePacketId: p1.id, sourceId: srcInfoq.id,
      sourceName: "InfoQ 中文：企业 Agent 治理实践调研",
      sourceUrl: "https://www.infoq.cn/article/agent-governance-2026",
      sourceType: "authoritative_media",
      publishedAt: new Date("2026-08-20T08:00:00Z"),
      eventDate: new Date("2026-07-15T00:00:00Z"),
      disclosureDate: new Date("2026-08-20T08:00:00Z"),
      coreFacts: "312 家企业调研：67% 已试点 Agent，其中仅 23% 建立了权限与审计机制。",
      keyNumbers: { "试点企业占比": 0.67, "建立治理机制占比": 0.23, "调研企业数": 312 },
      numberTestConditions: "InfoQ 2026 年 7 月调研，312 家企业样本",
      comparisonObject: "全量受访企业",
      applicableScope: "中国区企业，含 AI 原生与数字化转型企业",
      verificationStatus: "verified",
      verifiedAt: new Date("2026-08-21T10:00:00Z"),
    },
    {
      sourcePacketId: p2.id, sourceId: srcKpi.id,
      sourceName: "企业 Agent KPI 白皮书（内部方法论）",
      sourceUrl: "internal://methodology/agent-kpi",
      sourceType: "internal",
      publishedAt: new Date("2026-08-15T00:00:00Z"),
      coreFacts: "KPI 框架：任务完成率 ≥85%、人工接管率 ≤15%、单客服务成本下降 ≥30%、CSAT 提升 ≥10%。",
      keyNumbers: { "任务完成率阈值": 0.85, "人工接管率阈值": 0.15, "成本下降阈值": 0.3 },
      numberTestConditions: "AI 工场方法论，2026-08 版本",
      comparisonObject: "未部署 Agent 的对照组",
      applicableScope: "企业客户标准化场景",
      verificationStatus: "verified",
      verifiedAt: new Date("2026-08-16T00:00:00Z"),
    },
    {
      sourcePacketId: p3.id, sourceId: srcTrending.id,
      sourceName: "GitHub Trending 2026W36 快照",
      sourceUrl: "https://github.com/trending",
      sourceType: "github",
      publishedAt: new Date("2026-09-04T08:00:00Z"),
      coreFacts: "本周 star 增长前五：agent-tools(+1250)、deep-searcher(+980)、local-rag(+760)、workflow-ai(+540)、mcp-go(+310)。",
      keyNumbers: { "agent-tools周增长": 1250, "deep-searcher周增长": 980, "local-rag周增长": 760 },
      numberTestConditions: "GitHub Trending 2026W36 原始快照",
      comparisonObject: "上周同期增长",
      applicableScope: "GitHub 全站 Trending",
      verificationStatus: "verified",
      verifiedAt: new Date("2026-09-04T09:00:00Z"),
    },
    {
      sourcePacketId: p4.id, sourceId: srcAnthropic.id,
      sourceName: "Anthropic 官方公告（同源复用）",
      sourceUrl: "https://www.anthropic.com/news/agent-skills",
      sourceType: "official",
      publishedAt: new Date("2026-08-27T15:00:00Z"),
      coreFacts: "Skills 与既有 Prompt/工具不同：Skills 是带版本文档结构的可执行技能包。",
      verificationStatus: "verified",
      verifiedAt: new Date("2026-08-29T00:00:00Z"),
    },
    {
      sourcePacketId: p5.id, sourceId: srcGithub.id,
      sourceName: "GitHub 官方博客：MCP 生态 2026 年中报告",
      sourceUrl: "https://github.blog/2026-08/mcp-ecosystem-report",
      sourceType: "official",
      publishedAt: new Date("2026-08-25T10:00:00Z"),
      coreFacts: "MCP 注册 Server 数突破 12,000；企业采用率较半年前提升 4.2 倍。",
      keyNumbers: { "MCP服务器数": 12000, "企业采用率增长倍率": 4.2 },
      numberTestConditions: "GitHub MCP 生态报告，截至 2026-08-25",
      comparisonObject: "2026 年 2 月同期",
      applicableScope: "GitHub 平台内数据",
      verificationStatus: "verified",
      verifiedAt: new Date("2026-08-26T00:00:00Z"),
    },
  ]);

  console.log("📚 Knowledge Topics（概念血缘链）…");
  const [kGov] = await db.insert(schema.knowledgeTopics).values({
    topicId: t2.id,
    concept: "Agent Governance",
    category: "治理",
    knowledgeStatus: "basic_explanation",
    contentStatus: "script_done",
    b2bRelevance: 10, userLearningCost: 5, longTermValue: 10, currentHeat: 9,
    upstreamConcepts: ["AI Agent", "企业安全"],
    relatedConcepts: ["权限模型", "审计日志", "合规"],
    downstreamConcepts: ["Agent KPI", "人机协作边界"],
    existingContent: "《Agent 治理清单 v1》",
    nextAction: "补充审计实操章节后升级为深度讲解",
  }).returning();
  const [kSkills] = await db.insert(schema.knowledgeTopics).values({
    topicId: t6.id,
    concept: "Agent Skills",
    category: "Agent 能力",
    knowledgeStatus: "partial",
    contentStatus: "to_produce",
    b2bRelevance: 8, userLearningCost: 4, longTermValue: 8, currentHeat: 9,
    upstreamConcepts: ["Prompt Engineering", "工具调用"],
    relatedConcepts: ["Function Calling", "MCP"],
    downstreamConcepts: ["技能市场", "企业技能库"],
    existingContent: null,
    nextAction: "产出 Skills 封装实操教程",
  }).returning();
  const [kMcp] = await db.insert(schema.knowledgeTopics).values({
    topicId: t7.id,
    concept: "MCP 协议",
    category: "工具生态",
    knowledgeStatus: "basic_explanation",
    contentStatus: "wechat_done",
    b2bRelevance: 8, userLearningCost: 4, longTermValue: 9, currentHeat: 10,
    upstreamConcepts: ["模型上下文", "工具标准化"],
    relatedConcepts: ["Plugins", "Agent Skills"],
    downstreamConcepts: ["Workflow 编排", "企业集成"],
    existingContent: "公众号《MCP 一文读懂》",
    nextAction: "跟进生态报告数据更新",
  }).returning();

  // 概念血缘：Agent → Tool Use → MCP → Skills → Plugins → Governance
  await db.insert(schema.knowledgeRelations).values([
    { sourceKnowledgeTopicId: kSkills.id, targetKnowledgeTopicId: kMcp.id, relationType: "downstream" },
    { sourceKnowledgeTopicId: kMcp.id, targetKnowledgeTopicId: kGov.id, relationType: "upstream" },
    { sourceKnowledgeTopicId: kSkills.id, targetKnowledgeTopicId: kGov.id, relationType: "related" },
  ]);

  console.log("⭐ GitHub Snapshots（不可被未来数据覆盖）…");
  const [snap] = await db.insert(schema.githubSnapshots).values({
    snapshotId: `${W}-ORIGINAL`,
    snapshotType: "original",
    week: W,
    captureTime: new Date("2026-09-04T08:00:00Z"),
    selectionBasis: "mixed",
  }).returning();
  await db.insert(schema.githubSnapshotItems).values([
    { snapshotId: snap.id, rank: 1, repository: "agent-tools/agent-tools", projectName: "Agent 工具链", weeklyGrowth: "+1250", totalStars: 12840, repoUrl: "https://github.com/agent-tools/agent-tools", verificationStatus: "verified", selected: true },
    { snapshotId: snap.id, rank: 2, repository: "deepsearcher/deep-searcher", projectName: "深度检索器", weeklyGrowth: "+980", totalStars: 5320, repoUrl: "https://github.com/deepsearcher/deep-searcher", verificationStatus: "verified", selected: true },
    { snapshotId: snap.id, rank: 3, repository: "localrag/local-rag", projectName: "本地 RAG 引擎", weeklyGrowth: "+760", totalStars: 4890, repoUrl: "https://github.com/localrag/local-rag", verificationStatus: "verified", selected: true },
    { snapshotId: snap.id, rank: 4, repository: "workflowai/workflow-ai", projectName: "Workflow AI 编排器", weeklyGrowth: "+540", totalStars: 2100, repoUrl: "https://github.com/workflowai/workflow-ai", verificationStatus: "verified", selected: true },
    { snapshotId: snap.id, rank: 5, repository: "mcpgo/mcp-go", projectName: "MCP Go SDK", weeklyGrowth: "+310", totalStars: 980, repoUrl: "https://github.com/mcpgo/mcp-go", verificationStatus: "verified", selected: true },
    { snapshotId: snap.id, rank: 6, repository: "skillhub/skill-registry", projectName: "Agent Skill 注册中心", weeklyGrowth: "+290", totalStars: 760, repoUrl: "https://github.com/skillhub/skill-registry", verificationStatus: "verified", selected: false, eliminationReason: "与 Skills 选题内容重叠" },
    { snapshotId: snap.id, rank: 7, repository: "tinyagent/tiny-agent", projectName: "轻量 Agent 框架", weeklyGrowth: "+180", totalStars: 1500, repoUrl: "https://github.com/tinyagent/tiny-agent", verificationStatus: "unverified", selected: false, eliminationReason: "待核验" },
    { snapshotId: snap.id, rank: 8, repository: "evalkit/agent-eval", projectName: "Agent 评测工具", weeklyGrowth: "+120", totalStars: 640, repoUrl: "https://github.com/evalkit/agent-eval", verificationStatus: "unverified", selected: false, eliminationReason: "待核验" },
  ]);

  console.log("⚙️ Workflow Templates + Prompts + Models…");
  const tpls: Record<string, string> = {};
  for (const [type, name, desc, promptFile] of [
    ["orchestrator", "内容总控台", "统一编排各子工作流，分发 prompt 与上下文", "ai-prompts/orchestrator/main.md"],
    ["ai_weekly", "AI 周报", "每周抓取行业事件，产出 AI 周报内容资产", "ai-prompts/ai-weekly/main.md"],
    ["github_weekly", "GitHub 周榜", "快照 GitHub Trending，生成周榜选题候选", "ai-prompts/github-weekly/main.md"],
    ["evergreen", "常青知识", "围绕知识 Topic 产出深度讲解内容", "ai-prompts/evergreen/main.md"],
    ["wechat_deep_dive", "公众号深度专题", "为高价值 Topic 产出公众号深度长文", "ai-prompts/wechat-deep-dive/main.md"],
  ] as const) {
    const [tpl] = await db.insert(schema.workflowTemplates).values({
      workflowType: type, name, description: desc, promptFile,
      config: { schedule: type === "orchestrator" ? "weekly" : type === "github_weekly" ? "weekly" : "on_demand", model: "default" },
      version: 1, active: true,
    }).returning();
    tpls[type] = tpl.id;
  }

  // Prompt Templates + 版本（规格 §56）
  const promptTpls = new Map<string, string>();
  for (const [type, filePath] of [
    ["orchestrator", "ai-prompts/orchestrator/main.md"],
    ["ai_weekly", "ai-prompts/ai-weekly/main.md"],
    ["github_weekly", "ai-prompts/github-weekly/main.md"],
    ["evergreen", "ai-prompts/evergreen/main.md"],
    ["wechat_deep_dive", "ai-prompts/wechat-deep-dive/main.md"],
  ] as const) {
    const [pt] = await db.insert(schema.promptTemplates).values({
      name: `${type} 主提示词`, workflowType: type, filePath, status: "active", currentVersion: "1.0",
    }).returning();
    promptTpls.set(type, pt.id);
    await db.insert(schema.promptVersions).values({
      promptTemplateId: pt.id, version: "1.0",
      content: `# ${type} workflow prompt (v1.0)\n\n按 ai-prompts 目录对应文件执行，本表记录版本元数据。`,
      status: "active",
    });
  }

  // AI Models（规格 §57）
  const [modelClaude] = await db.insert(schema.aiModels).values({
    provider: "anthropic", modelName: "Claude Sonnet 5", modelId: "claude-sonnet-5",
    active: true, inputPrice: "3", outputPrice: "15", contextWindow: 200000,
    capabilities: ["code", "long_context", "tool_use"], metadata: { tier: "production" },
  }).returning();
  await db.insert(schema.aiModels).values({
    provider: "deepseek", modelName: "DeepSeek V4", modelId: "deepseek-v4-flash",
    active: true, inputPrice: "0.3", outputPrice: "1.2", contextWindow: 128000,
    capabilities: ["code", "cheap"], metadata: { tier: "batch" },
  });
  await db.insert(schema.aiModels).values({
    provider: "openai", modelName: "GPT-5.1", modelId: "gpt-5.1",
    active: false, inputPrice: "2.5", outputPrice: "10", contextWindow: 128000,
    capabilities: ["vision", "tool_use"], metadata: { tier: "evaluation" },
  });

  console.log("🚀 Workflow Runs（5 种状态覆盖）+ Tasks + Outputs…");
  const [runGw] = await db.insert(schema.workflowRuns).values({
    workflowType: "github_weekly", templateId: tpls.github_weekly,
    batchId: `${W}-AI-WEEKLY`, inputPayload: { week: W }, sourcePacketId: p3.id,
    status: "completed",
    startedAt: new Date("2026-09-04T08:00:00Z"), completedAt: new Date("2026-09-04T08:04:30Z"),
    output: { itemsCaptured: 8, selected: 5 },
  }).returning();
  const [runAw] = await db.insert(schema.workflowRuns).values({
    workflowType: "ai_weekly", templateId: tpls.ai_weekly,
    topicId: t1.id, batchId: `${W}-AI-WEEKLY`, inputPayload: { week: W }, sourcePacketId: p1.id,
    status: "completed",
    startedAt: new Date("2026-09-04T09:00:00Z"), completedAt: new Date("2026-09-04T09:12:00Z"),
    output: { events: 12, verified: 10, assetTitles: ["AI Agent 治理全景观察"] },
  }).returning();
  const [runEv] = await db.insert(schema.workflowRuns).values({
    workflowType: "evergreen", templateId: tpls.evergreen,
    topicId: t6.id, inputPayload: { topic: "agent-skills" }, sourcePacketId: p4.id,
    status: "needs_review",
    startedAt: new Date("2026-09-03T14:00:00Z"),
    output: {}, error: "Skills 生态影响数据仅有单一来源，未通过核验条件",
  }).returning();
  const [runWd] = await db.insert(schema.workflowRuns).values({
    workflowType: "wechat_deep_dive", templateId: tpls.wechat_deep_dive,
    topicId: t2.id, inputPayload: { topic: "agent-governance" }, sourcePacketId: p1.id,
    status: "running",
    startedAt: new Date("2026-09-05T02:00:00Z"),
    output: {},
  }).returning();
  const [runFail] = await db.insert(schema.workflowRuns).values({
    workflowType: "ai_weekly", templateId: tpls.ai_weekly,
    topicId: t3.id, batchId: `${W}-AI-WEEKLY-2`, inputPayload: { week: W },
    status: "failed",
    startedAt: new Date("2026-09-05T03:00:00Z"), completedAt: new Date("2026-09-05T03:01:00Z"),
    error: "上游 API 超时：行业事件源不可用",
  }).returning();

  await db.insert(schema.workflowTasks).values([
    { runId: runGw.id, taskKey: "fetch", label: "抓取 GitHub Trending", status: "completed", input: { source: "github" }, output: { items: 50 }, startedAt: new Date("2026-09-04T08:00:00Z"), completedAt: new Date("2026-09-04T08:02:00Z") },
    { runId: runGw.id, taskKey: "filter", label: "按 B2B 价值过滤", status: "completed", input: {}, output: { kept: 8 }, startedAt: new Date("2026-09-04T08:02:00Z"), completedAt: new Date("2026-09-04T08:03:00Z") },
    { runId: runGw.id, taskKey: "verify", label: "逐条核验", status: "completed", input: {}, output: { verified: 6 }, startedAt: new Date("2026-09-04T08:03:00Z"), completedAt: new Date("2026-09-04T08:04:30Z") },
    { runId: runAw.id, taskKey: "fetch", label: "采集本周行业事件", status: "completed", input: { sources: ["official", "media"] }, output: { events: 12 }, startedAt: new Date("2026-09-04T09:00:00Z"), completedAt: new Date("2026-09-04T09:05:00Z") },
    { runId: runAw.id, taskKey: "verify", label: "数字核验", status: "completed", input: {}, output: { verified: 10, rejected: 2 }, startedAt: new Date("2026-09-04T09:05:00Z"), completedAt: new Date("2026-09-04T09:08:00Z") },
    { runId: runAw.id, taskKey: "produce", label: "生成周报脚本", status: "completed", input: { topic: t1.topicId }, output: { assetTitle: "AI Agent 治理全景观察" }, startedAt: new Date("2026-09-04T09:08:00Z"), completedAt: new Date("2026-09-04T09:12:00Z") },
    { runId: runEv.id, taskKey: "research", label: "Skill 生态研究", status: "needs_review", input: {}, output: {}, error: "生态影响无第二来源", startedAt: new Date("2026-09-03T14:00:00Z") },
    { runId: runWd.id, taskKey: "draft", label: "撰写治理专题初稿", status: "running", input: { topic: "agent-governance" }, startedAt: new Date("2026-09-05T02:00:00Z") },
    { runId: runFail.id, taskKey: "fetch", label: "采集行业事件", status: "failed", input: {}, output: {}, error: "上游 API 超时", startedAt: new Date("2026-09-05T03:00:00Z") },
  ]);

  await db.insert(schema.workflowOutputs).values([
    { runId: runAw.id, outputType: "weekly_report", label: "2026W36 AI 周报草稿", content: "本周关键事件：Agent Skills 发布；MCP 生态报告；…", refTopicId: t1.id },
    { runId: runWd.id, outputType: "article_draft", label: "《企业级 AI Agent 治理指南》初稿", content: "（初稿，待审核）一、为什么需要治理…", refTopicId: t2.id },
  ]);

  // AI Usage Logs（规格 §58）
  await db.insert(schema.aiUsageLogs).values([
    { workflowRunId: runAw.id, modelId: modelClaude.id, inputTokens: 8500, outputTokens: 4200, cost: "0.0885", latency: 3200 },
    { workflowRunId: runWd.id, modelId: modelClaude.id, inputTokens: 12000, outputTokens: 8600, cost: "0.165", latency: 5100 },
  ]);

  console.log("📝 Content Assets + Versions + Brand/Visual…");
  const [a1] = await db.insert(schema.contentAssets).values({
    topicId: t1.id, assetType: "ai_weekly_script", platform: "wechat",
    title: "AI 周报 09.04：Agent Skills 发布与治理观察",
    content: "本周重点：\n1. Anthropic 发布 Agent Skills（+40 技能）\n2. MCP 生态报告：Server 超 12,000\n3. 企业治理调研：67% 已试点、23% 有治理机制\n\n结论：治理能力成为 Agent 规模化分水岭。",
    contentRole: "traffic", cta: "订阅周报", status: "ready", version: 1,
  }).returning();
  const [a2] = await db.insert(schema.contentAssets).values({
    topicId: t2.id, assetType: "wechat_article", platform: "wechat",
    title: "深度长文：企业级 AI Agent 治理体系（上）",
    content: "一、为什么需要治理：Agent 规模化后的失控风险\n二、治理框架：权限 / 审计 / 可追溯 / 合规\n三、落地清单（附 20 项检查项）",
    contentRole: "cognition", cta: "获取治理清单", status: "in_review", version: 2,
  }).returning();
  const [a3] = await db.insert(schema.contentAssets).values({
    topicId: t3.id, assetType: "short_video_script", platform: "douyin",
    title: "企业 Agent 落地：从试点到 KPI 闭环（口播稿）",
    content: "【开场】你的公司用上 AI Agent 了吗？\n【正文】三步走：试点场景选择 → 指标设定 → 人机分工…\n【收尾】评论区回复『KPI』领取框架。",
    contentRole: "conversion", cta: "回复 KPI 领取框架", status: "ready", version: 1,
  }).returning();
  const [a4] = await db.insert(schema.contentAssets).values({
    topicId: t4.id, assetType: "sales_material", platform: "other",
    title: "Agent KPI 框架（售前材料）",
    content: "一页纸：任务完成率 / 人工接管率 / 单客成本 / CSAT。",
    contentRole: "conversion", cta: "预约演示", status: "ready", version: 1,
  }).returning();
  const [a5] = await db.insert(schema.contentAssets).values({
    topicId: t5.id, assetType: "github_card", platform: "xiaohongshu",
    title: "小红书：GitHub 周榜 AI 项目盘点 2026W36",
    content: "本周最值得关注的开源 AI 项目：\n1. agent-tools +1250⭐\n2. deep-searcher +980⭐\n3. local-rag +760⭐\n4. workflow-ai +540⭐\n5. mcp-go +310⭐",
    contentRole: "traffic", cta: "收藏不迷路", status: "published", version: 1,
  }).returning();
  const [a6] = await db.insert(schema.contentAssets).values({
    topicId: t8.id, assetType: "infographic", platform: "wechat",
    title: "内容生产流水线一图流：MCP → Workflow → 发布 → 回流",
    content: "信息图文案：\n数据源 → 选题 → 核验 → AI 生产 → 人工审核 → 多平台发布 → 数据回流 → 下一轮选题。",
    contentRole: "scenario", cta: "预约演示", status: "draft", version: 1,
  }).returning();

  // 版本历史（规格 §26）：a2 的 v2
  await db.insert(schema.contentVersions).values([
    { contentAssetId: a2.id, version: 1, content: "一、为什么需要治理…（v1 初稿）", changeSummary: "初稿", createdBy: "ai:workflow_run" },
    { contentAssetId: a2.id, version: 2, content: "一、为什么需要治理：Agent 规模化后的失控风险\n二、治理框架：权限 / 审计 / 可追溯 / 合规\n三、落地清单（附 20 项检查项）", changeSummary: "补充 InfoQ 调研数据 + 治理清单", createdBy: "operator@aifactory.example.com" },
  ]);
  await db.update(schema.contentAssets).set({ version: 2 }).where(sql`${schema.contentAssets.id} = ${a2.id}`);

  // Brand Assets（规格 §29）
  await db.insert(schema.brandAssets).values([
    { name: "公司 Logo（正式版）", type: "logo", fileUrl: "/brand/logo.png", usageNotes: "AI 生成图片时禁止自动重绘 Logo，必须引用本文件", version: 1, active: true },
    { name: "公众号封面模板", type: "template", fileUrl: "/brand/wechat-cover.png", usageNotes: "宽 900×383（2.35:1）", version: 2, active: true },
    { name: "产品截图（后台）", type: "product_screenshot", fileUrl: "/brand/product-backend.png", usageNotes: "仅限官方渠道", version: 1, active: true },
    { name: "GitHub 周榜卡片模板", type: "template", fileUrl: "/brand/github-card.png", usageNotes: "1122×1402（4:5）", version: 1, active: true },
  ]);

  // Visual Templates（规格 §30）
  await db.insert(schema.visualTemplates).values([
    { name: "GitHub 周榜卡片", contentType: "github_card", width: 1122, height: 1402, aspectRatio: "4:5", layoutConfig: '{"titlePos":"top","grid":2}', brandAssetIds: [""], active: true, version: 1 },
    { name: "公众号封面", contentType: "wechat_cover", width: 900, height: 383, aspectRatio: "2.35:1", layoutConfig: '{"titlePos":"left"}', brandAssetIds: [""], active: true, version: 1 },
    { name: "短视频竖版封面", contentType: "short_video_cover", width: 1080, height: 1920, aspectRatio: "9:16", layoutConfig: '{"titlePos":"top","ctaPos":"bottom"}', brandAssetIds: [""], active: true, version: 1 },
  ]);

  console.log("👥 Social Accounts + Connectors…");
  const [accDouyin] = await db.insert(schema.socialAccounts).values({
    platform: "douyin", accountName: "AI工场官方号", externalAccountId: "douyin_10001",
    avatarUrl: "/brand/logo.png", status: "active", metadata: "企业认证",
  }).returning();
  const [accXhs] = await db.insert(schema.socialAccounts).values({
    platform: "xiaohongshu", accountName: "AI工场", externalAccountId: "xhs_20001",
    avatarUrl: "/brand/logo.png", status: "active", metadata: null,
  }).returning();
  const [accWechat] = await db.insert(schema.socialAccounts).values({
    platform: "wechat", accountName: "AI工场公众号", externalAccountId: "gh_30001",
    status: "active", metadata: "服务号",
  }).returning();
  await db.insert(schema.socialAccounts).values({
    platform: "wechat_video", accountName: "AI工场视频号", externalAccountId: "wxv_40001",
    status: "inactive", metadata: "待开播",
  });

  const [conn] = await db.insert(schema.dataConnectors).values({
    name: "小豆芽数据连接器", connectorType: "xiaodouya", status: "active",
    config: { mode: "file_import", note: "V1 File Import 模式（规格 §34）" },
    lastSyncAt: new Date("2026-09-04T12:00:00Z"),
  }).returning();
  await db.insert(schema.connectorAccounts).values([
    { connectorId: conn.id, socialAccountId: accDouyin.id, externalAccountId: "douyin_10001", externalAccountName: "AI工场官方号", mappingStatus: "mapped" },
    { connectorId: conn.id, socialAccountId: accXhs.id, externalAccountId: "xhs_20001", externalAccountName: "AI工场", mappingStatus: "mapped" },
  ]);
  await db.insert(schema.dataImportBatches).values([
    { connectorId: conn.id, fileName: "xiaodouya_posts_20260904.csv", fileType: "csv", status: "completed", totalRows: "6", successRows: "6", failedRows: "0", errorLog: "", createdAt: new Date("2026-09-04T12:00:00Z"), completedAt: new Date("2026-09-04T12:01:00Z") },
    { connectorId: conn.id, fileName: "xiaodouya_accounts_20260904.csv", fileType: "csv", status: "completed", totalRows: "2", successRows: "2", failedRows: "0", errorLog: "", createdAt: new Date("2026-09-04T12:02:00Z"), completedAt: new Date("2026-09-04T12:02:30Z") },
  ]);
  await db.insert(schema.dataSyncJobs).values([
    { connectorId: conn.id, syncType: "post", status: "completed", startedAt: new Date("2026-09-04T12:00:00Z"), completedAt: new Date("2026-09-04T12:01:00Z"), recordsRead: "6", recordsCreated: "6", recordsUpdated: "0", recordsFailed: "0" },
    { connectorId: conn.id, syncType: "account", status: "completed", startedAt: new Date("2026-09-04T12:02:00Z"), completedAt: new Date("2026-09-04T12:02:30Z"), recordsRead: "2", recordsCreated: "2", recordsUpdated: "0", recordsFailed: "0" },
  ]);

  console.log("🗓️ Publications（绑定账号）…");
  const [pub1] = await db.insert(schema.publications).values({
    topicId: t3.id, assetId: a3.id, socialAccountId: accDouyin.id, platform: "douyin",
    scheduledDate: "2026-09-06", status: "planned",
  }).returning();
  const [pub2] = await db.insert(schema.publications).values({
    topicId: t2.id, assetId: a2.id, socialAccountId: accWechat.id, platform: "wechat",
    scheduledDate: "2026-09-09", status: "planned",
  }).returning();
  const [pub3] = await db.insert(schema.publications).values({
    topicId: t1.id, assetId: a1.id, socialAccountId: accWechat.id, platform: "wechat",
    scheduledDate: "2026-09-05", status: "scheduled",
  }).returning();
  const [pub4] = await db.insert(schema.publications).values({
    topicId: t5.id, assetId: a5.id, socialAccountId: accXhs.id, platform: "xiaohongshu",
    scheduledDate: "2026-09-03", publishedDate: new Date("2026-09-03T10:00:00Z"),
    publishedUrl: "https://www.xiaohongshu.com/explore/66f1a2b3", status: "published",
  }).returning();

  console.log("🌾 External Posts + Metric Snapshots（T+1/3/7）…");
  // 外部作品：2 条已确认匹配，1 条建议匹配，1 条未匹配
  const [ep1] = await db.insert(schema.externalPosts).values({
    publicationId: pub4.id, connectorId: conn.id, socialAccountId: accXhs.id,
    externalPostId: "xhs_20001_0001", platform: "xiaohongshu",
    title: "小红书：GitHub 周榜 AI 项目盘点 2026W36",
    publishedAt: new Date("2026-09-03T10:00:00Z"),
    externalUrl: "https://www.xiaohongshu.com/explore/66f1a2b3",
    matchStatus: "confirmed", matchConfidence: "high",
    rawData: { note_id: "66f1a2b3", author: "AI工场" },
  }).returning();
  const [ep2] = await db.insert(schema.externalPosts).values({
    publicationId: pub3.id, connectorId: conn.id, socialAccountId: accWechat.id,
    externalPostId: "wx_30001_0002", platform: "wechat",
    title: "AI 周报 09.04：Agent Skills 发布与治理观察",
    publishedAt: new Date("2026-09-05T09:00:00Z"),
    externalUrl: "https://mp.weixin.qq.com/s/abc123",
    matchStatus: "confirmed", matchConfidence: "high",
    rawData: { article_id: "abc123" },
  }).returning();
  const [ep3] = await db.insert(schema.externalPosts).values({
    connectorId: conn.id, socialAccountId: accDouyin.id,
    externalPostId: "douyin_10001_0003", platform: "douyin",
    title: "企业 Agent 落地：从试点到 KPI 闭环",
    publishedAt: new Date("2026-09-06T11:00:00Z"),
    externalUrl: "https://www.douyin.com/video/741000",
    matchStatus: "suggested", matchConfidence: "medium",
    rawData: { aweme_id: "741000" },
  }).returning();
  await db.insert(schema.externalPosts).values({
    connectorId: conn.id, socialAccountId: accDouyin.id,
    externalPostId: "douyin_10001_0004", platform: "douyin",
    title: "MCP 一文读懂：Agent 工具标准",
    publishedAt: new Date("2026-09-02T18:00:00Z"),
    externalUrl: "https://www.douyin.com/video/740888",
    matchStatus: "unmatched", matchConfidence: null,
    rawData: { aweme_id: "740888" },
  });

  // 快照（规格 §40：T+1/3/7，禁止只存最终值）
  const t0 = new Date("2026-09-03T12:00:00Z");
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
  await db.insert(schema.postMetricSnapshots).values([
    // ep1（XHS 周榜卡片）
    { externalPostId: ep1.id, publicationId: pub4.id, capturedAt: addDays(t0, 1), impressions: 18300, views: 17600, reads: 15200, likes: 890, comments: 64, shares: 120, saves: 640, completionRate: "0.55", profileVisits: 210, rawMetrics: { source: "xiaodouya_csv" } },
    { externalPostId: ep1.id, publicationId: pub4.id, capturedAt: addDays(t0, 3), impressions: 26700, views: 25100, reads: 21900, likes: 1420, comments: 98, shares: 176, saves: 1030, completionRate: "0.58", profileVisits: 330, rawMetrics: { source: "xiaodouya_csv" } },
    { externalPostId: ep1.id, publicationId: pub4.id, capturedAt: addDays(t0, 7), impressions: 34200, views: 31800, reads: 27600, likes: 1880, comments: 132, shares: 214, saves: 1350, completionRate: "0.61", profileVisits: 450, rawMetrics: { source: "xiaodouya_csv" } },
    // ep2（公众号周报）
    { externalPostId: ep2.id, publicationId: pub3.id, capturedAt: addDays(t0, 2), impressions: 8600, views: 8200, reads: 7600, likes: 310, comments: 28, shares: 86, saves: 120, profileVisits: 95, rawMetrics: { source: "xiaodouya_csv" } },
    { externalPostId: ep2.id, publicationId: pub3.id, capturedAt: addDays(t0, 5), impressions: 12300, views: 11500, reads: 10200, likes: 420, comments: 35, shares: 112, saves: 158, profileVisits: 140, rawMetrics: { source: "xiaodouya_csv" } },
    // ep3（抖音，仅 T+1）
    { externalPostId: ep3.id, publicationId: null, capturedAt: addDays(t0, 1), impressions: 52100, views: 47800, reads: 39000, likes: 1830, comments: 214, shares: 96, saves: 340, completionRate: "0.38", fiveSecondRetention: "0.72", profileVisits: 320, rawMetrics: { source: "xiaodouya_csv" } },
  ]);

  // 账号级快照（规格 §41）
  await db.insert(schema.accountMetricSnapshots).values([
    { socialAccountId: accDouyin.id, capturedAt: addDays(t0, 1), followers: 52400, newFollowers: 380, profileVisits: 420, impressions: 64000, views: 59000, engagements: 2600, rawMetrics: { source: "xiaodouya_csv" } },
    { socialAccountId: accDouyin.id, capturedAt: addDays(t0, 3), followers: 52890, newFollowers: 490, profileVisits: 510, impressions: 71000, views: 66000, engagements: 3100, rawMetrics: { source: "xiaodouya_csv" } },
    { socialAccountId: accDouyin.id, capturedAt: addDays(t0, 7), followers: 53600, newFollowers: 710, profileVisits: 680, impressions: 82000, views: 75000, engagements: 3800, rawMetrics: { source: "xiaodouya_csv" } },
    { socialAccountId: accXhs.id, capturedAt: addDays(t0, 1), followers: 18200, newFollowers: 260, profileVisits: 230, impressions: 21000, views: 19600, engagements: 1500, rawMetrics: { source: "xiaodouya_csv" } },
    { socialAccountId: accXhs.id, capturedAt: addDays(t0, 3), followers: 18580, newFollowers: 380, profileVisits: 310, impressions: 25000, views: 23000, engagements: 1900, rawMetrics: { source: "xiaodouya_csv" } },
    { socialAccountId: accXhs.id, capturedAt: addDays(t0, 7), followers: 19050, newFollowers: 470, profileVisits: 420, impressions: 29000, views: 26800, engagements: 2300, rawMetrics: { source: "xiaodouya_csv" } },
  ]);

  // Metric Definitions + Mappings（规格 §39）
  const metricDefs: { key: string; label: string; category: string; unit: string }[] = [
    { key: "impressions", label: "曝光量", category: "content", unit: "count" },
    { key: "views", label: "播放量/阅读量", category: "content", unit: "count" },
    { key: "reads", label: "阅读量(图文)", category: "content", unit: "count" },
    { key: "likes", label: "点赞数", category: "content", unit: "count" },
    { key: "comments", label: "评论数", category: "content", unit: "count" },
    { key: "shares", label: "分享数", category: "content", unit: "count" },
    { key: "saves", label: "收藏数", category: "content", unit: "count" },
    { key: "completion_rate", label: "完播率", category: "content", unit: "percent" },
    { key: "five_second_retention", label: "5秒完播率", category: "content", unit: "percent" },
    { key: "profile_visits", label: "主页访问", category: "content", unit: "count" },
    { key: "followers", label: "粉丝数", category: "account", unit: "count" },
    { key: "new_followers", label: "新增粉丝", category: "account", unit: "count" },
    { key: "engagements", label: "互动量", category: "account", unit: "count" },
  ];
  await db.insert(schema.metricDefinitions).values(metricDefs);
  await db.insert(schema.metricMappings).values([
    { connectorId: conn.id, sourceField: "播放量", metricKey: "views", transform: "int" },
    { connectorId: conn.id, sourceField: "点赞数", metricKey: "likes", transform: "int" },
    { connectorId: conn.id, sourceField: "评论数", metricKey: "comments", transform: "int" },
    { connectorId: conn.id, sourceField: "分享数", metricKey: "shares", transform: "int" },
    { connectorId: conn.id, sourceField: "收藏数", metricKey: "saves", transform: "int" },
  ]);

  // Content Metrics（规格 §40 聚合源）：所有指标绑定 Topic_ID
  console.log("📊 Content Metrics（绑定 Topic_ID）…");
  await db.insert(schema.contentMetrics).values([
    { topicId: t1.id, platform: "wechat", metricDate: "2026-09-05", impressions: 12300, views: 11500, reads: 10200, completionRate: "0.61", saveCount: 158, shareCount: 112, commentCount: 35, profileVisits: 140, ctaClicks: 42, consultations: 1, demoRequests: 0, salesLeads: 1, revenue: "0" },
    { topicId: t5.id, platform: "xiaohongshu", metricDate: "2026-09-03", impressions: 34200, views: 31800, reads: 27600, completionRate: "0.61", saveCount: 1350, shareCount: 214, commentCount: 132, profileVisits: 450, ctaClicks: 90, consultations: 0, demoRequests: 0, salesLeads: 0, revenue: "0" },
    { topicId: t4.id, platform: "other", metricDate: "2026-09-02", impressions: 0, views: 0, reads: 0, saveCount: 0, shareCount: 0, commentCount: 0, profileVisits: 0, ctaClicks: 18, registrations: 3, materialDownloads: 12, consultations: 0, demoRequests: 2, salesLeads: 1, revenue: "0" },
  ]);

  console.log("🏆 Topic Performances（2026W36 反馈闭环）…");
  await db.insert(schema.topicPerformances).values([
    {
      topicId: t5.id, period: "2026W35",
      trafficScore: "8.2", engagementScore: "7.6", leadScore: "4.0", conversionScore: "2.0", performanceScore: "5.5",
      recommendation: "继续", metrics: { views: 31800, likes: 1880, comments: 132, shares: 214, saves: 1350, leadCount: 2 },
    },
    {
      topicId: t1.id, period: "2026W35",
      trafficScore: "6.8", engagementScore: "6.2", leadScore: "6.0", conversionScore: "4.0", performanceScore: "5.8",
      recommendation: "继续", metrics: { views: 11500, likes: 420, comments: 35, shares: 112, saves: 158, leadCount: 3, consultationCount: 1 },
    },
    {
      topicId: t6.id, period: "2026W35",
      trafficScore: "4.0", engagementScore: "3.2", leadScore: "2.0", conversionScore: "1.0", performanceScore: "2.6",
      recommendation: "暂缓", metrics: { views: 2200, likes: 60, comments: 5, leadCount: 0 },
    },
  ]);

  console.log("💼 Leads + Conversion Events…");
  const [lead1] = await db.insert(schema.leads).values({
    topicId: t4.id, source: "售前材料下载", name: "王强", company: "云启科技", contact: "wangqiang@example.com",
    leadType: "inbound", status: "contacted", notes: "关注 Agent KPI 框架，处于选型评估期",
  }).returning();
  const [lead2] = await db.insert(schema.leads).values({
    topicId: t3.id, source: "抖音评论", name: "李婷", company: "数聚智能", contact: "微信: liting_001",
    leadType: "consultation", status: "qualified", notes: "咨询企业 Agent 试点咨询",
  }).returning();
  await db.insert(schema.leads).values({
    topicId: t2.id, source: "公众号表单", name: "张总", company: "华信制造", contact: "13800138000",
    leadType: "demo", status: "new", notes: "索取治理清单并预约演示",
  });

  await db.insert(schema.conversionEvents).values([
    { topicId: t4.id, publicationId: null, leadId: lead1.id, eventType: "download", eventValue: "1" },
    { topicId: t4.id, publicationId: null, leadId: lead1.id, eventType: "sales_lead", eventValue: "1" },
    { topicId: t3.id, publicationId: pub1.id, leadId: lead2.id, eventType: "cta_click", eventValue: "1" },
    { topicId: t3.id, publicationId: pub1.id, leadId: lead2.id, eventType: "consultation", eventValue: "1" },
  ]);

  console.log("📋 Audit Logs…");
  await db.insert(schema.auditLogs).values([
    { action: "topic_create", entityType: "topics", entityId: t2.id, actor: "operator@aifactory.example.com", before: null, after: { title: "Agent Governance：企业级 AI Agent 治理体系" }, notes: "创建治理 Topic" },
    { action: "source_verify", entityType: "source_packet_items", entityId: null, actor: "operator@aifactory.example.com", before: { verificationStatus: "unverified" }, after: { verificationStatus: "verified" }, notes: "Anthropic 公告核验通过" },
    { action: "workflow_run", entityType: "workflow_runs", entityId: runAw.id, actor: "ai:" + runAw.id, before: { status: "queued" }, after: { status: "completed" }, notes: "AI 周报 run 完成" },
    { action: "content_update", entityType: "content_assets", entityId: a2.id, actor: "operator@aifactory.example.com", before: { version: 1 }, after: { version: 2 }, notes: "治理文章升级 v2" },
    { action: "publication_update", entityType: "publications", entityId: pub4.id, actor: "operator@aifactory.example.com", before: { status: "planned" }, after: { status: "published" }, notes: "XHS 周榜卡片已发布" },
    { action: "data_import", entityType: "data_import_batches", entityId: null, actor: "operator@aifactory.example.com", before: null, after: { file: "xiaodouya_posts_20260904.csv", rows: 6 }, notes: "小豆芽作品 CSV 导入" },
    { action: "external_post_match", entityType: "external_posts", entityId: ep1.id, actor: "operator@aifactory.example.com", before: { matchStatus: "unmatched" }, after: { matchStatus: "confirmed" }, notes: "URL 精确匹配确认" },
    { action: "lead_create", entityType: "leads", entityId: lead2.id, actor: "operator@aifactory.example.com", before: null, after: { name: "李婷", company: "数聚智能" }, notes: "抖音咨询线索" },
  ]);

  console.log("⚖️ Topic Scoring Config（权重可配置，规格 §12）…");
  await db.insert(schema.topicScoringConfig).values({
    name: "default", b2bWeight: 25, trafficWeight: 20, conversionWeight: 20, timelinessWeight: 15, contentValueWeight: 20,
    typeOverrides: JSON.stringify({ conversion: { b2b: 30, conversion: 30 } }),
    active: 1,
  });

  console.log("✅ Seed 完成（43+ 表全部覆盖）");
}

// 延迟 import schema（TRUNCATE 之后按需引用，避免循环）
import * as schema from "./schema";

seed().catch((e) => {
  console.error("❌ Seed 失败：", e);
  process.exit(1);
});
