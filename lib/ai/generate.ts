import { callDeepSeek, type AIUsage } from "./providers/deepseek";
import { buildPrompt, taskNames, type GeneratePayload, type TaskType } from "./prompts";

const taskTypes: TaskType[] = [
  "market_positioning",
  "benchmark_analysis",
  "brief",
  "market_prediction",
  "characters",
  "series_outline",
  "episode_scripts",
  "quality_evaluation",
  "translation",
  "localization",
];

export type GenerateSuccess = {
  success: true;
  output: string;
  usage: AIUsage | null;
  error: null;
  meta: {
    taskType: TaskType;
    taskName: string;
    provider: string;
    model: string;
    generatedAt: string;
  };
};

export type GenerateFailure = {
  success: false;
  output: "";
  usage: null;
  error: string;
};

export type GenerateResponse = GenerateSuccess | GenerateFailure;

export function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && taskTypes.includes(value as TaskType);
}

export async function generateAIContent(payload: GeneratePayload): Promise<GenerateSuccess> {
  if (!isTaskType(payload.taskType)) {
    throw new Error("INVALID_TASK_TYPE");
  }

  const providerResult = await callDeepSeek({
    messages: [
      {
        role: "system",
        content: "你是 StoryFlow AI 的服务端生成器，只输出符合海外短剧研发流程的正文内容。",
      },
      {
        role: "user",
        content: buildPrompt(payload),
      },
    ],
  });

  return {
    success: true,
    output: providerResult.output,
    usage: providerResult.usage,
    error: null,
    meta: {
      taskType: payload.taskType,
      taskName: taskNames[payload.taskType],
      provider: providerResult.provider,
      model: providerResult.model,
      generatedAt: new Date().toISOString(),
    },
  };
}
