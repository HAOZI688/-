/**
 * AI Provider 抽象层。
 * 支持 Anthropic / OpenAI / DeepSeek / OpenAI 兼容中转（CONTENT_API_*，.env.example 已预留）四类接口。
 * 未配置任何 API Key 时返回 null，由 workflow engine 走「演示模式」（模拟执行，不调模型）。
 * 真实调用返回 usage（token 数），供 ai_usage_logs 记录成本。
 *
 * V4 生产化（规格 §9/§10）：
 * - 超时：AI_TIMEOUT_MS（默认 90s，AbortSignal 中断）
 * - 重试：AI_MAX_RETRY（默认 2）+ AI_RETRY_DELAY_MS（默认 2000ms，指数退避）
 * - Fallback：按优先级遍历已配置 Provider（anthropic → content_api → openai → deepseek）
 * - 状态留痕：primary_success / fallback_success / failed（全失败由 engine 转 needs_manual）
 * - 成本估算：按 token 计价（AI_PRICES 可覆盖，默认表见 MODEL_PRICES）
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ProviderName = "anthropic" | "openai" | "deepseek" | "content_api";

export interface ChatResult {
  text: string;
  provider: ProviderName;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/** V4：带韧性信息的调用结果（fallback/重试/成本留痕用） */
export interface ResilientChatResult extends ChatResult {
  providerStatus: "primary_success" | "fallback_success";
  retryCount: number;
  latencyMs: number;
  /** 估算成本 USD */
  costUsd: number;
}

export const AI_RESILIENCE_DEFAULTS = {
  timeoutMs: 90_000,
  maxRetry: 2,
  retryDelayMs: 2_000,
};

/** 默认价格（每 1M tokens USD）；可用 AI_PRICES='claude-sonnet-5:3/15,gpt-4o:2.5/10' 覆盖 */
const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-sonnet-4": { in: 3, out: 15 },
  "claude-opus-5": { in: 5, out: 25 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "deepseek-chat": { in: 0.27, out: 1.1 },
  "deepseek-reasoner": { in: 0.55, out: 2.19 },
  "glm-5.3-flash": { in: 0.5, out: 1.5 },
};
const DEFAULT_PRICE = { in: 1, out: 2 };

function parsePrices(): Record<string, { in: number; out: number }> {
  const raw = process.env.AI_PRICES;
  if (!raw) return MODEL_PRICES;
  const out: Record<string, { in: number; out: number }> = {};
  for (const part of raw.split(",")) {
    const [model, price] = part.split(":");
    if (!model || !price) continue;
    const [i, o] = price.split("/").map(Number);
    if (Number.isFinite(i) && Number.isFinite(o)) out[model.trim()] = { in: i, out: o };
  }
  return Object.keys(out).length ? out : MODEL_PRICES;
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const prices = parsePrices();
  const p = prices[model] ?? DEFAULT_PRICE;
  return (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out;
}

export function detectProvider(): ProviderName | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.CONTENT_API_BASE_URL && process.env.CONTENT_API_KEY) return "content_api";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  return null;
}

/** 已配置的 Provider 链（按 fallback 优先级排序） */
export function configuredProviders(): ProviderName[] {
  const order: ProviderName[] = ["anthropic", "content_api", "openai", "deepseek"];
  return order.filter((p) => {
    switch (p) {
      case "anthropic":
        return Boolean(process.env.ANTHROPIC_API_KEY);
      case "content_api":
        return Boolean(process.env.CONTENT_API_BASE_URL && process.env.CONTENT_API_KEY);
      case "openai":
        return Boolean(process.env.OPENAI_API_KEY);
      case "deepseek":
        return Boolean(process.env.DEEPSEEK_API_KEY);
      default:
        return false;
    }
  });
}

