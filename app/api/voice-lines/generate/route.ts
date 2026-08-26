/**
 * POST /api/voice-lines/generate — 轻量工作台生成（Phase 5 Task 5.4）.
 * body: { targetKind, targetId, text, language, emotion?, speed?, voiceRef? }
 * 通过 VoiceProvider（CosyVoice adapter）提交任务；Provider 未配置时返回
 * 真实 503，绝不假成功。
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, getSupabaseServerClient, hasServiceRoleConfig } from "@/lib/supabase/server";
import { fetchVoiceLineById } from "@/lib/voice/queries";
import { getCurrentTTSProviderName, resolveTTSProvider } from "@/lib/voice/provider";
import { isUuid } from "@/lib/validation/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await authenticateRequest(request);
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。", code: "unauthenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const targetId = String(body.targetId ?? "").trim();
  if (!isUuid(targetId)) {
    return NextResponse.json({ success: false, error: "targetId 必须是有效 Voice Line UUID。", code: "INVALID_VOICE_LINE_ID" }, { status: 422 });
  }
  if (!hasServiceRoleConfig()) {
    return NextResponse.json({ success: false, error: "服务端配音存储未配置。", code: "service_unavailable" }, { status: 503 });
  }
  const serverClient = getSupabaseServerClient();
  if (!serverClient) return NextResponse.json({ success: false, error: "服务端配音存储未配置。", code: "service_unavailable" }, { status: 503 });
  const voiceLine = await fetchVoiceLineById(serverClient, targetId, user.id);
  if (!voiceLine) return NextResponse.json({ success: false, error: "Voice Line 不存在或无权访问。", code: "VOICE_LINE_NOT_FOUND" }, { status: 404 });
  const name = getCurrentTTSProviderName();
  if (name === "placeholder") {
    return NextResponse.json(
      { success: false, error: "配音服务未配置（TTS_PROVIDER=placeholder）。", code: "service_unavailable" },
      { status: 503 },
    );
  }
  const text = voiceLine.text.trim();
  if (!text) {
    return NextResponse.json({ success: false, error: "text 必填。", code: "validation_failed" }, { status: 422 });
  }
  try {
    const provider = await resolveTTSProvider();
    const submit = (provider as unknown as { submit?: (input: { text: string; language: string; emotion?: string; speed?: number; voiceRef?: string }) => Promise<{ providerTaskId: string }> }).submit;
    if (!submit) {
      return NextResponse.json({ success: false, error: "当前 Provider 不支持提交任务。", code: "service_unavailable" }, { status: 503 });
    }
    const result = await submit({
      text,
      language: String(body.language ?? "zh-CN"),
      emotion: body.emotion ? String(body.emotion) : undefined,
      speed: typeof body.speed === "number" ? body.speed : undefined,
      voiceRef: body.voiceRef ? String(body.voiceRef) : undefined,
    });
    return NextResponse.json(
      { success: true, contractVersion: "2.2.0-alpha.1", jobId: result.providerTaskId, provider: name },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: `配音提交失败：${(error as Error).message}`, code: "service_unavailable" },
      { status: 503 },
    );
  }
}
