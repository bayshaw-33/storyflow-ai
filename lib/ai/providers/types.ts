export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
};

export type AIUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
};

export type AIProviderName = "deepseek" | "minimax" | "custom" | "atlas";

export type AIProviderResult = {
  output: string;
  usage: AIUsage | null;
  model: string;
  provider: AIProviderName;
  /** PRD §5.2: storyboard chain fallback 标记（DeepSeek → Atlas Gemini）。 */
  fallbackUsed?: boolean;
};
