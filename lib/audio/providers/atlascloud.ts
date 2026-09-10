import type {
  AudioCapabilities,
  AudioKind,
  AudioPollResult,
  AudioProvider,
  AudioSubmitResult,
  MusicSubmitInput,
  TTSSubmitInput,
} from "../types.ts";
import { downloadAudio, parseProviderStatus, readNestedString, readString, requestJson } from "./helpers.ts";
import { isAtlasCloudMusicModel } from "../music-models.ts";

const DEFAULT_BASE_URL = "https://api.atlascloud.ai";

function apiKey() {
  return process.env.ATLASCLOUD_API_KEY;
}

function baseUrl() {
  return (process.env.ATLASCLOUD_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function musicMode(input: MusicSubmitInput) {
  return input.musicMode || "vocal";
}

function isInstrumentalMode(mode: ReturnType<typeof musicMode>) {
  return mode === "instrumental" || mode === "sfx";
}

const INSTRUMENTAL_ONLY_CONSTRAINT = "Instrumental only. No vocals, no lyrics, no spoken word, no rap, no chant, no choir, no humming, no breathing, no vocal samples, no vocal texture.";

function providerPrompt(input: MusicSubmitInput, mode: ReturnType<typeof musicMode>) {
  return isInstrumentalMode(mode) ? `${input.prompt.trim()}\n${INSTRUMENTAL_ONLY_CONSTRAINT}` : input.prompt;
}

function submitPayload(input: MusicSubmitInput, model: string): Record<string, unknown> {
  const mode = musicMode(input);
  if (model === "minimax/music-3.0") {
    return {
      model,
      prompt: providerPrompt(input, mode),
      ...(mode === "vocal" && input.lyrics ? { lyrics: input.lyrics } : {}),
      lyrics_optimizer: false,
      is_instrumental: isInstrumentalMode(mode),
      format: "mp3",
      sample_rate: 44100,
      bitrate: 256000,
    };
  }

  return {
    model,
    prompt: mode === "vocal" && input.lyrics ? input.lyrics : providerPrompt(input, mode),
    custom: mode === "vocal" && Boolean(input.lyrics),
    instrumental: isInstrumentalMode(mode),
  };
}

function predictionData(data: Record<string, unknown>) {
  return data.data && typeof data.data === "object" && !Array.isArray(data.data)
    ? data.data as Record<string, unknown>
    : data;
}

function predictionId(data: Record<string, unknown>) {
  return readNestedString(data, [["data", "id"], ["data", "request_id"], ["id"], ["request_id"]]);
}

function outputUrl(data: Record<string, unknown>) {
  const direct = readNestedString(data, [
    ["data", "outputs", "0"],
    ["data", "outputs", "0", "url"],
    ["data", "outputs", "0", "audio_url"],
    ["data", "output", "audio_url"],
    ["data", "output", "url"],
    ["data", "urls", "get"],
    ["outputs", "0"],
    ["outputs", "0", "url"],
    ["outputs", "0", "audio_url"],
    ["output", "audio_url"],
    ["output", "url"],
    ["urls", "get"],
    ["data", "audio_url"],
    ["audio_url"],
    ["url"],
  ]);
  if (direct) return direct;
  const payload = predictionData(data);
  for (const key of ["outputs", "output"]) {
    const values = payload[key];
    if (!Array.isArray(values)) continue;
    const first = values[0];
    if (typeof first === "string" && first) return first;
    if (first && typeof first === "object") {
      const value = readNestedString(first, [["url"], ["audio_url"], ["get"]]);
      if (value) return value;
    }
  }
  return undefined;
}

function errorMessage(data: Record<string, unknown>) {
  return readNestedString(data, [["data", "error"], ["error", "message"], ["message"]]) || "ATLAS_CLOUD_AUDIO_FAILED";
}

async function submitMusic(apiKeyValue: string, input: MusicSubmitInput): Promise<AudioSubmitResult> {
  const model = input.model || "minimax/music-3.0";
  if (!isAtlasCloudMusicModel(model)) throw new Error("INVALID_MUSIC_MODEL");
  const data = await requestJson(`${baseUrl()}/api/v1/model/generateAudio`, apiKeyValue, {
    method: "POST",
    body: JSON.stringify(submitPayload(input, model)),
    signal: AbortSignal.timeout(120_000),
  });
  const id = predictionId(data);
  if (!id) throw new Error(`ATLAS_CLOUD_PREDICTION_ID_MISSING:${errorMessage(data)}`);
  return {
    kind: "async_submitted",
    providerTaskId: id,
  };
}

async function poll(apiKeyValue: string, providerTaskId: string): Promise<AudioPollResult> {
  const data = await requestJson(`${baseUrl()}/api/v1/model/prediction/${encodeURIComponent(providerTaskId)}`, apiKeyValue, {
    method: "GET",
    signal: AbortSignal.timeout(120_000),
  });
  const payload = predictionData(data);
  const status = parseProviderStatus(payload.status, readString(data.status));
  if (status === "error") return { status, rawStatus: readString(payload.status), error: errorMessage(data) };
  if (status !== "done") return { status, rawStatus: readString(payload.status) };
  const audioUrl = outputUrl(data);
  return audioUrl
    ? { status: "done", audioUrl, providerMetadata: { provider: "atlascloud", model: readString(payload.model) || "unknown", predictionId: providerTaskId } }
    : { status: "error", error: "ATLAS_CLOUD_AUDIO_RESULT_MISSING" };
}

async function downloadAtlasAudio(audioUrl: string, apiKeyValue: string) {
  const downloaded = await downloadAudio(audioUrl, apiKeyValue);
  if (/text\/html|application\/json/i.test(downloaded.contentType)) {
    throw new Error("AUDIO_DOWNLOAD_INVALID_CONTENT_TYPE");
  }
  return downloaded;
}

export function createAtlasCloudAudioProvider(): AudioProvider {
  const key = apiKey();
  const capabilities: AudioCapabilities = {
    provider: "atlascloud",
    music: Boolean(key),
    tts: false,
    voiceClone: false,
    asyncJobs: true,
    models: ["minimax/music-3.0", "suno/chirp-v5"],
  };
  return {
    name: "atlascloud",
    isAvailable: (kind?: AudioKind) => Boolean(key) && kind !== "tts",
    capabilities: () => capabilities,
    submitMusic: (input) => key ? submitMusic(key, input) : Promise.reject(new Error("PROVIDER_UNAVAILABLE:ATLASCLOUD_API_KEY")),
    submitTTS: async (_input: TTSSubmitInput) => { throw new Error("PROVIDER_UNSUPPORTED:ATLAS_CLOUD_MUSIC_ONLY"); },
    poll: (providerTaskId, kind) => key && kind === "music" ? poll(key, providerTaskId) : Promise.reject(new Error("PROVIDER_UNSUPPORTED:ATLAS_CLOUD_MUSIC_ONLY")),
    download: (audioUrl) => key ? downloadAtlasAudio(audioUrl, key) : Promise.reject(new Error("PROVIDER_UNAVAILABLE:ATLASCLOUD_API_KEY")),
  };
}
