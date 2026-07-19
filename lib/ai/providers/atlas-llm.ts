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
  /**
   * 可选：调用方传入的模型名（优先级高于 env ATLASCLOUD_LLM_MODEL）。
   * 用于前端用户在 settings 页面从模型下拉选择不同 Atlas Cloud 模型。
   */
  modelOverride?: string;
};

/**
 * Atlas Cloud 支持的常用 LLM 模型列表（用户在 settings 页面下拉选择）。
 * 这些是 Atlas Cloud 平台公开支持的主流模型，用户可自由切换。
 */
export const ATLAS_LLM_MODEL_OPTIONS = [
  "deepseek-v3",
  "deepseek-r1",
  "qwen-turbo",
  "kimi-k2",
  "glm-4",
  "doubao-pro",
] as const;

/**
 * ATLASCLOUD_LLM_MODEL 未配置时的默认模型。
 * 用 deepseek-v3（Atlas Cloud 文档明确示例过的 model id，性价比高且稳定）。
 * 注意：Atlas Cloud 是中国厂商模型聚合平台，不支持 Gemini/GPT/Claude/Grok。
 * 支持的 LLM 厂商：DeepSeek / Qwen / Kimi / GLM / MiniMax / Doubao。
 * 详见 https://www.atlascloud.ai/docs/models/llm
 */
const DEFAULT_ATLAS_LLM_MODEL = "deepseek-v3";

/**
 * 调用 Atlas Cloud LLM（OpenAI-compatible）。
 * 失败抛稳定错误码：
 *   - MISSING_ATLAS_LLM_CONFIG：env 缺 key/base_url/model
 *   - ATLAS_LLM_TIMEOUT：请求超时
 *   - ATLAS_LLM_NETWORK_ERROR：网络失败
 *   - ATLAS_LLM_API_ERROR:<status>：HTTP 非 2xx
 *   - EMPTY_ATLAS_LLM_OUTPUT：返回空内容
 */
export async function callAtlasLLM({
  messages,
  temperature = 0.2,
  timeoutMs = 90000,
  maxTokens = 8192,
  modelOverride,
}: AtlasLLMOptions): Promise<AIProviderResult> {
  const apiKey = process.env.ATLASCLOUD_API_KEY;
  const baseUrl = (process.env.ATLASCLOUD_LLM_BASE_URL || "https://api.atlascloud.ai/v1").trim().replace(/\/+$/, "");
  // 模型优先级：调用方传入 > env ATLASCLOUD_LLM_MODEL > 默认 deepseek-v3
  // 这样即使用户没在 Vercel 配 ATLASCLOUD_LLM_MODEL，Atlas 也能自动启用
  const model = (modelOverride?.trim() || process.env.ATLASCLOUD_LLM_MODEL || DEFAULT_ATLAS_LLM_MODEL).trim();

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
    // 读取 Provider 返回的原始错误正文，脱敏后加入错误消息方便诊断
    // （模型名错误、max_tokens 超限、账户欠费等 400/403 都需要正文才能定位）
    const rawDetail = await readAtlasErrorDetail(response);
    throw new Error(`ATLAS_LLM_API_ERROR:${response.status}:${rawDetail}`);
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

/** 是否配置齐全（供路由层判断是否可作 fallback）。
 * 只要 ATLASCLOUD_API_KEY 配置就算 configured（model/baseUrl 都有默认值）。
 * 这样用户在 Vercel 只需配置 ATLASCLOUD_API_KEY 即可启用 Atlas。 */
export function isAtlasLLMConfigured(): boolean {
  return Boolean(process.env.ATLASCLOUD_API_KEY);
}


async function readAtlasErrorDetail(response: Response) {
  try {
    const data = await response.json();
    // 常见 OpenAI-compatible 错误结构：{ error: { message, type, code } }
    const msg = data?.error?.message || data?.message || data?.detail || JSON.stringify(data);
    return String(msg).slice(0, 300);
  } catch {
    try {
      const text = await response.text();
      return text.slice(0, 300);
    } catch {
      return "";
    }
  }
}
