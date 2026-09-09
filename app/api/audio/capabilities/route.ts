import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { getAudioCapabilities } from "@/lib/audio/provider";
import { getAtlasCloudMusicModels, getDefaultAtlasCloudMusicModel } from "@/lib/audio/music-models";

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
    musicModels: getAtlasCloudMusicModels(),
    selected: {
      music: process.env.MUSIC_PROVIDER || "atlascloud",
      musicModel: process.env.ATLAS_CLOUD_MUSIC_MODEL || getDefaultAtlasCloudMusicModel(),
      tts: process.env.TTS_PROVIDER || process.env.AUDIO_PROVIDER || "placeholder",
    },
  });
}
