/**
 * KIIKIS V2.2 Universe import client API — Phase 4 Task 4.4.
 */

import type { ImportMode, ImportState, SourceRole } from "../../../contracts/v2/universe-import.ts";

export interface ImportSessionDto {
  id: string;
  mode: ImportMode;
  state: ImportState;
  rightsDeclaration: Record<string, unknown>;
  degradedReason: string | null;
  sourceWorkId: string | null;
  universeId: string | null;
  files: Array<{
    id: string;
    role: SourceRole;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    contentHash: string;
    persisted: boolean;
  }>;
}

export interface ImportCandidateDto {
  id: string;
  kind: "entity" | "fact" | "relationship" | "timeline_event" | "conflict";
  payload: Record<string, unknown>;
  locations: Array<{
    fileId: string;
    page?: number;
    startOffset: number;
    endOffset: number;
    sourceHash: string;
  }>;
  confidence: number;
  status: string;
}

export class UniverseImportApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "UniverseImportApiError";
    this.code = code;
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || body.success === false) {
    throw new UniverseImportApiError(
      String(body.code ?? "service_unavailable"),
      String(body.error ?? `Request failed (${response.status}).`),
      response.status,
    );
  }
  return body as T;
}

export const universeImportApi = {
  listSessions(includeFinished = false) {
    return call<{ sessions: ImportSessionDto[] }>(`/api/v2/universe-imports${includeFinished ? "?includeFinished=1" : ""}`);
  },
  createSession(mode: ImportMode, rightsDeclaration: Record<string, unknown>) {
    return call<{ session: ImportSessionDto }>("/api/v2/universe-imports", {
      method: "POST",
      body: JSON.stringify({ mode, rightsDeclaration }),
    });
  },
  getSession(sessionId: string) {
    return call<{ session: ImportSessionDto }>(`/api/v2/universe-imports/${encodeURIComponent(sessionId)}`);
  },
  attachFile(sessionId: string, body: { filename: string; declaredRole: SourceRole; mimeType: string; sizeBytes: number; contentHash?: string }) {
    return call<{ file: ImportSessionDto["files"][number]; duplicate: boolean }>(
      `/api/v2/universe-imports/${encodeURIComponent(sessionId)}/files`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  confirmUpload(sessionId: string, fileId: string) {
    return call<{ file: ImportSessionDto["files"][number] }>(
      `/api/v2/universe-imports/${encodeURIComponent(sessionId)}/files`,
      { method: "PATCH", body: JSON.stringify({ fileId }) },
    );
  },
  startExtraction(sessionId: string) {
    return call<{ state: ImportState; pendingJob: boolean }>(
      `/api/v2/universe-imports/${encodeURIComponent(sessionId)}/start`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },
  cancelSession(sessionId: string) {
    return call<{ state: ImportState }>(
      `/api/v2/universe-imports/${encodeURIComponent(sessionId)}/start`,
      { method: "POST", body: JSON.stringify({ action: "cancel" }) },
    );
  },
};
