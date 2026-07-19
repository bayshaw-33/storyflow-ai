import type { ByoApiConfig, TaskType } from "../prompts";
import { callAtlasLLM, isAtlasLLMConfigured } from "./atlas-llm.ts";
import { callCustomProvider } from "./custom.ts";
import { callDeepSeek } from "./deepseek.ts";
import { callMiniMax, getMiniMaxApiKey } from "./minimax.ts";
import type { AIMessage, AIProviderName, AIProviderResult, AIUsage } from "./types";

export type { AIMessage, AIProviderName, AIProviderResult, AIUsage };

/**
 * PRD v1.0 §5 (TRAE-PW-P0-001): storyboard_script 的窄 Provider chain。
 * 主链 DeepSeek → fallback Atlas Cloud Gemini，永远不回落到 MiniMax。
 * 其他 taskType 仍走原 hybrid router（不在本表中的任务不受影响）。
 */
const storyboardScriptTasks = new Set<TaskType>(["storyboard_script"]);

/** storyboard 任务的 fallback 触发条件（PRD §5.2 §7）。
 * 保守策略：DeepSeek 几乎所有错误都触发 Atlas fallback。 */
function isStoryboardFallbackTrigger(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  if (!message) return true;
  // Atlas 错误 → 不触发 fallback（Atlas 已经是 fallback 了，不能再回退）
  if (message === "MISSING_ATLAS_LLM_CONFIG") return false;
  if (message.startsWith("ATLAS_LLM_")) return false;
  // DeepSeek 任何错误（除 MISSING_DEEPSEEK_API_KEY）都尝试 Atlas
  if (message === "MISSING_DEEPSEEK_API_KEY") return true;
  if (message === "DEEPSEEK_TIMEOUT" || message === "DEEPSEEK_NETWORK_ERROR") return true;
  if (message === "EMPTY_DEEPSEEK_OUTPUT") return true;
  if (message.startsWith("DEEPSEEK_API_ERROR:")) return true; // 400/401/402/403/404/429/5xx 全部 fallback
  // 其他未知错误保守触发 fallback
  return true;
}

type ProviderMode = "hybrid" | "deepseek" | "minimax";

type ProviderCallOptions = {
  taskType: TaskType;
  messages: AIMessage[];
  temperature?: number;
  byoApi?: ByoApiConfig;
  /**
   * Optional task-level output validator. Storyboard analysis uses this to
   * make malformed DeepSeek JSON participate in the provider fallback chain
   * instead of failing only after the chain has already returned.
   */
  validateOutput?: (output: string) => void;
};

const deepSeekPreferredTasks = new Set<TaskType>([
  "localization",
  "quality_evaluation",
  "final_script",
  "format_check",
  "song_workbench",
  "song_development_chat",
  "novel_brief",
  "novel_bible",
  "novel_characters",
  "novel_volume_outline",
  "novel_chapter_outline",
  "novel_chapter_draft",
  "novel_revision",
  "novel_export",
  "creation_development_chat",
  "creation_background_world",
  "creation_character_bible",
  "creation_plot_outline",
  "creation_novel_unit",
  "creation_screenplay_unit",
  "creation_translate_unit",
  "creation_localize_unit",
]);

export function getProviderStatus() {
  return {
    mode: getProviderMode(),
    deepseek: {
      configured: Boolean(process.env.DEEPSEEK_API_KEY),
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
    },
    atlas: {
      configured: isAtlasLLMConfigured(),
      model: process.env.ATLASCLOUD_LLM_MODEL || "",
      baseUrl: process.env.ATLASCLOUD_LLM_BASE_URL || "https://api.atlascloud.ai/v1",
    },
    minimax: {
      configured: Boolean(getMiniMaxApiKey()),
      model: process.env.MINIMAX_MODEL || "MiniMax-M3",
      imageModel: process.env.MINIMAX_IMAGE_MODEL || "image-01",
    },
  };
}

export async function callRoutedProvider(options: ProviderCallOptions): Promise<AIProviderResult> {
  // PRD §5: storyboard_script 走 DeepSeek primary → Atlas fallback 窄链。
  // 任何情况下不得回落到 MiniMax。
  if (storyboardScriptTasks.has(options.taskType)) {
    return callStoryboardProviderChain(options);
  }

  const provider = chooseProvider(options.taskType, options.byoApi);

  try {
    return await callProvider(provider, options);
  } catch (error) {
    // 情况 1：key 缺失 → 按原逻辑 fallback（deepseek↔minimax）
    const fallbackProvider = getFallbackProvider(provider);
    if (fallbackProvider && isMissingProviderKey(error)) {
      return callProvider(fallbackProvider, options);
    }
    // 情况 2：DeepSeek 出现可重试错误（5xx/429/401/403/404/超时/网络/空输出）→ 尝试 Atlas
    if (provider === "deepseek" && shouldTryAtlasAfterDeepSeek(error) && isAtlasLLMConfigured()) {
      try {
        return await callAtlasLLM({
          messages: options.messages,
          temperature: options.temperature,
          modelOverride: options.byoApi?.atlasModel?.trim() || undefined,
        });
      } catch {
        throw error;
      }
    }
    throw error;
  }
}

/** 判断 DeepSeek 的错误是否值得尝试 Atlas fallback。
 * 保守策略：除 MISSING_DEEPSEEK_API_KEY 外，几乎所有错误都尝试 Atlas。
 * 因为 DeepSeek 常见问题：模型名错误(400)、余额不足(402)、key 无效(401)、限流(429)、
 * 服务端错误(5xx)、超时、网络、空输出——这些 Atlas 都能顶上。 */
