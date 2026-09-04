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

  // 2) Derived Topics（血缘：derived → parent = run.topicId）
  for (const dt of parsed.derivedTopics ?? []) {
    if (!dt?.title) continue;
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
    await topicRepository.addRelation(runMeta.topicId!, topic.id, "derived");
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
  for (const ca of parsed.contentAssets ?? []) {
    if (!ca?.title || !runMeta.topicId) continue;
    await contentRepository.createAsset({
      topicId: runMeta.topicId,
      assetType: ca.assetType as never,
      platform: ca.platform as never,
      title: ca.title.slice(0, 300),
      content: ca.content ?? null,
      contentRole: ca.contentRole as never,
      cta: ca.cta ?? null,
      status: "in_review",
    });
    result.contentAssets += 1;
  }

  await auditRepository.log({
    action: "content_update",
    entityType: "workflow_run",
    entityId: runId,
    before: null,
    after: { derivedTopics: result.derivedTopics, contentAssets: result.contentAssets },
    notes: `Writeback：${result.derivedTopics} 衍生 Topic / ${result.contentAssets} 内容资产（进待审核）`,
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
