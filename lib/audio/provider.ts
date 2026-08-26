import type {
  AudioCapabilities,
  AudioKind,
  AudioProvider,
  AudioProviderName,
} from "./types";

export async function resolveAudioProvider(
  kind: AudioKind,
  providerName?: AudioProviderName,
): Promise<AudioProvider> {
  const name = (providerName || process.env[`${kind.toUpperCase()}_PROVIDER`] || process.env.AUDIO_PROVIDER || "placeholder").toLowerCase() as AudioProviderName;

  if (name === "minimax") {
    const mod = await import("./providers/minimax");
    const account = process.env.MINIMAX_ACCOUNT === "secondary" ? "secondary" : "primary";
    return mod.createMiniMaxAudioProvider({ account });
  }
  if (name === "gmi") {
    const mod = await import("./providers/gmi");
    return mod.createGmiAudioProvider();
  }
  if (name === "openai") {
    const mod = await import("./providers/openai");
    return mod.createOpenAIAudioProvider();
  }

  const mod = await import("./providers/placeholder");
  return mod.createPlaceholderAudioProvider();
}

export function getAudioCapabilities(): AudioCapabilities[] {
  const hasMiniMaxKey = Boolean(process.env.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY_PRIMARY || process.env.MINIMAX_API_KEY_SECONDARY);
  return [
    {
      provider: "minimax",
      music: hasMiniMaxKey,
      tts: hasMiniMaxKey,
      voiceClone: hasMiniMaxKey,
      asyncJobs: true,
      models: [process.env.MINIMAX_MUSIC_MODEL || "music-3.0", process.env.MINIMAX_TTS_MODEL || "speech-2.8-hd"],
    },
    {
      provider: "gmi",
      music: Boolean(process.env.GMI_API_KEY),
      tts: Boolean(process.env.GMI_API_KEY),
      voiceClone: Boolean(process.env.GMI_API_KEY),
      asyncJobs: true,
      models: [process.env.GMI_MUSIC_MODEL || "minimax-music-3.0", process.env.GMI_TTS_MODEL || "minimax-tts-speech-2.8-hd"],
    },
    {
      provider: "openai",
      music: false,
      tts: Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_TTS_API_KEY),
      voiceClone: false,
      asyncJobs: false,
      models: [process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts"],
    },
  ];
}
