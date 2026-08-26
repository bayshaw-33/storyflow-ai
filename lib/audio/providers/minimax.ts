import type {
  AudioCapabilities,
  AudioKind,
  AudioPollResult,
  AudioProvider,
  AudioSubmitResult,
  MusicSubmitInput,
  TTSSubmitInput,
} from "../types";
import {
  decodeHexAudio,
  downloadAudio,
  readNestedString,
  readString,
  requestJson,
  parseProviderStatus,
} from "./helpers";

type MiniMaxOptions = { account?: "primary" | "secondary" };

function getApiKey(account: MiniMaxOptions["account"] = "primary"): string | undefined {
  return account === "secondary"
    ? process.env.MINIMAX_API_KEY_SECONDARY
    : process.env.MINIMAX_API_KEY || process.env.MINIMAX_API_KEY_PRIMARY;
}

function getErrorMessage(data: Record<string, unknown>): string {
  return readNestedString(data, [["base_resp", "status_msg"], ["error", "message"], ["message"]]) || "MiniMax request failed";
}

function syncAudioResult(data: Record<string, unknown>, model: string): AudioSubmitResult | null {
  const hex = readNestedString(data, [["data", "audio"]]);
  if (hex) {
    return {
      kind: "sync_done",
      audioBytes: decodeHexAudio(hex),
      contentType: "audio/mpeg",
      providerMetadata: { provider: "minimax", model, source: "hex" },
    };
  }

  const audioUrl = readNestedString(data, [["data", "audio_url"], ["data", "url"], ["audio_url"], ["url"]]);
  if (audioUrl) return { kind: "async_submitted", providerTaskId: audioUrl };

  const taskId = readNestedString(data, [["task_id"], ["data", "task_id"], ["request_id"]]);
  return taskId ? { kind: "async_submitted", providerTaskId: taskId } : null;
}

async function submitMusic(apiKey: string, input: MusicSubmitInput): Promise<AudioSubmitResult> {
  const model = input.model || process.env.MINIMAX_MUSIC_MODEL || "music-3.0";
  const data = await requestJson(
    process.env.MINIMAX_MUSIC_API_URL || "https://api.minimax.io/v1/music_generation",
    apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        model,
        prompt: input.prompt,
        ...(input.lyrics ? { lyrics: input.lyrics } : {}),
        audio_setting: { sample_rate: 44100, bitrate: 256000, format: "mp3" },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const result = syncAudioResult(data, model);
  if (!result) throw new Error(`MINIMAX_MUSIC_EMPTY:${getErrorMessage(data)}`);
  if (result.kind === "async_submitted" && result.providerTaskId.startsWith("http")) {
    const downloaded = await downloadAudio(result.providerTaskId, apiKey);
    return { kind: "sync_done", audioBytes: downloaded.bytes, contentType: downloaded.contentType, providerMetadata: { provider: "minimax", model, source: "url" } };
  }
  return result;
}

async function submitTTS(apiKey: string, input: TTSSubmitInput): Promise<AudioSubmitResult> {
  const model = process.env.MINIMAX_TTS_MODEL || "speech-2.8-hd";
  const data = await requestJson(
    process.env.MINIMAX_TTS_API_URL || "https://api.minimax.io/v1/t2a_async_v2",
    apiKey,
    {
      method: "POST",
      body: JSON.stringify({
        model,
        text: input.text,
        language_boost: input.language || "auto",
        voice_setting: {
          voice_id: input.voiceProviderVoiceId || "English_expressive_narrator",
          speed: input.speed ?? 1,
          vol: 1,
          pitch: input.pitch ?? 0,
        },
        audio_setting: { audio_sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const result = syncAudioResult(data, model);
  if (!result) throw new Error(`MINIMAX_TTS_EMPTY:${getErrorMessage(data)}`);
  return result;
}

async function poll(apiKey: string, providerTaskId: string, kind: AudioKind): Promise<AudioPollResult> {
  if (providerTaskId.startsWith("http")) return { status: "done", audioUrl: providerTaskId };
  const queryUrl = kind === "tts"
    ? process.env.MINIMAX_TTS_QUERY_URL || "https://api.minimax.io/v1/query/t2a_async_query_v2"
    : process.env.MINIMAX_MUSIC_QUERY_URL || "https://api.minimax.io/v1/query/music_generation";
  const separator = queryUrl.includes("?") ? "&" : "?";
  const data = await requestJson(`${queryUrl}${separator}task_id=${encodeURIComponent(providerTaskId)}`, apiKey, { method: "GET" });
  const status = parseProviderStatus(data.status, readNestedString(data, [["base_resp", "status_msg"]]));
  if (status === "error") return { status, rawStatus: readString(data.status), error: getErrorMessage(data) };
  if (status !== "done") return { status, rawStatus: readString(data.status) };

  const fileId = readNestedString(data, [["file_id"], ["data", "file_id"]]);
  if (fileId) {
    const fileUrl = `${process.env.MINIMAX_FILE_RETRIEVE_URL || "https://api.minimax.io/v1/files/retrieve_content"}?file_id=${encodeURIComponent(fileId)}`;
    const downloaded = await downloadAudio(fileUrl, apiKey);
    return { status: "done", ...downloaded, providerMetadata: { provider: "minimax", fileId } };
  }
  const audioUrl = readNestedString(data, [["audio_url"], ["data", "audio_url"], ["url"], ["data", "url"]]);
  return audioUrl ? { status: "done", audioUrl } : { status: "error", error: "MINIMAX_AUDIO_RESULT_MISSING" };
}

export function createMiniMaxAudioProvider(options: MiniMaxOptions = {}): AudioProvider {
  const account = options.account || "primary";
  const apiKey = getApiKey(account);
  const capabilities: AudioCapabilities = {
    provider: "minimax",
    music: Boolean(apiKey),
    tts: Boolean(apiKey),
    voiceClone: Boolean(apiKey),
    asyncJobs: true,
    models: [process.env.MINIMAX_MUSIC_MODEL || "music-3.0", process.env.MINIMAX_TTS_MODEL || "speech-2.8-hd"],
  };
  return {
    name: "minimax",
    isAvailable: (kind) => Boolean(apiKey) && (kind !== "music" || capabilities.music) && (kind !== "tts" || capabilities.tts),
    capabilities: () => capabilities,
    submitMusic: (input) => apiKey ? submitMusic(apiKey, input) : Promise.reject(new Error("PROVIDER_UNAVAILABLE:MINIMAX_API_KEY")),
    submitTTS: (input) => apiKey ? submitTTS(apiKey, input) : Promise.reject(new Error("PROVIDER_UNAVAILABLE:MINIMAX_API_KEY")),
    poll: (providerTaskId, kind) => apiKey ? poll(apiKey, providerTaskId, kind) : Promise.reject(new Error("PROVIDER_UNAVAILABLE:MINIMAX_API_KEY")),
    download: (audioUrl) => downloadAudio(audioUrl, apiKey),
  };
}
