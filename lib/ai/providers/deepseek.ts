import type { AIMessage, AIProviderResult } from "./types";

type DeepSeekOptions = {
  messages: AIMessage[];
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
  apiKeyOverride?: string;
  modelOverride?: string;
};

const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
const FALLBACK_DEEPSEEK_MODEL = "deepseek-v4-pro";
const KNOWN_VALID_DEEPSEEK_MODELS = new Set(["deepseek-v4-pro", "deepseek-v4-flash"]);

export function resolveDeepSeekModel(modelOverride?: string) {
  const rawModel = (modelOverride?.trim() || process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL).trim();
  if (
    !rawModel
    || rawModel.startsWith("sk-")
    || rawModel.length > 60
    || !KNOWN_VALID_DEEPSEEK_MODELS.has(rawModel)
  ) {
    console.warn(`[deepseek] Invalid DEEPSEEK_MODEL; falling back to ${DEFAULT_DEEPSEEK_MODEL}`);
    return DEFAULT_DEEPSEEK_MODEL;
  }
  return rawModel;
}

/**
 * 判断错误是否值得用 fallback 模型重试。
 * 换模型可能解决的错误：
 *   - EMPTY_DEEPSEEK_OUTPUT：flash 返回空内容，pro 可能能生成
 *   - DEEPSEEK_TIMEOUT：flash 超时，pro 可能表现不同
 *   - DEEPSEEK_API_ERROR:5xx：服务端临时错误，重试可能成功
 */
function isFallbackWorthyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  if (message === "EMPTY_DEEPSEEK_OUTPUT") return true;
  if (message === "DEEPSEEK_TIMEOUT") return true;
  if (message.startsWith("DEEPSEEK_API_ERROR:5")) return true;
  return false;
}

export async function callDeepSeek({
  messages,
  temperature = 0.75,
  timeoutMs = 90000,
  maxTokens = 8192,
  apiKeyOverride,
  modelOverride,
}: DeepSeekOptions): Promise<AIProviderResult> {
  const apiKey = apiKeyOverride || process.env.DEEPSEEK_API_KEY;
  // DeepSeek 官方支持的模型名：deepseek-v4-pro 或 deepseek-v4-flash
  // （来源：DeepSeek API 错误信息明确提示）
  // 默认用 deepseek-v4-flash（更快、更经济，适合创作工作台迭代），优先级：
  //   modelOverride（API 调用方传入）> DEEPSEEK_MODEL > 默认值
  // 保护：如果 DEEPSEEK_MODEL 被误填成 API key（以 sk- 开头）或其他无效值，
  // 自动回退到默认模型，避免 400。
  // Model 级 fallback：主模型是 flash 且遇到可重试错误时，自动用 pro 重试一次。
  const model = resolveDeepSeekModel(modelOverride);

  if (!apiKey) {
    throw new Error("MISSING_DEEPSEEK_API_KEY");
  }

  try {
    return await callDeepSeekOnce(model, { messages, temperature, timeoutMs, maxTokens, apiKey });
  } catch (error) {
    if (model === FALLBACK_DEEPSEEK_MODEL || !isFallbackWorthyError(error)) {
      throw error;
    }
    console.warn(`[deepseek] Primary model ${model} failed (${error instanceof Error ? error.message : "unknown"}); falling back to ${FALLBACK_DEEPSEEK_MODEL}`);
    const result = await callDeepSeekOnce(FALLBACK_DEEPSEEK_MODEL, { messages, temperature, timeoutMs, maxTokens, apiKey });
    return { ...result, fallbackUsed: true };
  }
}

async function callDeepSeekOnce(
  model: string,
  {
    messages,
    temperature,
    timeoutMs,
    maxTokens,
    apiKey,
  }: {
    messages: AIMessage[];
    temperature: number;
    timeoutMs: number;
    maxTokens: number;
    apiKey: string;
  },
): Promise<AIProviderResult> {
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