function shouldTryAtlasAfterDeepSeek(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  if (!message) return true;
  // 只有"完全没配 key"才不尝试 Atlas（因为可能用户故意只用 DeepSeek）
  if (message === "MISSING_DEEPSEEK_API_KEY") return false;
  // 其他所有错误都尝试 Atlas：超时、网络、空输出、4xx、5xx 全覆盖
  return true;
}

/**
 * storyboard_script 专用 Provider chain（PRD §5.2）：
 *   DeepSeek primary → Atlas Cloud Gemini fallback (仅一次) → 显式失败
 *
 * fallback 触发条件：缺 key / 超时 / 网络 / 429 / 5xx / 空输出 / schema 失败。
 * 不触发 fallback：4xx 输入错误、未认证、跨作用域、revision 冲突。
 *
 * 返回结果带 fallbackUsed 标记，供路由层透传给客户端做非敏感诊断。
 */
async function callStoryboardProviderChain(options: ProviderCallOptions): Promise<AIProviderResult> {
  // Primary: DeepSeek（用户重新注册了 DeepSeek API key 并已更新到 Vercel）
  // Fallback: Atlas Cloud（仅一次，Atlas 已配置时才触发）
  let deepSeekError: unknown = null;
  try {
    const result = await callDeepSeek({
      messages: options.messages,
      temperature: options.temperature,
    });
    options.validateOutput?.(result.output);
    return { ...result, fallbackUsed: false };
  } catch (error) {
    if (!isStoryboardFallbackTrigger(error)) throw error;
    if (!isAtlasLLMConfigured()) throw error; // Atlas 未配置则直接抛 DeepSeek 错误
    deepSeekError = error; // 保留 DeepSeek 原始错误，Atlas 也失败时优先返回它

    // Fallback: Atlas Cloud (仅一次)
    try {
      const atlasResult = await callAtlasLLM({
        messages: options.messages,
        temperature: options.temperature,
        modelOverride: options.byoApi?.atlasModel?.trim() || undefined,
      });
      options.validateOutput?.(atlasResult.output);
      return { ...atlasResult, fallbackUsed: true };
    } catch (atlasError) {
      // Atlas 也失败：如果 DeepSeek 错误更有诊断价值（如 400 模型名错误），
      // 优先抛 DeepSeek 的错误；否则抛 Atlas 的错误。
      const dsMsg = deepSeekError instanceof Error ? deepSeekError.message : "";
      const atlasMsg = atlasError instanceof Error ? atlasError.message : "";
      // DeepSeek 4xx 输入错误比 Atlas 4xx 更有诊断价值（用户能据此修 Vercel env）
      if (dsMsg.startsWith("DEEPSEEK_API_ERROR:4")) throw deepSeekError;
      // DeepSeek 内容校验失败 → Atlas 也失败 → 抛 Atlas 错误（说明两个 provider 都搞不定）
      throw atlasError;
    }
  }
}

function chooseProvider(taskType: TaskType, byoApi?: ByoApiConfig): AIProviderName {
  if (byoApi?.provider === "deepseek") return "deepseek";
  if (byoApi?.provider === "minimax") return "minimax";
  if (byoApi?.provider === "custom") return "custom";
  // DeepSeek primary，Atlas 仅作 fallback（用户 2026-07-19 确认恢复原逻辑）
  if (isNovelTask(taskType) || taskType.startsWith("creation_")) return "deepseek";
  const mode = getProviderMode();
  if (mode === "deepseek") return "deepseek";
  if (mode === "minimax") return "minimax";
  return deepSeekPreferredTasks.has(taskType) ? "deepseek" : "minimax";
}

function isNovelTask(taskType: TaskType) {
  return taskType.startsWith("novel_");
}

function getProviderMode(): ProviderMode {
  const mode = process.env.AI_PROVIDER?.toLowerCase();
  if (mode === "deepseek" || mode === "minimax") return mode;
  return "hybrid";
}

function getFallbackProvider(provider: AIProviderName): AIProviderName {
  if (provider === "custom") return "deepseek";
  return provider === "deepseek" ? "minimax" : "deepseek";
}

async function callProvider(provider: AIProviderName, options: ProviderCallOptions) {
  if (provider === "atlas") {
    return callAtlasLLM({
      messages: options.messages,
      temperature: options.temperature,
      modelOverride: options.byoApi?.atlasModel?.trim() || undefined,
    });
  }

  if (provider === "deepseek") {
    return callDeepSeek({
      messages: options.messages,
      temperature: options.temperature,
      apiKeyOverride: cleanSecret(options.byoApi?.deepseekApiKey),
      modelOverride: options.byoApi?.deepseekModel?.trim() || undefined,
    });
  }

  if (provider === "custom") {
    return callCustomProvider({
      messages: options.messages,
      temperature: options.temperature,
      apiKey: cleanSecret(options.byoApi?.customApiKey) || "",
      model: options.byoApi?.customModel?.trim() || "",
      baseUrl: options.byoApi?.customBaseUrl?.trim() || "",
      providerName: options.byoApi?.customProviderName?.trim() || "Custom",
    });
  }

  return callMiniMax({
    messages: options.messages,
    temperature: options.temperature,
    apiKeyOverride: cleanSecret(options.byoApi?.minimaxApiKey),
    modelOverride: options.byoApi?.minimaxModel?.trim() || undefined,
    baseUrlOverride: options.byoApi?.minimaxBaseUrl?.trim() || undefined,
  });
}

function cleanSecret(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function isMissingProviderKey(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message === "MISSING_DEEPSEEK_API_KEY" || message === "MISSING_MINIMAX_API_KEY" || message === "MISSING_CUSTOM_API_KEY" || message === "MISSING_ATLAS_LLM_CONFIG";
}
