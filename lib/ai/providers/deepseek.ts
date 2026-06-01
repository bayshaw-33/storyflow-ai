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

export type AIProviderResult = {
  output: string;
  usage: AIUsage | null;
  model: string;
  provider: "deepseek";
};

type DeepSeekOptions = {
  messages: AIMessage[];
  temperature?: number;
  timeoutMs?: number;
};

export async function callDeepSeek({
  messages,
  temperature = 0.75,
  timeoutMs = 45000,
}: DeepSeekOptions): Promise<AIProviderResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";

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
