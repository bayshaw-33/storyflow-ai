import { callDeepSeek, type AIUsage } from "./providers/deepseek";
import { buildPrompt, taskNames, type GeneratePayload, type TaskType } from "./prompts";

const taskTypes: TaskType[] = [
  "market_analysis",
  "script_import",
  "brief",
  "characters",
  "series_outline",
  "existing_script",
  "chinese_script",
  "continuation_script",
  "translation",
  "localization",
  "test_script",
  "quality_evaluation",
  "final_script",
  "storyboard_script",
  "final_delivery",
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
        content:
          "你是 StoryFlow AI 的服务端生成器，只输出符合海外漫剧研发流程的正文内容。严禁输出“好的”“以下是”等 AI 回复套话。",
      },
      {
        role: "user",
        content: buildPrompt(payload),
      },
    ],
  });

  return {
    success: true,
    output: cleanAIOutput(providerResult.output),
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

function cleanAIOutput(output: string) {
  return output
    .replace(/^\s*(好的|当然|没问题)[，,。\s]*/i, "")
    .replace(/^\s*这是根据您?(提供的)?(?:输入|信息|内容).*?(生成|整理).*?[。:：]\s*/i, "")
    .replace(/^\s*以下是(?:根据.*?生成的)?[^。\n]*[。:：]\s*/i, "")
    .replace(/^\s*```(?:json|markdown|md|text)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}
