import type {
  AudioCapabilities,
  AudioKind,
  AudioPollResult,
  AudioProvider,
  AudioSubmitResult,
  MusicSubmitInput,
  TTSSubmitInput,
} from "../types";
import { downloadAudio, parseProviderStatus, readNestedString, readString, requestJson } from "./helpers";

const DEFAULT_BASE_URL = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey";

function apiKey() {
  return process.env.GMI_API_KEY;
}

function baseUrl() {
  return (process.env.GMI_AUDIO_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function requestId(data: Record<string, unknown>) {
  return readNestedString(data, [["request_id"], ["task_id"], ["id"]]);
}

function mediaUrl(data: Record<string, unknown>) {
  return readNestedString(data, [["outcome", "audio_url"], ["outcome", "url"], ["outcome", "media_urls", "0", "url"], ["audio_url"], ["url"]]);
}

async function submit(apiKeyValue: string, model: string, payload: Record<string, unknown>): Promise<AudioSubmitResult> {
  const data = await requestJson(`${baseUrl()}/requests`, apiKeyValue, {
    method: "POST",
    body: JSON.stringify({ model, payload }),
    signal: AbortSignal.timeout(120_000),
  });
  const id = requestId(data);
  if (!id) throw new Error("GMI_REQUEST_ID_MISSING");
  return { kind: "async_submitted", providerTaskId: id };
}

async function poll(apiKeyValue: string, providerTaskId: string): Promise<AudioPollResult> {
  const data = await requestJson(`${baseUrl()}/requests/${encodeURIComponent(providerTaskId)}`, apiKeyValue, { method: "GET" });
  const status = parseProviderStatus(data.status);
  if (status === "error") return { status, rawStatus: readString(data.status), error: readNestedString(data, [["error", "message"], ["message"], ["outcome", "error"]]) || "GMI_AUDIO_FAILED" };
  if (status !== "done") return { status, rawStatus: readString(data.status) };
  const url = mediaUrl(data);
  return url ? { status: "done", audioUrl: url, providerMetadata: { provider: "gmi", requestId: providerTaskId } } : { status: "error", error: "GMI_AUDIO_RESULT_MISSING" };
}

export function createGmiAudioProvider(): AudioProvider {
  const key = apiKey();
  const capabilities: AudioCapabilities = {
    provider: "gmi",
    music: Boolean(key),
    tts: Boolean(key),
    voiceClone: Boolean(key),
    asyncJobs: true,
    models: [process.env.GMI_MUSIC_MODEL || "minimax-music-3.0", process.env.GMI_TTS_MODEL || "minimax-tts-speech-2.8-hd"],
  };
  return {
    name: "gmi",
    isAvailable: (kind) => Boolean(key) && (kind !== "music" || capabilities.music) && (kind !== "tts" || capabilities.tts),
    capabilities: () => capabilities,
    submitMusic: (input: MusicSubmitInput) => key ? submit(key, input.model || process.env.GMI_MUSIC_MODEL || "minimax-music-3.0", {
      prompt: input.prompt,
      lyrics: input.lyrics || "",
      audio_setting: { sample_rate: 44100, bitrate: 256000, format: "mp3" },
    }) : Promise.reject(new Error("PROVIDER_UNAVAILABLE:GMI_API_KEY")),
    submitTTS: (input: TTSSubmitInput) => key ? submit(key, process.env.GMI_TTS_MODEL || "minimax-tts-speech-2.8-hd", {
      text: input.text,
      voice_id: input.voiceProviderVoiceId || "English_expressive_narrator",
      speed: String(input.speed ?? 1),
      vol: "1",
      pitch: String(input.pitch ?? 0),
      emotion: "auto",
      language_boost: input.language || "auto",
      format: "mp3",
      audio_sample_rate: "32000",
      bitrate: "128000",
      channel: "1",
    }) : Promise.reject(new Error("PROVIDER_UNAVAILABLE:GMI_API_KEY")),
    poll: (providerTaskId, _kind) => key ? poll(key, providerTaskId) : Promise.reject(new Error("PROVIDER_UNAVAILABLE:GMI_API_KEY")),
    download: (audioUrl) => downloadAudio(audioUrl),
  };
}
