import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMiniMaxApiKey } from "@/lib/ai/providers/minimax";
import type { AIUsage } from "@/lib/ai/providers";
import type { GeneratePayload } from "@/lib/ai/prompts";
import { serviceFetch } from "@/lib/supabase/server";

export const VIRAL_BUCKET = "viral-assets";

export type ViralAnalysis = {
  f1_hook: {
    duration: string;
    type: string;
    emotion: string;
    description: string;
  };
  f2_body: {
    rhythm: string;
    emotion_curve: string;
    description: string;
  };
  f3_action: {
    key_actions: string[];
    turning_point: string;
    description: string;
  };
  f4_result: {
    climax: string;
    presentation: string;
    description: string;
  };
  f5_memory: {
    formula: string;
    tags: string[];
    description: string;
  };
  raw_storyboard: string;
};

export type ViralProjectRow = {
  id: string;
  user_id: string;
  title?: string | null;
  source_video_path: string | null;
  source_video_name?: string | null;
  source_video_mime?: string | null;
  source_video_size?: number | null;
  analysis_json?: ViralAnalysis | null;
  analysis_markdown?: string | null;
  remake_json?: Record<string, unknown> | null;
  remake_markdown?: string | null;
};

export type MiniMaxViralResult = {
  output: string;
  usage: AIUsage | null;
  provider: "minimax";
  model: string;
};

export function failure(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

export function viralPayload(params: {
  taskType: GeneratePayload["taskType"];
  projectId: string;
  projectTitle?: string | null;
  input?: string;
  context?: string;
}): GeneratePayload {
  return {
    taskType: params.taskType,
    projectId: params.projectId,
    projectTitle: params.projectTitle || "爆款创作",
    input: params.input || "",
    context: params.context || "",
  };
}

export async function readViralProject(projectId: string, userId: string) {
  const rows = await serviceFetch<ViralProjectRow[]>(
    `/rest/v1/storyflow_viral_projects?id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  );

  return rows[0] || null;
}

export async function patchViralProject(projectId: string, userId: string, body: Record<string, unknown>) {
  await serviceFetch(
    `/rest/v1/storyflow_viral_projects?id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...body,
        updated_at: new Date().toISOString(),
      }),
    },
  );
}

export function getServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function createSignedVideoUrl(videoPath: string) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage.from(VIRAL_BUCKET).createSignedUrl(videoPath, 60 * 30);

  if (error || !data?.signedUrl) {
    throw new Error(`VIRAL_STORAGE_SIGNED_URL_ERROR:${error?.message || "EMPTY_URL"}`);
  }

  return data.signedUrl;
}

export async function callMiniMaxVideoAnalysis(videoUrl: string, prompt: string): Promise<MiniMaxViralResult> {
  return callMiniMaxRaw([
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "video_url", video_url: { url: videoUrl } },
      ],
    },
  ], 0.25, 4096, 180000);
}

export async function callMiniMaxText(prompt: string): Promise<MiniMaxViralResult> {
  return callMiniMaxRaw(
    [
      {
        role: "user",
        content: prompt,
      },
    ],
    0.45,
    5000,
    120000,
  );
}

async function callMiniMaxRaw(
  messages: Array<{ role: "user" | "assistant" | "system"; content: unknown }>,
  temperature: number,
  maxTokens: number,
  timeoutMs: number,
): Promise<MiniMaxViralResult> {
  const apiKey = getMiniMaxApiKey();
  if (!apiKey) throw new Error("MISSING_MINIMAX_API_KEY");

  const model = process.env.MINIMAX_VIDEO_MODEL || process.env.MINIMAX_MODEL || "MiniMax-M3";
  const baseUrl = process.env.MINIMAX_API_BASE_URL || "https://api.minimax.io/v1/chat/completions";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_completion_tokens: maxTokens,
        thinking: { type: "disabled" },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("MINIMAX_TIMEOUT");
    }

    throw new Error("MINIMAX_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`MINIMAX_API_ERROR:${response.status}:${detail.slice(0, 500)}`);
  }

  const data = await response.json();
  const output = extractMiniMaxOutput(data);
  if (!output) throw new Error("EMPTY_MINIMAX_OUTPUT");

  return {
    output: cleanModelOutput(output),
    usage: isRecord(data) && isRecord(data.usage) ? (data.usage as AIUsage) : null,
    provider: "minimax",
    model,
  };
}

