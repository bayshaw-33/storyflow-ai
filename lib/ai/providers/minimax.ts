import type { AIMessage, AIProviderResult } from "./types";

type MiniMaxOptions = {
  messages: AIMessage[];
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
  apiKeyOverride?: string;
  modelOverride?: string;
  baseUrlOverride?: string;
};

export async function callMiniMax({
  messages,
  temperature = 0.75,
  timeoutMs = 120000,
  maxTokens = 12000,
  apiKeyOverride,
  modelOverride,
  baseUrlOverride,
}: MiniMaxOptions): Promise<AIProviderResult> {
  const apiKey = apiKeyOverride || getMiniMaxApiKey();
  const model = modelOverride || process.env.MINIMAX_MODEL || "MiniMax-M3";
  const hasMultimodalInput = messages.some((message) => Array.isArray(message.content));
  const baseUrl = baseUrlOverride || process.env.MINIMAX_API_BASE_URL || (isTokenPlanKey(apiKey) && hasMultimodalInput ? "https://api.minimaxi.com/v1/text/chatcompletion_v2" : isTokenPlanKey(apiKey) ? "https://api.minimaxi.com/v1/chat/completions" : "https://api.minimax.io/v1/chat/completions");

  if (!apiKey) {
    throw new Error("MISSING_MINIMAX_API_KEY");
  }

  if (isTokenPlanKey(apiKey) && !hasMultimodalInput && !baseUrlOverride && !process.env.MINIMAX_API_BASE_URL) {
    return callMiniMaxAnthropic({
      apiKey,
      model,
      messages,
      temperature,
      timeoutMs,
      maxTokens,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_completion_tokens: maxTokens,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("MINIMAX_TIMEOUT");
    }

    throw new Error("MINIMAX_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`MINIMAX_API_ERROR:${response.status}:${detail}`);
  }

  const data = await response.json();
  const output = data.choices?.[0]?.message?.content;

  if (!output) {
    throw new Error("EMPTY_MINIMAX_OUTPUT");
  }

  return {
    output: stripThinking(String(output)).trim(),
    usage: data.usage || null,
    model,
    provider: "minimax",
  };
}

async function callMiniMaxAnthropic({
  apiKey,
  model,
  messages,
  temperature,
  timeoutMs,
  maxTokens,
}: MiniMaxOptions & { apiKey: string; model: string }): Promise<AIProviderResult> {
  const baseUrl = process.env.MINIMAX_ANTHROPIC_API_BASE_URL || "https://api.minimaxi.com/anthropic/v1/messages";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => typeof message.content === "string" ? message.content : message.content.map((part) => part.type === "text" ? part.text : "").join("\n"))
    .join("\n\n");
  const chatMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));
  let response: Response;

  try {
    response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        system,
        messages: chatMessages,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("MINIMAX_TIMEOUT");
    }

    throw new Error("MINIMAX_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`MINIMAX_API_ERROR:${response.status}:${detail}`);
  }

  const data = await response.json();
  const output = Array.isArray(data.content)
    ? data.content.map((item: { text?: string }) => item.text || "").join("")
    : data.choices?.[0]?.message?.content;

  if (!output) {
    throw new Error("EMPTY_MINIMAX_OUTPUT");
  }

  return {
    output: stripThinking(String(output)).trim(),
    usage: data.usage || null,
    model,
    provider: "minimax",
  };
}

export async function generateMiniMaxImage(prompt: string): Promise<AIProviderResult & { imageUrl: string }> {
  const apiKey = getMiniMaxApiKey();
  const model = process.env.MINIMAX_IMAGE_MODEL || "image-01";
  const baseUrl = process.env.MINIMAX_IMAGE_API_BASE_URL || (isTokenPlanKey(apiKey) ? "https://api.minimaxi.com/v1/image_generation" : "https://api.minimax.io/v1/image_generation");

  if (!apiKey) {
    throw new Error("MISSING_MINIMAX_API_KEY");
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      aspect_ratio: "16:9",
      response_format: "url",
      n: 1,
    }),
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`MINIMAX_IMAGE_API_ERROR:${response.status}:${detail}`);
  }

  const data = await response.json();
  const imageUrl = extractImageUrl(data);

  if (!imageUrl) {
    throw new Error("EMPTY_MINIMAX_IMAGE_OUTPUT");
  }

  return {
    output: imageUrl,
    imageUrl,
    usage: data.usage || null,
    model,
    provider: "minimax",
  };
}

function extractImageUrl(data: unknown): string {
  if (typeof data === "string") {
    if (/^https?:\/\//i.test(data) || /^data:image\//i.test(data)) return data;
    return "";
  }

  if (!data || typeof data !== "object") return "";

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = extractImageUrl(item);
      if (found) return found;
    }
    return "";
  }

  const record = data as Record<string, unknown>;
  const preferredKeys = [
    "image_url",
    "imageUrl",
    "url",
    "download_url",
    "downloadUrl",
    "presigned_url",
    "presignedUrl",
    "base64",
    "image_base64",
    "imageBase64",
  ];

  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string") {
      if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value;
      if (key.toLowerCase().includes("base64") && value.length > 100) return `data:image/png;base64,${value}`;
    }
  }

  for (const value of Object.values(record)) {
    const found = extractImageUrl(value);
    if (found) return found;
  }

  return "";
}

function stripThinking(output: string) {
  return output.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export function getMiniMaxApiKey() {
  return (
    process.env.MINIMAX_API_KEY ||
    process.env.MINIMAX_TOKEN ||
    process.env.MINIMAX_APIKEY ||
    process.env.MINIMAX_API_SECRET ||
    process.env.MINIMAX_SUBSCRIPTION_KEY ||
    ""
  ).trim();
}

function isTokenPlanKey(apiKey: string) {
  return apiKey.startsWith("sk-cp-");
}

async function readErrorDetail(response: Response) {
  try {
    const data = await response.json();
    return data.error?.message || data.message || JSON.stringify(data);
  } catch {
    return response.text();
  }
}
