import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import {
  createElevenLabsTTSProvider,
  ElevenLabsProviderError,
} from "@/lib/voice/providers/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SAMPLE_BYTES = 20 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    await authenticateRequest(request);
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。", code: "unauthenticated" }, { status: 401 });
  }

  const provider = createElevenLabsTTSProvider();
  if (!provider.isAvailable()) {
    return NextResponse.json({ success: false, error: "ElevenLabs 音色服务未配置。", code: "PROVIDER_UNAVAILABLE" }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const name = form?.get("name");
  const file = form?.get("file");
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ success: false, error: "请填写音色名称。", code: "INVALID_VOICE_NAME" }, { status: 422 });
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ success: false, error: "请上传有效的音频文件。", code: "INVALID_VOICE_SAMPLE" }, { status: 422 });
  }
  if (file.size > MAX_SAMPLE_BYTES) {
    return NextResponse.json({ success: false, error: "音频文件不能超过 20MB。", code: "VOICE_SAMPLE_TOO_LARGE" }, { status: 422 });
  }
  if (file.type && !file.type.toLowerCase().startsWith("audio/")) {
    return NextResponse.json({ success: false, error: "只支持音频文件。", code: "VOICE_SAMPLE_NOT_AUDIO" }, { status: 422 });
  }

  try {
    const created = await provider.createVoiceClone({
      name,
      file,
      description: typeof form?.get("description") === "string" ? String(form?.get("description")) : undefined,
      removeBackgroundNoise: form?.get("removeBackgroundNoise") === "true",
    });
    return NextResponse.json({
      success: true,
      provider: "elevenlabs",
      voiceId: created.voiceId,
      requiresVerification: created.requiresVerification,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ElevenLabsProviderError && error.code === "validation_failed") {
      return NextResponse.json({ success: false, error: "音色名称或音频文件不符合要求。", code: "INVALID_VOICE_SAMPLE" }, { status: 422 });
    }
    if (error instanceof ElevenLabsProviderError && error.code === "unauthorized") {
      return NextResponse.json({ success: false, error: "ElevenLabs 音色服务鉴权失败，请联系管理员。", code: "PROVIDER_UNAUTHORIZED" }, { status: 502 });
    }
    return NextResponse.json({ success: false, error: "音色创建失败，请稍后重试。", code: "PROVIDER_FAILED" }, { status: 502 });
  }
}
