import type { ByoApiConfig, TaskType } from "../prompts";
import { callCustomProvider } from "./custom";
import { callDeepSeek } from "./deepseek";
import { callMiniMax, getMiniMaxApiKey } from "./minimax";
import type { AIMessage, AIProviderName, AIProviderResult, AIUsage } from "./types";

export type { AIMessage, AIProviderName, AIProviderResult, AIUsage };

type ProviderMode = "hybrid" | "deepseek" | "minimax";

type ProviderCallOptions = {
  taskType: TaskType;
  messages: AIMessage[];
  temperature?: number;
  byoApi?: ByoApiConfig;
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
    minimax: {
      configured: Boolean(getMiniMaxApiKey()),
      model: process.env.MINIMAX_MODEL || "MiniMax-M3",
      imageModel: process.env.MINIMAX_IMAGE_MODEL || "image-01",
    },
  };
}

export async function callRoutedProvider(options: ProviderCallOptions): Promise<AIProviderResult> {
  const provider = chooseProvider(options.taskType, options.byoApi);

  try {
    return await callProvider(provider, options);
  } catch (error) {
    const fallbackProvider = getFallbackProvider(provider);
    if (!fallbackProvider || !isMissingProviderKey(error)) throw error;

    return callProvider(fallbackProvider, options);
  }
}

function chooseProvider(taskType: TaskType, byoApi?: ByoApiConfig): AIProviderName {
  if (byoApi?.provider === "deepseek") return "deepseek";
  if (byoApi?.provider === "minimax") return "minimax";
  if (byoApi?.provider === "custom") return "custom";
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
  return message === "MISSING_DEEPSEEK_API_KEY" || message === "MISSING_MINIMAX_API_KEY" || message === "MISSING_CUSTOM_API_KEY";
}
