import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { loadProductionState } from "@/lib/production/api";
import { buildStoryboardChatPrompt } from "@/lib/production/prompts";
import { callRoutedProvider } from "@/lib/ai/providers";
import { createProductionShot } from "@/lib/production/state";
import type { ProductionShot } from "@/lib/production/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StoryboardChatRequest = {
  projectId?: string;
  message?: string;
  sourceFileIds?: string[];
  shotId?: string;
};

export async function POST(request: Request) {
  let body: StoryboardChatRequest;
  try {
    body = (await request.json()) as StoryboardChatRequest;
  } catch {
    return NextResponse.json({ success: false, error: "请求格式不正确。" }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const message = body.message?.trim();
  if (!projectId || !message) {
    return NextResponse.json({ success: false, error: "缺少 projectId 或 message。" }, { status: 400 });
  }

  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  try {
    const state = await loadProductionState(userId, projectId);
    if (!state) {
      return NextResponse.json(
        { success: false, error: "项目状态未找到，请先保存项目。" },
        { status: 404 },
      );
    }

    const prompt = buildStoryboardChatPrompt(state, message);

    const result = await callRoutedProvider({
      taskType: "storyboard_script",
      messages: [
        { role: "system", content: "You are a professional storyboard director assistant for short drama production. Output structured shots as JSON array when generating new shots." },
        { role: "user", content: prompt },
      ],
    });

    // Parse shots from AI response
    const shots = parseShotsFromReply(result.text);

    return NextResponse.json({
      success: true,
      reply: result.text,
      shots,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "STORYBOARD_CHAT_ERROR";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

function parseShotsFromReply(text: string): ProductionShot[] {
  // Try to extract structured shots from AI response
  // Look for JSON array of shots in the response
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (Array.isArray(parsed)) {
        return parsed.map((item: Record<string, unknown>, index: number) =>
          createProductionShot({ ...(item as Partial<ProductionShot>), index: index + 1 }),
        );
      }
    } catch {
      // JSON parse failed, continue to fallback
    }
  }

  // Fallback: try to find a raw JSON array
  const arrayMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((item: Record<string, unknown>, index: number) =>
          createProductionShot({ ...(item as Partial<ProductionShot>), index: index + 1 }),
        );
      }
    } catch {
      // Parse failed
    }
  }

  return [];
}
