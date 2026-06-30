export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
};

export type AIProviderName = "deepseek" | "minimax" | "custom";

export type AIProviderResult = {
  output: string;
  usage: AIUsage | null;
  model: string;
  provider: AIProviderName;
};

