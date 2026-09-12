import type {
  TTSProvider,
  TTSSubmitInput,
  TTSSubmitResult,
} from "../provider";

export type ElevenLabsVoice = {
  voiceId: string;
  name: string;
  category: string | null;
  description: string | null;
  labels: Record<string, string>;
  previewUrl: string | null;
  verifiedLanguages: Array<Record<string, unknown>>;
  isOwner: boolean;
  voiceType: string | null;
};

export type ElevenLabsVoicePage = {
  voices: ElevenLabsVoice[];
  hasMore: boolean;
  nextPageToken: string | null;
};

export type ElevenLabsVoiceListInput = {
  pageSize?: number;
  search?: string;
  pageToken?: string;
};

export type ElevenLabsVoiceCloneInput = {
  name: string;
  file: Blob;
  description?: string;
  removeBackgroundNoise?: boolean;
};

export type ElevenLabsSharedVoiceListInput = {
  pageSize?: number;
  search?: string;
  language?: string;
  gender?: string;
  page?: number;
};

export type ElevenLabsVoiceProvider = TTSProvider & {
  listVoices(input?: ElevenLabsVoiceListInput): Promise<ElevenLabsVoicePage>;
  listSharedVoices(input?: ElevenLabsSharedVoiceListInput): Promise<ElevenLabsVoicePage>;
  createVoiceClone(input: ElevenLabsVoiceCloneInput): Promise<{ voiceId: string; requiresVerification: boolean }>;
};

export class ElevenLabsProviderError extends Error {
  readonly code: "unauthorized" | "service_unavailable" | "validation_failed" | "empty_response" | "network";

  constructor(
    code: ElevenLabsProviderError["code"],
    message: string,
  ) {
    super(message);
    this.name = "ElevenLabsProviderError";
    this.code = code;
  }
}

export type ElevenLabsProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  outputFormat?: string;
  fetchImpl?: typeof fetch;
};

type ElevenLabsVoicePageResponse = {
  voices?: Array<Record<string, unknown>>;
  has_more?: boolean;
  next_page_token?: string | null;
};

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function queryValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function mapVoice(raw: Record<string, unknown>, fallbackType: string | null = null): ElevenLabsVoice {
  const labels = raw.labels && typeof raw.labels === "object"
    ? Object.fromEntries(
        Object.entries(raw.labels as Record<string, unknown>)
          .filter(([, value]) => typeof value === "string")
          .map(([key, value]) => [key, value as string]),
      )
    : {};
  const verifiedLanguages = Array.isArray(raw.verified_languages)
    ? raw.verified_languages.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    : [];

  return {
    voiceId: typeof raw.voice_id === "string" ? raw.voice_id : "",
    name: typeof raw.name === "string" ? raw.name : "未命名音色",
    category: typeof raw.category === "string" ? raw.category : null,
    description: typeof raw.description === "string" ? raw.description : null,
    labels,
    previewUrl: typeof raw.preview_url === "string" ? raw.preview_url : null,
    verifiedLanguages,
    isOwner: raw.is_owner === true,
    voiceType: typeof raw.voice_type === "string" ? raw.voice_type : fallbackType,
  };
}