/** 单 Provider 单次调用（带超时） */
async function chatOnce(provider: ProviderName, messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number }, timeoutMs: number): Promise<ChatResult> {
  const temperature = opts.temperature ?? 0.7;
  const maxTokens = opts.maxTokens ?? 2000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
          max_tokens: maxTokens,
          temperature,
          messages: messages.map((m) => ({ role: m.role === "system" ? "assistant" : m.role, content: m.content })),
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return {
        text: data.content?.[0]?.text ?? "",
        provider,
        model: data.model ?? "claude-sonnet-5",
        usage: data.usage
          ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0 }
          : undefined,
      };
    }

    // OpenAI 兼容协议：openai / deepseek / content_api 共用 /chat/completions
    const apiKey =
      provider === "openai" ? process.env.OPENAI_API_KEY! : provider === "deepseek" ? process.env.DEEPSEEK_API_KEY! : process.env.CONTENT_API_KEY!;
    const model =
      provider === "openai"
        ? (process.env.OPENAI_MODEL ?? "gpt-4o")
        : provider === "deepseek"
          ? (process.env.DEEPSEEK_MODEL ?? "deepseek-chat")
          : (process.env.CONTENT_MODEL ?? "gpt-4o-mini");
    const url =
      provider === "content_api"
        ? `${(process.env.CONTENT_API_BASE_URL ?? "").replace(/\/$/, "")}/chat/completions`
        : provider === "deepseek"
          ? "https://api.deepseek.com/chat/completions"
          : "https://api.openai.com/v1/chat/completions";

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${provider} ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      provider,
      model: data.model ?? model,
      usage: data.usage
        ? { inputTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0 }
        : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * V4：带韧性调用（超时 → 重试 → Provider Fallback）。
 * 全链失败抛 AiResilienceError（engine 据此标记 needs_manual，不再直接 failed）。
 */
export class AiResilienceError extends Error {
  readonly providerStatus: "failed";
  readonly attempts: { provider: ProviderName; retries: number; error: string }[];
  constructor(attempts: { provider: ProviderName; retries: number; error: string }[]) {
    super(`AI 调用全部失败（${attempts.length} 个 Provider）：${attempts.map((a) => `${a.provider}×${a.retries + 1}(${a.error.slice(0, 80)})`).join("; ")}`);
    this.name = "AiResilienceError";
    this.providerStatus = "failed";
    this.attempts = attempts;
  }
}

export async function chatResilient(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; timeoutMs?: number; maxRetry?: number; retryDelayMs?: number },
): Promise<ResilientChatResult> {
  const providers = configuredProviders();
  if (!providers.length) throw new Error("AI_PROVIDER_NOT_CONFIGURED");

  const timeoutMs = opts?.timeoutMs ?? Number(process.env.AI_TIMEOUT_MS ?? AI_RESILIENCE_DEFAULTS.timeoutMs);
  const maxRetry = opts?.maxRetry ?? Number(process.env.AI_MAX_RETRY ?? AI_RESILIENCE_DEFAULTS.maxRetry);
  const retryDelayMs = opts?.retryDelayMs ?? Number(process.env.AI_RETRY_DELAY_MS ?? AI_RESILIENCE_DEFAULTS.retryDelayMs);

  const attempts: { provider: ProviderName; retries: number; error: string }[] = [];
  const startedAt = Date.now();

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    let lastError = "";
    for (let retry = 0; retry <= maxRetry; retry++) {
      try {
        const res = await chatOnce(provider, messages, { temperature: opts?.temperature, maxTokens: opts?.maxTokens }, timeoutMs);
        return {
          ...res,
          providerStatus: i === 0 ? "primary_success" : "fallback_success",
          retryCount: retry,
          latencyMs: Date.now() - startedAt,
          costUsd: res.usage
            ? estimateCost(res.model, res.usage.inputTokens, res.usage.outputTokens)
            : 0,
        };
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        if (retry < maxRetry) {
          await new Promise((r) => setTimeout(r, retryDelayMs * Math.pow(2, retry)));
        }
      }
    }
    attempts.push({ provider, retries: maxRetry, error: lastError });
  }

  throw new AiResilienceError(attempts);
}

/** 幂等判断：模型是否已配置（供 UI 显示与 engine 决策） */
export function isAiConfigured() {
  return detectProvider() !== null;
}
