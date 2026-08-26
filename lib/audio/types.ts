/** Shared server-side contract for music and speech generation. */

export type AudioProviderName = "minimax" | "gmi" | "openai" | "placeholder";
export type AudioKind = "music" | "tts";

export type MusicSubmitInput = {
  prompt: string;
  lyrics?: string | null;
  language?: string;
  durationSeconds?: number;
  model?: string | null;
  referenceAudioUrl?: string | null;
};

export type TTSSubmitInput = {
  text: string;
  voiceProviderVoiceId: string | null;
  language: string;
  speed?: number;
  pitch?: number;
  stability?: number;
  stylePrompt?: string;
  ssml?: string | null;
};

export type AudioSubmitResult =
  | {
      kind: "sync_done";
      audioBytes: Uint8Array;
      contentType: string;
      providerMetadata: Record<string, unknown>;
    }
  | {
      kind: "async_submitted";
      providerTaskId: string;
    };

export type AudioPollResult = {
  status: "queued" | "running" | "done" | "error";
  audioUrl?: string;
  audioBytes?: Uint8Array;
  contentType?: string;
  providerMetadata?: Record<string, unknown>;
  rawStatus?: string;
  error?: string;
};

export type AudioCapabilities = {
  provider: AudioProviderName;
  music: boolean;
  tts: boolean;
  voiceClone: boolean;
  asyncJobs: boolean;
  models: string[];
};

export type AudioProvider = {
  readonly name: AudioProviderName;
  isAvailable(kind?: AudioKind): boolean;
  capabilities(): AudioCapabilities;
  submitMusic(input: MusicSubmitInput): Promise<AudioSubmitResult>;
  submitTTS(input: TTSSubmitInput): Promise<AudioSubmitResult>;
  poll(providerTaskId: string, kind: AudioKind): Promise<AudioPollResult>;
  download(audioUrl: string): Promise<{ bytes: Uint8Array; contentType: string }>;
};
