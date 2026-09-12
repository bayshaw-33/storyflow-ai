import type {
  AudioCapabilities,
  AudioKind,
  AudioPollResult,
  AudioProvider,
  AudioSubmitResult,
  MusicSubmitInput,
  TTSSubmitInput,
} from "../types";
import { downloadAudio } from "./helpers.ts";
import { createElevenLabsTTSProvider, type ElevenLabsProviderOptions } from "../../voice/providers/elevenlabs.ts";

export function createElevenLabsAudioProvider(
  options: ElevenLabsProviderOptions = {},
): AudioProvider {
  const ttsProvider = createElevenLabsTTSProvider(options);
  const model = options.model || process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";
  const capabilities: AudioCapabilities = {
    provider: "elevenlabs",
    music: false,
    tts: ttsProvider.isAvailable(),
    voiceClone: ttsProvider.isAvailable(),
    asyncJobs: false,
    models: [model],
  };

  return {
    name: "elevenlabs",
    isAvailable: (kind?: AudioKind) => kind === "music" ? false : ttsProvider.isAvailable(),
    capabilities: () => capabilities,
    submitMusic: async (_input: MusicSubmitInput): Promise<AudioSubmitResult> => {
      throw new Error("UNSUPPORTED:ELEVENLABS_MUSIC");
    },
    submitTTS: (input: TTSSubmitInput) => ttsProvider.submit({
      ...input,
      speed: input.speed ?? 1,
      pitch: input.pitch ?? 0,
      stability: input.stability ?? 0.5,
      stylePrompt: input.stylePrompt ?? "",
    }),
    poll: async (_providerTaskId: string, _kind: AudioKind): Promise<AudioPollResult> => ({
      status: "error",
      error: "ELEVENLABS_TTS_IS_SYNCHRONOUS",
    }),
    download: (audioUrl: string) => downloadAudio(audioUrl),
  };
}
