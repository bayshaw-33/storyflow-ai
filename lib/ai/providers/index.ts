import type { TaskType } from "../prompts";
import { callDeepSeek } from "./deepseek";
import { callMiniMax, getMiniMaxApiKey } from "./minimax";
import type { AIMessage, AIProviderName, AIProviderResult, AIUsage } from "./types";

export type { AIMessage, AIProviderName, AIProviderResult, AIUsage };

type ProviderMode = "hybrid" | "deepseek" | "minimax";

type ProviderCallOptions = {
  taskType: TaskType;
  messages: AIMessage[];
  temperature?: number;
};

const deepSeekPreferredTasks = new Set<TaskType>([
  "localization",
  "quality_evaluation",
  "final_script",
  "format_check",
  "song_workbench",
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
  const provider = chooseProvider(options.taskType);

  try {
    return await callProvider(provider, options);
  } catch (error) {
    const fallbackProvider = getFallbackProvider(provider);
    if (!fallbackProvider || !isMissingProviderKey(error)) throw error;

    return callProvider(fallbackProvider, options);
  }
}

function chooseProvider(taskType: TaskType): AIProviderName {
  const mode = getProviderMode();
  if (mode === "deepseek") return "deepseek";
  if (mode === "minimax") return "minimax";
  return deepSeekPreferredTasks.has(taskType) ? "deepseek" : "minimax";
}

function getProviderMode(): ProviderMode {
  const mode = process.env.AI_PROVIDER?.toLowerCase();
  if (mode === "deepseek" || mode === "minimax") return mode;
  return "hybrid";
}

function getFallbackProvider(provider: AIProviderName): AIProviderName {
  return provider === "deepseek" ? "minimax" : "deepseek";
}

async function callProvider(provider: AIProviderName, options: ProviderCallOptions) {
  if (provider === "deepseek") {
    return callDeepSeek({
      messages: options.messages,
      temperature: options.temperature,
    });
  }

  return callMiniMax({
    messages: options.messages,
    temperature: options.temperature,
  });
}

function isMissingProviderKey(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message === "MISSING_DEEPSEEK_API_KEY" || message === "MISSING_MINIMAX_API_KEY";
}
