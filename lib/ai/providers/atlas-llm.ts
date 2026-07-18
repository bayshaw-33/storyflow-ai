/**
 * Atlas Cloud LLM Adapter — OpenAI-compatible chat completions.
 *
 * PRD v1.0 §5 (TRAE-PW-P0-001): storyboard_script 分析的 fallback provider。
 * 端点：POST {ATLASCLOUD_LLM_BASE_URL}/chat/completions
 * 鉴权：Bearer $ATLASCLOUD_API_KEY
 * 模型：$ATLASCLOUD_LLM_MODEL（Atlas 账户当前可用的 Gemini 精确 model id）
 *
 * 安全约束：
 *   - API key 只从服务端环境变量读取，不入库不进仓库不打日志；
 *   - 不向客户端返回 key、base URL、Provider request ID 或原始错误正文；
 *   - 失败时抛稳定错误码，由路由层映射为 502/422。
 *
 * 依据：https://www.atlascloud.ai/docs/en/models/llm
 */
import type { AIMessage, AIProviderResult } from "./types";

export type AtlasLLMOptions = {
  messages: AIMessage[];
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
};

/**
 * 调用 Atlas Cloud LLM（OpenAI-compatible）。
 * 失败抛稳定错误码：
 *   - MISSING_ATLAS_LLM_CONFIG：env 缺 key/base_url/model
 *   - ATLAS_LLM_TIMEOUT：请求超时
 *   - ATLAS_LLM_NETWORK_ERROR：网络失败
 *   - ATLAS_LLM_API_ERROR:<status>:<detail>：HTTP 非 2xx
 *   - EMPTY_ATLAS_LLM_OUTPUT：返回空内容
 */
export async function callAtlasLLM({
  messages,
  temperature = 0.2,
  timeoutMs = 90000,
  maxTokens = 8192,
}: AtlasLLMOptions): Promise<AIProviderResult> {
  const apiKey = process.env.ATLASCLOUD_API_KEY;
  const baseUrl = (process.env.ATLASCLOUD_LLM_BASE_URL || "https://api.atlascloud.ai/v1").trim().replace(/\/+$/, "");
  const model = process.env.ATLASCLOUD_LLM_MODEL || "";

  if (!apiKey || !baseUrl || !model) {
    throw new Error("MISSING_ATLAS_LLM_CONFIG");
  }

  const url = normalizeChatCompletionsUrl(baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(url, {
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
      throw new Error("ATLAS_LLM_TIMEOUT");
    }
    throw new Error("ATLAS_LLM_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`ATLAS_LLM_API_ERROR:${response.status}:${detail}`);
  }

  const data = await response.json();
  const output = data.choices?.[0]?.message?.content || data.output_text || data.text;

  if (!output) {
    throw new Error("EMPTY_ATLAS_LLM_OUTPUT");
  }

  return {
    output: String(output).trim(),
    usage: data.usage || null,
    model,
    provider: "atlas",
  };
}

function normalizeChatCompletionsUrl(value: string) {
  if (value.endsWith("/chat/completions")) return value;
  if (value.endsWith("/v1")) return `${value}/chat/completions`;
  return `${value}/v1/chat/completions`;
}

async function readErrorDetail(response: Response) {
  try {
    const data = await response.json();
    return data.error?.message || JSON.stringify(data);
  } catch {
    return response.text();
  }
}

/** 是否配置齐全（供路由层判断是否可作 fallback）。 */
export function isAtlasLLMConfigured(): boolean {
  return Boolean(
    process.env.ATLASCLOUD_API_KEY &&
      (process.env.ATLASCLOUD_LLM_BASE_URL || "https://api.atlascloud.ai/v1") &&
      process.env.ATLASCLOUD_LLM_MODEL,
  );
}
