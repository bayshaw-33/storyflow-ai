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
  // DeepSeek 官方支持的模型名：deepseek-v4-pro 或 deepseek-v4-flash
  // （来源：DeepSeek API 错误信息明确提示）
  // 默认用 deepseek-v4-flash（快速），优先级：
  //   modelOverride（API 调用方传入）> DEEPSEEK_MODEL > 默认值
  // 保护：如果 DEEPSEEK_MODEL 被误填成 API key（以 sk- 开头）或其他无效值，
  // 自动回退到默认模型，避免 400。
  const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";
  const KNOWN_VALID_DEEPSEEK_MODELS = new Set(["deepseek-v4-pro", "deepseek-v4-flash"]);
  let rawModel = (modelOverride?.trim() || process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL).trim();
  // 兜底：model 看起来像 API key（sk- 开头）或为空 → 用默认模型
  if (!rawModel || rawModel.startsWith("sk-") || rawModel.length > 60) {
    rawModel = DEFAULT_DEEPSEEK_MODEL;
  }
  // 已知合法模型名直接用，其他值也放行（让 API 自己校验，避免误判）
  const model = rawModel;

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
