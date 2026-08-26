import type { AudioCapabilities, AudioProvider } from "../types";

const capabilities: AudioCapabilities = {
  provider: "placeholder",
  music: false,
  tts: false,
  voiceClone: false,
  asyncJobs: false,
  models: [],
};

function unavailable(): never {
  throw new Error("AUDIO_PROVIDER_UNAVAILABLE");
}

export function createPlaceholderAudioProvider(): AudioProvider {
  return {
    name: "placeholder",
    isAvailable: () => false,
    capabilities: () => capabilities,
    submitMusic: async () => unavailable(),
    submitTTS: async () => unavailable(),
    poll: async () => unavailable(),
    download: async () => unavailable(),
  };
}
