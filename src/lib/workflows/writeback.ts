import {
  contentRepository,
  topicRepository,
  workflowRepository,
  auditRepository,
} from "@/lib/repositories";
import type { WorkflowType } from "@/lib/workflows/engine";

/**
 * Workflow Writeback（V2 P0）：把一次 run 的真实模型输出写回 V1 数据结构：
 * Output → Derived Topic → Content Asset（status=in_review，进入 Human Gate 待审核）。
 * 纯文本/非 JSON 输出只记录 workflow_outputs，不强行造结构。
 */

export interface DerivedTopicSpec {
  title: string;
  description?: string;
  /** 数字字符串/数字均可；writeback 内部归一 */
  b2bRelevance?: number;
  trafficPotential?: number;
  conversionPotential?: number;
  timeliness?: number;
  contentValue?: number;
  tags?: string[];
}

export interface ContentAssetSpec {
  assetType: string;
  platform?: string;
  title: string;
  content?: string;
  contentRole?: string;
  cta?: string;
}

export interface WritebackResult {
  runId: string;
  outputs: number;
  derivedTopics: number;
  contentAssets: number;
  /** B-4：业务质量 Gate 结果（不过 → run 转 needs_review） */
  businessGate?: BusinessGateResult;
}

/** 从模型文本中提取第一个 JSON 块（```json 块优先，其次裸 {..} / [..]） */
export function extractJson(text: string): unknown | null {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  for (const jsonLike of [candidate, text]) {
    try {
      return JSON.parse(jsonLike);
    } catch {
      /* 尝试下一个候选 */
    }
  }
  // 兜底：从第一个 { 或 [ 截取
  const start = text.search(/[\[{]/);
  if (start < 0) return null;
  for (const end of [text.length - 1, text.lastIndexOf("}"), text.lastIndexOf("]")]) {
    if (end <= start) continue;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      /* continue */
    }
  }
  return null;
}

/** 数值归一：null/undefined → undefined，数字原样，字符串转数字 */
function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

/** B-4 §10-§16：业务质量 Gate（writeback 解析后按工作流业务规则校验） */
export interface BusinessGateResult {
  pass: boolean;
  reasons: string[];
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[\s\p{P}]+/gu, "");
}

async function dedupCheck(title: string): Promise<{ decision: "new" | "reuse" | "derive"; matchedTopicIds: string[] }> {
  const { topicRepository } = await import("@/lib/repositories");
  const all = await topicRepository.list();
  const norm = normalizeTitle(title);
  const matched: string[] = [];
  for (const t of all) {
    const nt = normalizeTitle(t.title);
    if (!nt) continue;
    // 相似判定：互相包含或编辑距离近似（≥8 字时前 12 字符一致也算）
    if (norm.includes(nt) || nt.includes(norm) || (norm.length >= 8 && nt.length >= 8 && (norm.slice(0, 12) === nt.slice(0, 12)))) {
      matched.push(t.id);
    }
  }
  if (matched.length === 0) return { decision: "new", matchedTopicIds: [] };
  // 已有高度相近 Topic → derive（衍生）而不是新建重复
  return { decision: matched.length ? "derive" : "new", matchedTopicIds: matched };
}

