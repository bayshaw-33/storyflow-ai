import type { AIMessage, AIProviderResult } from "./types";

type MiniMaxOptions = {
  messages: AIMessage[];
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
};

export async function callMiniMax({
  messages,
  temperature = 0.75,
  timeoutMs = 120000,
  maxTokens = 12000,
}: MiniMaxOptions): Promise<AIProviderResult> {
  const apiKey = process.env.MINIMAX_API_KEY || process.env.MINIMAX_SUBSCRIPTION_KEY;
  const model = process.env.MINIMAX_MODEL || "MiniMax-M3";
  const baseUrl = process.env.MINIMAX_API_BASE_URL || "https://api.minimax.io/v1/chat/completions";

  if (!apiKey) {
    throw new Error("MISSING_MINIMAX_API_KEY");
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

export async function generateMiniMaxImage(prompt: string): Promise<AIProviderResult & { imageUrl: string }> {
  const apiKey = process.env.MINIMAX_API_KEY || process.env.MINIMAX_SUBSCRIPTION_KEY;
  const model = process.env.MINIMAX_IMAGE_MODEL || "image-01";
  const baseUrl = process.env.MINIMAX_IMAGE_API_BASE_URL || "https://api.minimax.io/v1/image_generation";

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
  const imageUrl = data.data?.image_urls?.[0] || data.data?.image_url || data.data?.images?.[0]?.url;

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

function stripThinking(output: string) {
  return output.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

async function readErrorDetail(response: Response) {
  try {
    const data = await response.json();
    return data.error?.message || data.message || JSON.stringify(data);
  } catch {
    return response.text();
  }
}
