import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import {
  createElevenLabsTTSProvider,
  ElevenLabsProviderError,
} from "@/lib/voice/providers/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePageSize(value: string | null): number {
  const parsed = Number(value ?? 30);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

function parseSharedPage(value: string | null): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
}

function providerError(error: unknown): NextResponse {
  if (error instanceof ElevenLabsProviderError && error.code === "unauthorized") {
    return NextResponse.json(
      { success: false, error: "ElevenLabs 音色服务鉴权失败，请联系管理员。", code: "PROVIDER_UNAUTHORIZED" },
      { status: 502 },
    );
  }
  return NextResponse.json(
    { success: false, error: "ElevenLabs 音色库暂时无法访问，请稍后重试。", code: "PROVIDER_UNAVAILABLE" },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request);
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。", code: "unauthenticated" }, { status: 401 });
  }

  const provider = createElevenLabsTTSProvider();
  if (!provider.isAvailable()) {
    return NextResponse.json(
      { success: false, error: "ElevenLabs 音色服务未配置。", code: "PROVIDER_UNAVAILABLE" },
      { status: 503 },
    );
  }

  const params = request.nextUrl.searchParams;
  const source = params.get("source") || "personal";
  if (source !== "personal" && source !== "shared") {
    return NextResponse.json({ success: false, error: "音色来源不受支持。", code: "INVALID_VOICE_SOURCE" }, { status: 422 });
  }

  const pageSize = parsePageSize(params.get("pageSize"));
  const search = params.get("search") || undefined;

  try {
    const page = source === "personal"
      ? await provider.listVoices({
          pageSize,
          search,
          pageToken: params.get("pageToken") || undefined,
        })
      : await (async () => {
          const page = parseSharedPage(params.get("pageToken"));
          if (page < 0) throw new ElevenLabsProviderError("validation_failed", "Invalid shared voice page token.");
          return provider.listSharedVoices({
            pageSize,
            search,
            language: params.get("language") || undefined,
            gender: params.get("gender") || undefined,
            page,
          });
        })();

    return NextResponse.json({
      success: true,
      provider: "elevenlabs",
      source,
      voices: page.voices,
      hasMore: page.hasMore,
      nextPageToken: page.nextPageToken,
    });
  } catch (error) {
    if (error instanceof ElevenLabsProviderError && error.code === "validation_failed") {
      return NextResponse.json({ success: false, error: "分页参数不正确。", code: "INVALID_PAGE_TOKEN" }, { status: 422 });
    }
    return providerError(error);
  }
}
