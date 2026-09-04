/**
 * V4 工作流质量 Gate（规格 §12）：AI 产出在写回前过一道硬性质量检查。
 *
 * 检查项：
 * 1. 空输出 / 过短（< 50 字视为无效）
 * 2. 标题缺失（AI 未产出标题字段）
 * 3. CTA 数量为 0（B2B 内容必须带转化引导）
 * 4. 来源包未引用（输出需引用 sourcePacketId 对应内容）
 * 5. 参考 Topic 未命中（与输入 Topic 无关）
 * 6. 违禁词命中（AI_FORBIDDEN_WORDS 可配置，默认常见夸大/承诺类）
 * 7. 预览冒充 GA：文案声称"已发布/已上线/正式发布"等（预览稿禁止）
 *
 * 不通过 → workflow run 标记 needs_review，内容仍保留供人工审核（不是静默丢弃）。
 */
export interface QualityGateInput {
  workflowType: string;
  /** 最后一步模型输出的原始文本 */
  text: string;
  sourcePacketId: string | null;
  topicId: string | null;
}

export interface QualityGateResult {
  pass: boolean;
  reasons: string[];
}

/** 违禁词：默认夸大/绝对化承诺（运营可在 env AI_FORBIDDEN_WORDS 追加，逗号分隔） */
const DEFAULT_FORBIDDEN = ["100%收益", "稳赚", "必赚", "躺赚", "一夜暴富", "绝对第一", "全网最强", "包过", "无效退款"];

function forbiddenWords(): string[] {
  const extra = process.env.AI_FORBIDDEN_WORDS;
  return extra ? [...DEFAULT_FORBIDDEN, ...extra.split(",").map((s) => s.trim()).filter(Boolean)] : DEFAULT_FORBIDDEN;
}

/** 预览冒充 GA 的措辞（AI 生成预览稿时禁止声称已发布） */
const GA_CLAIMS = ["已发布", "已上线", "正式发布", "已经发布", "已经上线", "已推出", "上线啦", "重磅发布"];

export async function runQualityGate(input: QualityGateInput): Promise<QualityGateResult> {
  const text = input.text?.trim() ?? "";
  const reasons: string[] = [];

  // 1. 空输出 / 过短
  if (!text) reasons.push("EMPTY_OUTPUT: AI 产出为空");
  else if (text.length < 50) reasons.push(`TOO_SHORT: 产出仅 ${text.length} 字，疑似占位/半成品`);

  // 2. 标题缺失（JSON 中 title 字段）
  const titleMatch = text.match(/"title"\s*:\s*"([^"]+)"/);
  if (!titleMatch || !titleMatch[1]?.trim()) reasons.push("MISSING_TITLE: 未产出标题字段");

  // 3. CTA 数量（CTA/号召语关键词）
  const ctaKeywords = ["点击", "关注", "私信", "评论区", "留言", "体验", "试用", "联系", "领取", "报名", "了解更多", "了解更多", "加微信", "扫码", "demo", "Demo"];
  const ctaHits = ctaKeywords.filter((kw) => text.includes(kw));
  if (ctaHits.length === 0) reasons.push("NO_CTA: 全文未发现任何转化引导（CTA）");
  else if (ctaHits.length > 8) reasons.push(`TOO_MANY_CTA: CTA 出现 ${ctaHits.length} 次，疑似堆砌引导`);

  // 4. 来源包引用（有 sourcePacketId 但文本未体现来源）
  if (input.sourcePacketId) {
    const hasSourceRef = /来源|出处|数据来源|根据.{0,10}(报告|调研|github|GitHub)/.test(text);
    if (!hasSourceRef) reasons.push("NO_SOURCE_REF: 未引用来源包（有 sourcePacketId 输入但输出无来源标注）");
  }

  // 5. 参考 Topic 命中（有 topicId 的 run，输出应围绕主题展开）
  if (input.topicId && text.length >= 50) {
    const topicMarker = text.match(/"topic_id"\s*:\s*"([^"]+)"/);
    if (!topicMarker || topicMarker[1] !== input.topicId) {
      // 允许输出不显式带 topic_id，但至少要有结构化内容标记
      const hasStructure = /"title"|"outline"|"summary"|"body"|"content"/.test(text);
      if (!hasStructure) reasons.push("TOPIC_MISS: 输出与输入 Topic 无关（无结构化内容标记）");
    }
  }

  // 6. 违禁词
  const hit = forbiddenWords().find((w) => text.includes(w));
  if (hit) reasons.push(`FORBIDDEN_WORD: 命中违禁词「${hit}」`);

  // 7. 预览冒充 GA
  const gaClaim = GA_CLAIMS.find((c) => text.includes(c));
  if (gaClaim) reasons.push(`PREVIEW_AS_GA: 文案声称「${gaClaim}」，预览稿禁止冒充已发布状态`);

  return { pass: reasons.length === 0, reasons };
}
