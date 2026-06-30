import type { AIMessage, AIProviderResult } from "./types";

type CustomProviderOptions = {
  messages: AIMessage[];
  apiKey: string;
  baseUrl: string;
  model: string;
  providerName?: string;
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
};

export async function callCustomProvider({
  messages,
  apiKey,
  baseUrl,
  model,
  providerName,
  temperature = 0.75,
  timeoutMs = 90000,
  maxTokens = 8192,
}: CustomProviderOptions): Promise<AIProviderResult> {
  if (!apiKey) throw new Error("MISSING_CUSTOM_API_KEY");
  if (!baseUrl) throw new Error("MISSING_CUSTOM_BASE_URL");
  if (!model) throw new Error("MISSING_CUSTOM_MODEL");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(normalizeChatCompletionsUrl(baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("CUSTOM_PROVIDER_TIMEOUT");
    throw new Error("CUSTOM_PROVIDER_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`CUSTOM_PROVIDER_API_ERROR:${response.status}:${detail}`);
  }

  const data = await response.json();
  const output = data.choices?.[0]?.message?.content || data.output_text || data.text;
  if (!output) throw new Error("EMPTY_CUSTOM_PROVIDER_OUTPUT");

  return {
    output: String(output).trim(),
    usage: data.usage || null,
    model,
    provider: "custom",
  };
}

function normalizeChatCompletionsUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

async function readErrorDetail(response: Response) {
  try {
    const data = await response.json();
    return data.error?.message || JSON.stringify(data);
  } catch {
    return response.text();
  }
}
