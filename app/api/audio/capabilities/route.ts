import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { getAudioCapabilities } from "@/lib/audio/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await authenticateRequest(request);
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    providers: getAudioCapabilities(),
    selected: {
      music: process.env.MUSIC_PROVIDER || process.env.AUDIO_PROVIDER || "placeholder",
      tts: process.env.TTS_PROVIDER || process.env.AUDIO_PROVIDER || "placeholder",
    },
  });
}
