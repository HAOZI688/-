import { pgEnum } from "drizzle-orm/pg-core";

/** Topic 类型 */
export const topicType = pgEnum("topic_type", [
  "hot",
  "evergreen",
  "technical_project",
  "scenario",
  "product",
  "conversion",
  "trend",
  "knowledge",
]);

/** Topic 生命周期状态（全局状态机，需求一） */
export const topicStatus = pgEnum("topic_status", [
  "draft",
  "researching",
  "ready_for_production",
  "producing",
  "review",
  "needs_revision",
  "ready_to_publish",
  "published",
  "archived",
]);

/** 优先级 */
export const priority = pgEnum("priority", ["P0", "P1", "P2", "P3"]);

/** 历史查重状态 */
export const historyDedupeStatus = pgEnum("history_dedupe_status", [
  "not_checked",
  "duplicate",
  "related",
  "confirmed_new",
]);

/** 来源类型（需求三） */
export const sourceType = pgEnum("source_type", [
  "official",
  "github",
  "official_docs",
  "authoritative_media",
  "tech_media",
  "community",
  "internal",
]);

/** 核验状态（需求三） */
export const verificationStatus = pgEnum("verification_status", [
  "unverified",
  "partially_verified",
  "verified",
  "conflict",
  "needs_update",
]);

/** Source_Packet 整体一致性 */
export const sourceConsistency = pgEnum("source_consistency", [
  "unverified",
  "partially_verified",
  "verified",
  "conflict",
  "needs_update",
]);

/** 工作流类型（Orchestrator + 4 子工作流） */
export const workflowType = pgEnum("workflow_type", [
  "orchestrator",
  "ai_weekly",
  "github_weekly",
  "evergreen",
  "wechat_deep_dive",
]);

/** Workflow Run 状态 */
export const workflowRunStatus = pgEnum("workflow_run_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "needs_review",
]);

/** 内容资产类型（需求十） */
export const assetType = pgEnum("asset_type", [
  "ai_weekly_script",
  "short_video_script",
  "wechat_article",
  "github_card",
  "xiaohongshu",
  "sales_material",
  "infographic",
  "cover",
]);

/** 内容资产状态（资产自身生命周期） */
export const assetStatus = pgEnum("asset_status", [
  "draft",
  "in_review",
  "needs_revision",
  "ready",
  "published",
  "archived",
]);

/** Content Role（需求八，只允许一个） */
export const contentRole = pgEnum("content_role", [
  "traffic",
  "cognition",
  "scenario",
  "product",
  "conversion",
]);

/** 发布平台（需求十二 + 规格 §32） */
export const platform = pgEnum("platform", [
  "wechat",
  "douyin",
  "xiaohongshu",
  "bilibili",
  "wechat_video",
  "kuaishou",
  "other",
]);

/** 发布状态（规格 §31：planned/ready/scheduled/published/failed） */
export const publicationStatus = pgEnum("publication_status", [
  "planned",
  "ready",
  "scheduled",
  "published",
  "failed",
]);

/** GitHub Snapshot 类型（需求六） */
export const snapshotType = pgEnum("snapshot_type", ["original", "replay"]);

/** 榜单选取依据（需求六） */
export const selectionBasis = pgEnum("selection_basis", [
  "pure_weekly_rank",
  "value_filtered",
  "mixed",
]);

/** 品牌资产类型（需求十一 + 规格 §29） */
export const brandAssetType = pgEnum("brand_asset_type", [
  "logo",
  "product_screenshot",
  "template",
  "background",
  "icon",
  "visual_reference",
  "cta_asset",
]);

/** 知识状态（需求七） */
export const knowledgeStatus = pgEnum("knowledge_status", [
  "uncovered",
  "partial",
  "basic_explanation",
  "deep_explanation",
  "needs_update",
  "mature",
]);

/** 知识内容状态（需求七） */
export const knowledgeContentStatus = pgEnum("knowledge_content_status", [
  "to_research",
  "to_produce",
  "script_done",
  "wechat_done",
  "graphic_done",
  "published",
  "high_performing",
  "needs_remake",
]);

/** Topic Relation 类型（规格 §7） */
export const topicRelationType = pgEnum("topic_relation_type", [
  "parent",
  "source",
  "derived",
  "related",
]);

/** Knowledge Relation 类型（规格 §21） */
export const knowledgeRelationType = pgEnum("knowledge_relation_type", [
  "upstream",
  "related",
  "downstream",
]);

/** 社交账号状态 */
export const socialAccountStatus = pgEnum("social_account_status", [
  "active",
  "inactive",
  "revoked",
]);

/** Connector 类型（规格 §34） */
export const connectorType = pgEnum("connector_type", [
  "xiaodouya",
  "csv_import",
  "manual",
  "future_api",
]);

/** Connector 状态 */
export const connectorStatus = pgEnum("connector_status", [
  "active",
  "inactive",
  "error",
]);

/** 账号映射状态 */
export const mappingStatus = pgEnum("mapping_status", [
  "unmapped",
  "mapped",
  "conflict",
]);

/** External Post 匹配状态（规格 §36） */
export const matchStatus = pgEnum("match_status", [
  "unmatched",
  "suggested",
  "confirmed",
  "conflict",
]);

/** 导入批次状态 */
export const importBatchStatus = pgEnum("import_batch_status", [
  "uploaded",
  "detected",
  "mapped",
  "previewed",
  "validated",
  "importing",
  "completed",
  "failed",
  "partial",
]);

/** Sync Job 类型（规格 §42） */
export const syncType = pgEnum("sync_type", ["account", "post", "full", "import"]);

/** Lead 类型（规格 §47） */
export const leadType = pgEnum("lead_type", [
  "inbound",
  "outbound",
  "demo",
  "consultation",
  "other",
]);

/** Lead 状态 */
export const leadStatus = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
]);

/** 转化事件类型（规格 §48） */
export const conversionEventType = pgEnum("conversion_event_type", [
  "cta_click",
  "registration",
  "download",
  "consultation",
  "demo",
  "sales_lead",
  "deal",
]);

/** Prompt 状态（规格 §56） */
export const promptStatus = pgEnum("prompt_status", [
  "draft",
  "active",
  "archived",
]);

/** 审计动作（规格 §83） */
export const auditAction = pgEnum("audit_action", [
  "topic_create",
  "topic_update",
  "source_verify",
  "workflow_run",
  "content_update",
  "publication_update",
  "data_import",
  "external_post_match",
  "lead_create",
  "system",
]);

/* ===== V2 Orchestrator（增量，不触碰 V1 核心枚举） ===== */

/** 周计划状态（Orchestrator 生成 → 用户确认 → 生产 → 完成） */
export const weeklyPlanStatus = pgEnum("weekly_plan_status", [
  "draft",
  "confirmed",
  "production",
  "completed",
  "cancelled",
]);

/** 周计划项状态：pending（待用户确认选题）→ approved → running → completed/failed；paused=暂缓（不生产） */
export const weeklyPlanItemStatus = pgEnum("weekly_plan_item_status", [
  "pending",
  "approved",
  "rejected",
  "paused",
  "running",
  "completed",
  "failed",
  "skipped",
]);
