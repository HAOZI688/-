/**
 * AI Provider 抽象层。
 * 支持 Anthropic / OpenAI / DeepSeek（兼容 OpenAI 协议）三类接口，按环境变量选择。
 * 未配置任何 API Key 时返回 null，由 workflow engine 走「演示模式」（模拟执行，不调模型）。
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ProviderName = "anthropic" | "openai" | "deepseek";

export function detectProvider(): ProviderName | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.DEEPSEEK_API_KEY) return "deepseek";
  return null;
}

export async function chat(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number },
): Promise<{ text: string; provider: ProviderName; model: string }> {
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
    return { text: data.content?.[0]?.text ?? "", provider, model: "claude-sonnet-5" };
  }

  // OpenAI / DeepSeek 共用 /chat/completions 协议
  const isDeep = provider === "deepseek";
  const res = await fetch(isDeep ? "https://api.deepseek.com/chat/completions" : "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${isDeep ? process.env.DEEPSEEK_API_KEY! : process.env.OPENAI_API_KEY!}`,
    },
    body: JSON.stringify({
      model: isDeep ? (process.env.DEEPSEEK_MODEL ?? "deepseek-chat") : (process.env.OPENAI_MODEL ?? "gpt-4o"),
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "", provider, model: data.model ?? "" };
}

/** 幂等判断：模型是否已配置（供 UI 显示与 engine 决策） */
export function isAiConfigured() {
  return detectProvider() !== null;
}
