import { createHash } from "node:crypto";
import type { AudioPollResult } from "./types";

export type AudioJobStatus =
  | "queued"
  | "generating"
  | "reconciling"
  | "result_ingesting"
  | "completed"
  | "failed"
  | "provider_timeout";

export type AudioProviderFailure = {
  status: Extract<AudioJobStatus, "failed" | "provider_timeout" | "reconciling">;
  code: "PROVIDER_TIMEOUT" | "PROVIDER_TEMPORARY_ERROR" | "PROVIDER_CALL_FAILED" | "GMI_SUBMIT_UNCONFIRMED";
  safeMessage: string;
  internalMessage: string;
};

export function classifyAudioProviderError(error: unknown): AudioProviderFailure {
  const internalMessage = (error instanceof Error ? error.message : "AUDIO_PROVIDER_FAILED").slice(0, 300);
  if (/GMI_SUBMIT_UNCONFIRMED/i.test(internalMessage)) {
    return {
      status: "reconciling",
      code: "GMI_SUBMIT_UNCONFIRMED",
      safeMessage: "任务已送达，正在确认生成编号。完成后会自动更新。",
      internalMessage,
    };
  }
  if (/timeout|timed out|aborted/i.test(internalMessage)) {
    return {
      status: "provider_timeout",
      code: "PROVIDER_TIMEOUT",
      safeMessage: "音频服务响应超时，本次任务未确认提交。请稍后手动重试。",
      internalMessage,
    };
  }
  if (/internal error|temporar(?:y|ily)|overload|unavailable/i.test(internalMessage)) {
    return {
      status: "failed",
      code: "PROVIDER_TEMPORARY_ERROR",
      safeMessage: "音频模型服务暂时异常，请稍后重试。",
      internalMessage,
    };
  }
  return {
    status: "failed",
    code: "PROVIDER_CALL_FAILED",
    safeMessage: "音频生成提交失败，请稍后重试。",
    internalMessage,
  };
}

export function mapAudioPollToJobStatus(result: AudioPollResult): AudioJobStatus {
  if (result.status === "queued") return "queued";
  if (result.status === "running") return "generating";
  if (result.status === "done") return "result_ingesting";
  const error = `${result.error || ""} ${result.rawStatus || ""}`.toLowerCase();
  return error.includes("timeout") || error.includes("expired") ? "provider_timeout" : "failed";
}

export function isAudioJobTerminal(status: AudioJobStatus): boolean {
  return status === "completed" || status === "failed" || status === "provider_timeout";
}

export function computeAudioIdempotencyHash(input: {
  ownerId: string;
  kind: "music" | "tts";
  targetId: string;
  text: string;
  provider: string;
  model: string;
}): string {
  return createHash("sha256")
    .update([input.ownerId, input.kind, input.targetId, input.text, input.provider, input.model].join("\u0001"))
    .digest("hex");
}

export function sanitizeAudioMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...metadata };
  delete copy.providerTempUrl;
  delete copy.audioUrl;
  delete copy.downloadUrl;
  delete copy.url;
  return copy;
}
