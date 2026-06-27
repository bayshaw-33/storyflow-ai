import type { AIMessage, AIProviderResult } from "./types";

type DeepSeekOptions = {
  messages: AIMessage[];
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
  apiKeyOverride?: string;
  modelOverride?: string;
};

export async function callDeepSeek({
  messages,
  temperature = 0.75,
  timeoutMs = 90000,
  maxTokens = 8192,
  apiKeyOverride,
  modelOverride,
}: DeepSeekOptions): Promise<AIProviderResult> {
  const apiKey = apiKeyOverride || process.env.DEEPSEEK_API_KEY;
  const model = modelOverride || process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  if (!apiKey) {
    throw new Error("MISSING_DEEPSEEK_API_KEY");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
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
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("DEEPSEEK_TIMEOUT");
    }

    throw new Error("DEEPSEEK_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`DEEPSEEK_API_ERROR:${response.status}:${detail}`);
  }

  const data = await response.json();
  const output = data.choices?.[0]?.message?.content;

  if (!output) {
    throw new Error("EMPTY_DEEPSEEK_OUTPUT");
  }

  return {
    output: String(output).trim(),
    usage: data.usage || null,
    model,
    provider: "deepseek",
  };
}

async function readErrorDetail(response: Response) {
  try {
    const data = await response.json();
    return data.error?.message || JSON.stringify(data);
  } catch {
    return response.text();
  }
}
