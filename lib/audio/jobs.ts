import { createHash } from "node:crypto";
import type { AudioPollResult } from "./types";

export type AudioJobStatus =
  | "queued"
  | "generating"
  | "result_ingesting"
  | "completed"
  | "failed"
  | "provider_timeout";

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