export async function runBusinessGate(
  workflowType: string,
  parsed: { derivedTopics?: { title: string; description?: string }[]; contentAssets?: { title: string; content?: string; cta?: string; knowledgeStatus?: string; concept?: string }[] },
): Promise<BusinessGateResult> {
  const reasons: string[] = [];

  if (workflowType === "ai_weekly") {
    // §11：5–8 个事件、每条绑来源、正文长度
    const events = parsed.derivedTopics ?? [];
    if (events.length < 5) reasons.push(`AI_WEEKLY_TOO_FEW_EVENTS: 事件数 ${events.length} < 5（统计周期内真实事件不足，需补来源或人工确认）`);
    if (events.length > 8) reasons.push(`AI_WEEKLY_TOO_MANY_EVENTS: 事件数 ${events.length} > 8`);
    for (const e of events) {
      if (!e.description || e.description.length < 20) reasons.push(`AI_WEEKLY_EVENT_NO_SOURCE: 事件「${e.title?.slice(0, 24)}」缺来源描述（core_fact + source）`);
    }
  }

  if (workflowType === "evergreen") {
    // §15：概念定义深度 + 知识状态匹配
    const asset = parsed.contentAssets?.[0];
    const concept = (parsed as { concept?: string }).concept ?? "";
    if (asset) {
      if ((asset.content ?? "").length < 400) reasons.push(`EVERGREEN_SHALLOW: 内容 ${String((asset.content ?? "").length)} 字，未达到深度讲解（≥400 字）`);
      if (!asset.cta) reasons.push("EVERGREEN_NO_CTA: 缺转化引导（CTA）");
    }
    const ks = (parsed as { knowledgeStatus?: string }).knowledgeStatus;
    if (ks === "deep_explanation" && concept.length < 100) {
      reasons.push(`EVERGREEN_STATUS_INFLATED: 标记 deep_explanation 但概念拆解仅 ${concept.length} 字`);
    }
  }

  if (workflowType === "wechat_deep_dive") {
    // §16：正文长度、单 CTA、结构
    const asset = parsed.contentAssets?.[0];
    if (asset) {
      const len = (asset.content ?? "").length;
      if (len < 1500) reasons.push(`WECHAT_TOO_SHORT: 正文 ${len} 字 < 1500（深度文要求完整结构）`);
      const ctaCount = (asset.cta ?? "").trim() ? 1 : 0;
      const extraCta = (asset.content ?? "").match(/(扫码|加微信|私信|领取资料)/g)?.length ?? 0;
      if (ctaCount === 0 && extraCta === 0) reasons.push("WECHAT_NO_CTA: 全文缺主 CTA");
      if (extraCta > 2) reasons.push(`WECHAT_TOO_MANY_CTA: 正文出现 ${extraCta} 处强引导，要求全文只保留一个主要 CTA`);
      if (!/[\n#]/.test(asset.content ?? "") && len > 500) reasons.push("WECHAT_NO_STRUCTURE: 正文无章节结构（缺换行/标题）");
    } else {
      reasons.push("WECHAT_NO_ASSET: 未产出内容资产");
    }
  }

  if (workflowType === "github_weekly") {
    // §4：derived Topics 必须来自真实核验仓库（writeback 上游已核验，这里防模型自造）
    for (const t of parsed.derivedTopics ?? []) {
      if (/agent-tools|deepsearcher\/deep|localrag\/local|mcpgo|skillhub|tinyagent|workflowai\/workflow/i.test(t.title ?? "")) {
        reasons.push(`GITHUB_FABRICATED_REPO: 衍生 Topic 引用了未通过 GitHub 核验的仓库「${(t.title ?? "").slice(0, 30)}」`);
      }
    }
  }

  return { pass: reasons.length === 0, reasons };
}

/**
 * 写回一次 run 的模型输出。
 * 约定各工作流最终步骤输出如下 JSON（与 ai-prompts/<type>/main.md 的「输出约定」一致）：
 * {
 *   derivedTopics?: [{ title, description?, b2bRelevance?, ... , tags? }],
 *   contentAssets?: [{ assetType, platform?, title, content?, contentRole?, cta? }],
 *   outputs?: [{ outputType, label?, content? }]
 * }
 */
export async function writeBackRunOutputs(
  runId: string,
  runMeta: { workflowType: WorkflowType; topicId?: string | null; demo: boolean },
): Promise<WritebackResult> {
  const result: WritebackResult = { runId, outputs: 0, derivedTopics: 0, contentAssets: 0 };
  if (runMeta.demo) return result; // 演示模式不伪造结构数据

  const tasks = await workflowRepository.getRunTasks(runId);
  const lastOutput = tasks[tasks.length - 1]?.output as { text?: string } | undefined;
  const raw = lastOutput?.text ?? "";
  const parsed = extractJson(raw) as
    | { derivedTopics?: DerivedTopicSpec[]; contentAssets?: ContentAssetSpec[]; outputs?: { outputType: string; label?: string; content?: string }[] }
    | null;

  if (!parsed) {
    // 非 JSON：原文进 workflow_outputs，可追溯但不造结构
    if (raw) {
      await workflowRepository.createOutput(runId, {
        outputType: `${runMeta.workflowType}_result`,
        label: "工作流原始输出",
        content: raw.slice(0, 20000),
      });
      result.outputs += 1;
    }
    return result;
  }

  // 1) Outputs（独立记录）
  for (const o of parsed.outputs ?? []) {
    if (!o?.outputType) continue;
    await workflowRepository.createOutput(runId, {
      outputType: o.outputType,
      label: o.label ?? null,
      content: (o.content ?? "").slice(0, 20000),
    });
    result.outputs += 1;
  }

  // 2) Derived Topics（血缘：derived → parent = run.topicId；B-4 §8：创建前历史查重）
  for (const dt of parsed.derivedTopics ?? []) {
    if (!dt?.title) continue;
    const dedup = await dedupCheck(dt.title);
    if (dedup.decision === "derive" && dedup.matchedTopicIds.length > 0) {
      // 高度相近 Topic 已存在 → 记录 dedup 决策并关联，不新建重复 Topic
      await workflowRepository.createOutput(runId, {
        outputType: "dedup_decision",
        label: `查重：与已有 Topic 相似（${dedup.matchedTopicIds.length} 条）`,
        content: JSON.stringify({ title: dt.title, decision: dedup.decision, matchedTopicIds: dedup.matchedTopicIds }),
      });
      result.outputs += 1;
      continue;
    }
    const topic = await topicRepository.create({
      topicId: await nextTopicId(runMeta.topicId ?? "000"),
      title: dt.title.slice(0, 300),
      description: dt.description ?? null,
      parentTopicId: runMeta.topicId ?? null,
      topicType: runMeta.workflowType === "github_weekly" ? "technical_project" : "trend",
      trendTags: dt.tags ?? [],
      b2bRelevance: num(dt.b2bRelevance) ?? null,
      trafficPotential: num(dt.trafficPotential) ?? null,
      conversionPotential: num(dt.conversionPotential) ?? null,
      timeliness: num(dt.timeliness) ?? null,
      contentValue: num(dt.contentValue) ?? null,
      status: "ready_for_production",
      priority: "P3",
    });
    // B-3：无 parent topic（如 ai_weekly 全局 run）时不建 relation（topics 表关系可后补），Topic 本身保留
    if (runMeta.topicId) {
      await topicRepository.addRelation(runMeta.topicId, topic.id, "derived");
    }
    await auditRepository.log({
      action: "topic_create",
      entityType: "topic",
      entityId: topic.id,
      before: null,
      after: { topicId: topic.topicId, parentTopicId: runMeta.topicId, workflowType: runMeta.workflowType },
      notes: `工作流 ${runMeta.workflowType} 写回衍生 Topic：${topic.title}`,
      actor: `ai:${runId}`,
    });
    result.derivedTopics += 1;
  }

  // 3) Content Assets（status=in_review → Human Gate 待审核）
  const DEFAULT_ASSET_TYPE: Record<string, string> = {
    ai_weekly: "ai_weekly_script",
    github_weekly: "github_card",
    evergreen: "wechat_article",
    wechat_deep_dive: "wechat_article",
  };
  for (const ca of parsed.contentAssets ?? []) {
    if (!ca?.title || !runMeta.topicId) continue;
    await contentRepository.createAsset({
      topicId: runMeta.topicId,
      // 模可能不输出 assetType（或输出自己的 topicId 字段）——按 workflowType 推断，忽略模型自带的 topicId
      assetType: (ca.assetType ?? DEFAULT_ASSET_TYPE[runMeta.workflowType] ?? "wechat_article") as never,
      platform: ca.platform as never,
      title: ca.title.slice(0, 300),
      content: ca.content ?? null,
      contentRole: ca.contentRole as never,
      cta: ca.cta ?? null,
      status: "in_review",
    });
    result.contentAssets += 1;
  }
  // B-4：业务质量 Gate（§10-§16）——不过则写回 gate 结果，由 engine 转 needs_review
  const businessGate = await runBusinessGate(runMeta.workflowType, parsed as never);
  result.businessGate = businessGate;

  // V4：内容验收统计——记录 AI 生成资产数（approved/rejected 由审核动作记录）
  if (result.contentAssets > 0) {
    const { acceptanceStatsService } = await import("@/lib/services/acceptance-stats");
    await acceptanceStatsService.recordGenerated(runMeta.workflowType, result.contentAssets);
  }

  if (!businessGate.pass) {
    await workflowRepository.createOutput(runId, {
      outputType: "business_gate_fail",
      label: "业务质量 Gate 未通过",
      content: JSON.stringify({ workflowType: runMeta.workflowType, reasons: businessGate.reasons }),
    });
    result.outputs += 1;
  }
  await auditRepository.log({
    action: "content_update",
    entityType: "workflow_run",
    entityId: runId,
    before: null,
    after: { derivedTopics: result.derivedTopics, contentAssets: result.contentAssets, businessGate: businessGate.reasons },
    notes: `Writeback：${result.derivedTopics} 衍生 Topic / ${result.contentAssets} 内容资产${businessGate.pass ? "" : `（业务 Gate 拦截：${businessGate.reasons.length} 项）`}`,
    actor: `ai:${runId}`,
  });
  return result;
}

/** 生成下一个业务 Topic ID（2026W37-001），取当前最大序号 +1 */
async function nextTopicId(parentSeed: string): Promise<string> {
  const all = await topicRepository.list();
  const maxSeq = all.reduce((max, t) => {
    const m = /(\d+)$/.exec(t.topicId);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  const week = parentSeed.split("-")[0] ?? "2026";
  return `${week}-${String(maxSeq + 1).padStart(3, "0")}`;
}