export function createElevenLabsTTSProvider(
  options: ElevenLabsProviderOptions = {},
): ElevenLabsVoiceProvider {
  const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY ?? "";
  const baseUrl = (options.baseUrl || process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/$/, "");
  const model = options.model || process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";
  const outputFormat = options.outputFormat || process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);

  async function requestJson<T>(path: string): Promise<T> {
    if (!apiKey) throw new ElevenLabsProviderError("unauthorized", "ElevenLabs API Key 未配置。");
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "xi-api-key": apiKey,
        },
      });
      if (response.status === 401 || response.status === 403) {
        throw new ElevenLabsProviderError("unauthorized", `ElevenLabs 鉴权失败（${response.status}）。`);
      }
      if (!response.ok) {
        throw new ElevenLabsProviderError("service_unavailable", `ElevenLabs 请求失败（${response.status}）。`);
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof ElevenLabsProviderError) throw error;
      throw new ElevenLabsProviderError("network", "ElevenLabs 服务暂时无法访问。");
    }
  }

  async function listVoices(input: ElevenLabsVoiceListInput = {}): Promise<ElevenLabsVoicePage> {
    const params = new URLSearchParams();
    params.set("page_size", String(Math.min(100, Math.max(1, Math.floor(input.pageSize ?? 30)))));
    const search = queryValue(input.search);
    const pageToken = queryValue(input.pageToken);
    if (search) params.set("search", search);
    if (pageToken) params.set("next_page_token", pageToken);
    const data = await requestJson<ElevenLabsVoicePageResponse>(`/v2/voices?${params.toString()}`);
    return {
      voices: (data.voices ?? []).map((voice) => mapVoice(voice)),
      hasMore: data.has_more === true,
      nextPageToken: typeof data.next_page_token === "string" ? data.next_page_token : null,
    };
  }

  async function listSharedVoices(input: ElevenLabsSharedVoiceListInput = {}): Promise<ElevenLabsVoicePage> {
    const params = new URLSearchParams();
    params.set("page_size", String(Math.min(100, Math.max(1, Math.floor(input.pageSize ?? 30)))));
    params.set("page", String(Math.max(0, Math.floor(input.page ?? 0))));
    const search = queryValue(input.search);
    const language = queryValue(input.language);
    const gender = queryValue(input.gender);
    if (search) params.set("search", search);
    if (language) params.set("language", language);
    if (gender) params.set("gender", gender);
    const data = await requestJson<ElevenLabsVoicePageResponse>(`/v1/shared-voices?${params.toString()}`);
    return {
      voices: (data.voices ?? []).map((voice) => mapVoice(voice, "community")),
      hasMore: data.has_more === true,
      nextPageToken: data.has_more === true ? String(Math.floor(input.page ?? 0) + 1) : null,
    };
  }

  async function createVoiceClone(input: ElevenLabsVoiceCloneInput): Promise<{ voiceId: string; requiresVerification: boolean }> {
    if (!apiKey) throw new ElevenLabsProviderError("unauthorized", "ElevenLabs API Key 未配置。");
    if (!input.name.trim() || !input.file || input.file.size === 0) {
      throw new ElevenLabsProviderError("validation_failed", "音色名称和有效音频文件不能为空。");
    }
    const form = new FormData();
    form.set("name", input.name.trim());
    if (input.description?.trim()) form.set("description", input.description.trim());
    form.set("remove_background_noise", String(input.removeBackgroundNoise === true));
    form.append("files", input.file, input.file instanceof File && input.file.name ? input.file.name : "voice-sample");
    try {
      const response = await fetchImpl(`${baseUrl}/v1/voices/add`, {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
      });
      if (response.status === 401 || response.status === 403) {
        throw new ElevenLabsProviderError("unauthorized", `ElevenLabs 鉴权失败（${response.status}）。`);
      }
      if (!response.ok) {
        throw new ElevenLabsProviderError("service_unavailable", `ElevenLabs 音色创建失败（${response.status}）。`);
      }
      const data = await response.json() as { voice_id?: string; requires_verification?: boolean };
      if (!data.voice_id) throw new ElevenLabsProviderError("service_unavailable", "ElevenLabs 未返回音色 ID。");
      return { voiceId: data.voice_id, requiresVerification: data.requires_verification === true };
    } catch (error) {
      if (error instanceof ElevenLabsProviderError) throw error;
      throw new ElevenLabsProviderError("network", "ElevenLabs 音色创建请求失败。");
    }
  }

  return {
    name: "elevenlabs",
    isAvailable: () => Boolean(apiKey),
    listVoices,
    listSharedVoices,
    createVoiceClone,
    async submit(input: TTSSubmitInput): Promise<TTSSubmitResult> {
      if (!apiKey) throw new ElevenLabsProviderError("unauthorized", "ElevenLabs API Key 未配置。");
      const voiceId = input.voiceProviderVoiceId?.trim();
      if (!voiceId) throw new ElevenLabsProviderError("validation_failed", "必须选择 ElevenLabs 音色。");

      const params = new URLSearchParams({ output_format: outputFormat });
      const speed = clamp(input.speed, 0.7, 1.2, 1);
      const stability = clamp(input.stability, 0, 1, 0.5);
      const response = await (async () => {
        try {
          return await fetchImpl(`${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}?${params.toString()}`, {
            method: "POST",
            headers: {
              Accept: "audio/mpeg",
              "Content-Type": "application/json",
              "xi-api-key": apiKey,
            },
            body: JSON.stringify({
              text: input.text,
              model_id: model,
              voice_settings: {
                stability,
                similarity_boost: 0.75,
                style: 0,
                use_speaker_boost: true,
                speed,
              },
            }),
            signal: AbortSignal.timeout(120_000),
          });
        } catch (error) {
          throw new ElevenLabsProviderError("network", "ElevenLabs 配音请求失败。");
        }
      })();

      if (response.status === 401 || response.status === 403) {
        throw new ElevenLabsProviderError("unauthorized", `ElevenLabs 鉴权失败（${response.status}）。`);
      }
      if (!response.ok) {
        throw new ElevenLabsProviderError("service_unavailable", `ElevenLabs 配音失败（${response.status}）。`);
      }

      const audioBytes = new Uint8Array(await response.arrayBuffer());
      if (audioBytes.byteLength === 0) {
        throw new ElevenLabsProviderError("empty_response", "ElevenLabs 返回了空音频。");
      }

      return {
        kind: "sync_done",
        audioBytes,
        contentType: response.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
        providerMetadata: {
          provider: "elevenlabs",
          model,
          voiceId,
          outputFormat,
          byteLength: audioBytes.byteLength,
        },
      };
    },
  };
}
