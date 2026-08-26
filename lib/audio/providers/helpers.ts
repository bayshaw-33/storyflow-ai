import type { AudioPollResult } from "../types";

export async function requestJson(
  url: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body === "object" && body !== null ? JSON.stringify(body).slice(0, 240) : "";
    const code = response.status === 401 || response.status === 403 ? "PROVIDER_UNAVAILABLE" : response.status === 429 ? "PROVIDER_TIMEOUT" : "PROVIDER_CALL_FAILED";
    throw new Error(`${code}:${response.status}:${detail}`);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("PROVIDER_INVALID_RESPONSE");
  }
  return body as Record<string, unknown>;
}

export function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readNestedString(root: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    let value: unknown = root;
    for (const key of path) {
      if (!value || typeof value !== "object") {
        value = undefined;
        break;
      }
      value = Array.isArray(value)
        ? value[Number(key)]
        : (value as Record<string, unknown>)[key];
    }
    const result = readString(value);
    if (result) return result;
  }
  return undefined;
}

export function decodeHexAudio(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "").replace(/\s+/g, "");
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) {
    throw new Error("PROVIDER_INVALID_AUDIO_HEX");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function parseProviderStatus(status: unknown, raw?: string): AudioPollResult["status"] {
  const normalized = String(status || raw || "").toLowerCase();
  if (["success", "succeeded", "completed", "done"].includes(normalized)) return "done";
  if (["failed", "error", "expired", "cancelled", "canceled"].includes(normalized)) return "error";
  if (["processing", "running", "generating"].includes(normalized)) return "running";
  return "queued";
}

export async function downloadAudio(url: string, apiKey?: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`AUDIO_DOWNLOAD_HTTP_${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error("AUDIO_DOWNLOAD_EMPTY");
  return { bytes, contentType: response.headers.get("content-type") || "audio/mpeg" };
}