export function parseAnalysisJson(output: string): ViralAnalysis {
  const jsonText = extractJsonObject(output);
  const parsed = JSON.parse(jsonText) as Partial<ViralAnalysis>;

  return {
    f1_hook: {
      duration: String(parsed.f1_hook?.duration || ""),
      type: String(parsed.f1_hook?.type || ""),
      emotion: String(parsed.f1_hook?.emotion || ""),
      description: String(parsed.f1_hook?.description || ""),
    },
    f2_body: {
      rhythm: String(parsed.f2_body?.rhythm || ""),
      emotion_curve: String(parsed.f2_body?.emotion_curve || ""),
      description: String(parsed.f2_body?.description || ""),
    },
    f3_action: {
      key_actions: Array.isArray(parsed.f3_action?.key_actions) ? parsed.f3_action.key_actions.map(String) : [],
      turning_point: String(parsed.f3_action?.turning_point || ""),
      description: String(parsed.f3_action?.description || ""),
    },
    f4_result: {
      climax: String(parsed.f4_result?.climax || ""),
      presentation: String(parsed.f4_result?.presentation || ""),
      description: String(parsed.f4_result?.description || ""),
    },
    f5_memory: {
      formula: String(parsed.f5_memory?.formula || ""),
      tags: Array.isArray(parsed.f5_memory?.tags) ? parsed.f5_memory.tags.map(String) : [],
      description: String(parsed.f5_memory?.description || ""),
    },
    raw_storyboard: String(parsed.raw_storyboard || ""),
  };
}

export function analysisToMarkdown(analysis: ViralAnalysis) {
  return [
    "# 爆款视频结构拆解",
    "",
    "## F1 开场钩子",
    `- 时长：${analysis.f1_hook.duration || "-"}`,
    `- 钩子类型：${analysis.f1_hook.type || "-"}`,
    `- 情绪触发：${analysis.f1_hook.emotion || "-"}`,
    analysis.f1_hook.description || "-",
    "",
    "## F2 主体结构",
    `- 内容节奏：${analysis.f2_body.rhythm || "-"}`,
    `- 情绪推进：${analysis.f2_body.emotion_curve || "-"}`,
    analysis.f2_body.description || "-",
    "",
    "## F3 动作节点",
    `- 关键动作：${analysis.f3_action.key_actions.length ? analysis.f3_action.key_actions.join(" / ") : "-"}`,
    `- 转折点：${analysis.f3_action.turning_point || "-"}`,
    analysis.f3_action.description || "-",
    "",
    "## F4 结果呈现",
    `- 高潮：${analysis.f4_result.climax || "-"}`,
    `- 呈现方式：${analysis.f4_result.presentation || "-"}`,
    analysis.f4_result.description || "-",
    "",
    "## F5 记忆点",
    `- 结构公式：${analysis.f5_memory.formula || "-"}`,
    `- 标签：${analysis.f5_memory.tags.length ? analysis.f5_memory.tags.join(" / ") : "-"}`,
    analysis.f5_memory.description || "-",
    "",
    "## 原视频分镜拆解",
    analysis.raw_storyboard || "-",
  ].join("\n");
}

export function cleanModelOutput(output: string) {
  return output
    .replace(/^\s*```(?:json|markdown|md|text)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export function sanitizeStorageName(name: string) {
  const base = name.trim().replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-");
  return base || "video";
}

function extractJsonObject(output: string) {
  const cleaned = cleanModelOutput(output);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error("INVALID_VIRAL_ANALYSIS_JSON");
  }

  return cleaned.slice(start, end + 1);
}

function extractMiniMaxOutput(data: unknown): string {
  if (!isRecord(data)) return "";
  const choices = data.choices;

  if (Array.isArray(choices)) {
    const content = choices[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : "")).join("");
    }
  }

  const content = data.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => (isRecord(item) && typeof item.text === "string" ? item.text : "")).join("");
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
