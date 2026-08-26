import type { AudioCapabilities, AudioProvider } from "../types";
import { downloadAudio } from "./helpers";

export function createOpenAIAudioProvider(): AudioProvider {
  const key = process.env.OPENAI_API_KEY || process.env.OPENAI_TTS_API_KEY;
  const capabilities: AudioCapabilities = {
    provider: "openai",
    music: false,
    tts: Boolean(key),
    voiceClone: false,
    asyncJobs: false,
    models: [process.env.OPENAI_TTS_MODEL || "tts-1"],
  };
  return {
    name: "openai",
    isAvailable: (kind) => Boolean(key) && kind !== "music",
    capabilities: () => capabilities,
    submitMusic: async () => { throw new Error("PROVIDER_UNSUPPORTED:OPENAI_MUSIC"); },
    submitTTS: async (input) => {
      if (!key) throw new Error("PROVIDER_UNAVAILABLE:OPENAI_TTS_API_KEY");
      const response = await fetch(`${process.env.OPENAI_BASE_URL || "https://api.openai.com"}/v1/audio/speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || "tts-1", input: input.text, voice: input.voiceProviderVoiceId || "alloy", response_format: "mp3", speed: input.speed }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`OPENAI_TTS_HTTP_${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.byteLength) throw new Error("OPENAI_TTS_EMPTY_RESPONSE");
      return { kind: "sync_done", audioBytes: bytes, contentType: "audio/mpeg", providerMetadata: { provider: "openai", model: process.env.OPENAI_TTS_MODEL || "tts-1" } };
    },
    poll: async () => { throw new Error("PROVIDER_UNSUPPORTED:OPENAI_ASYNC"); },
    download: (audioUrl) => downloadAudio(audioUrl, key),
  };
}
