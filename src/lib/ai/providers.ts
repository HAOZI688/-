/**
 * AI Provider 抽象层。
 * 支持 Anthropic / OpenAI / DeepSeek / OpenAI 兼容中转（CONTENT_API_*，.env.example 已预留）四类接口。
 * 未配置任何 API Key 时返回 null，由 workflow engine 走「演示模式」（模拟执行，不调模型）。
 * 真实调用返回 usage（token 数），供 ai_usage_logs 记录成本。
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

export function detectProvider(): ProviderName | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.CONTENT_API_BASE_URL && process.env.CONTENT_API_KEY) return "content_api";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  return null;
}

export async function chat(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number },
): Promise<ChatResult> {
  const provider = detectProvider();
  if (!provider) throw new Error("AI_PROVIDER_NOT_CONFIGURED");

  const temperature = opts?.temperature ?? 0.7;
  const maxTokens = opts?.maxTokens ?? 2000;

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
}

/** 幂等判断：模型是否已配置（供 UI 显示与 engine 决策） */
export function isAiConfigured() {
  return detectProvider() !== null;
}
