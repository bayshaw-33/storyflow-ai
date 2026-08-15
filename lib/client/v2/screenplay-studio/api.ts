/**
 * KIIKIS V2.2 Screenplay Studio client API — Phase 3 Task 3.3/3.4/3.5.
 * Thin fetch wrappers over /api/v2/works/[workId]/screenplay/*.
 * No local fake success: every call surfaces real service errors.
 */

import type { ScreenplayUnitType } from "../../../contracts/v2/screenplay-studio.ts";

export interface ScreenplayUnitClientDto {
  id: string;
  workId: string;
  type: ScreenplayUnitType;
  parentId: string | null;
  order: number;
  title: string;
  readiness: string;
  currentVersionId: string | null;
  finalizedVersionId: string | null;
  legacyId: string | null;
}

export interface StaleEdgeDto {
  edgeId: string;
  upstreamUnitId: string;
  downstreamUnitId: string;
  referencedVersionId: string;
}

export class ScreenplayStudioApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly currentVersionId?: string;
  constructor(code: string, message: string, status: number, currentVersionId?: string) {
    super(message);
    this.name = "ScreenplayStudioApiError";
    this.code = code;
    this.status = status;
    if (currentVersionId) this.currentVersionId = currentVersionId;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || body.success === false) {
    throw new ScreenplayStudioApiError(
      String(body.code ?? "service_unavailable"),
      String(body.error ?? `Request failed (${response.status}).`),
      response.status,
      body.currentVersionId ? String(body.currentVersionId) : undefined,
    );
  }
  return body as T;
}

export const screenplayStudioApi = {
  listUnits(workId: string) {
    return call<{ units: ScreenplayUnitClientDto[] }>(`/api/v2/works/${encodeURIComponent(workId)}/screenplay`);
  },
  getUnit(workId: string, unitId: string) {
    return call<{ unit: ScreenplayUnitClientDto; content: unknown }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/units/${encodeURIComponent(unitId)}`,
    );
  },
  createUnit(workId: string, body: { type: string; title: string; parentId: string | null; order: number }) {
    // Creation rides on the collection endpoint via POST with parentId in body.
    return call<{ units: ScreenplayUnitClientDto[]; created?: number }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  saveUnitContent(
    workId: string,
    unitId: string,
    body: { content: Record<string, unknown>; baseVersionId: string | null; references?: Array<{ unitId: string | null; unitVersionId: string | null }>; sourceMessageIds?: string[]; idempotencyKey?: string },
  ) {
    return call<{ version: { id: string } }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/units/${encodeURIComponent(unitId)}`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  updateUnitIdentity(workId: string, unitId: string, body: { title?: string; order?: number; parentId?: string | null }) {
    return call<{ unit: ScreenplayUnitClientDto }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/units/${encodeURIComponent(unitId)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
  },
  finalizeUnit(workId: string, unitId: string, versionId: string) {
    return call<{ unit: ScreenplayUnitClientDto }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/units/${encodeURIComponent(unitId)}`,
      { method: "PUT", body: JSON.stringify({ versionId }) },
    );
  },
  listStale(workId: string) {
    return call<{ stale: StaleEdgeDto[] }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/dependencies`,
    );
  },
  recomputeStale(workId: string) {
    return call<{ staleCount: number }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/dependencies`,
      { method: "POST", body: JSON.stringify({ action: "recompute" }) },
    );
  },
  resolveStale(workId: string, body: { upstreamUnitId: string; downstreamUnitId: string; resolution: string; note?: string }) {
    return call<{ resolved: boolean; action: string }>(
      `/api/v2/works/${encodeURIComponent(workId)}/screenplay/dependencies`,
      { method: "POST", body: JSON.stringify({ action: "resolve", ...body }) },
    );
  },
};
