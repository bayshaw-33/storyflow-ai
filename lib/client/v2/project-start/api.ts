"use client";

/**
 * KIIKIS V2.2 project-start client API.
 *
 * Replaces the K2-T-03 fixture-based createProject. The new `startProject`
 * always calls POST /api/v2/project-start with the auth token; there is no
 * fixture fallback (PRD §17.1: staging/production must not use fixture as
 * default source of truth).
 */

import {
  isWorkType,
  WORK_CONTRACT_VERSION,
  type WorkType,
} from "../../../contracts/v2/work.ts";
import type {
  ProjectStartRequest,
  ProjectStartResponse,
  ProjectStartErrorBody,
  ProjectStartErrorCode,
} from "./types";

export class ProjectStartClientError extends Error {
  readonly code: ProjectStartErrorCode;
  readonly correlationId?: string;
  readonly status: number;

  constructor(
    code: ProjectStartErrorCode,
    message: string,
    status: number,
    correlationId?: string,
  ) {
    super(message);
    this.name = "ProjectStartClientError";
    this.code = code;
    this.status = status;
    this.correlationId = correlationId;
  }
}

export interface StartProjectOptions {
  workType: WorkType;
  authToken: string;
  idempotencyKey: string;
  title?: string;
  universeId?: string | null;
  signal?: AbortSignal;
}

/**
 * Calls POST /api/v2/project-start to atomically create a Project and its
 * primary Work. Returns the server-generated workbenchRoute.
 *
 * The client never sends ownerId; identity is derived from authToken.
 * Idempotency-Key is sent so duplicate clicks do not create two projects.
 */
export async function startProject(
  options: StartProjectOptions,
): Promise<ProjectStartResponse> {
  if (!options.authToken) {
    throw new ProjectStartClientError(
      "unauthenticated",
      "Authentication is required.",
      401,
    );
  }
  if (!options.idempotencyKey) {
    throw new ProjectStartClientError(
      "validation_failed",
      "Idempotency key is required.",
      0,
    );
  }
  if (!isWorkType(options.workType)) {
    throw new ProjectStartClientError(
      "validation_failed",
      `Unsupported work type: ${String(options.workType)}`,
      0,
    );
  }

  const body: ProjectStartRequest = {
    workType: options.workType,
  };
  if (options.title && options.title.trim()) {
    body.title = options.title.trim();
  }
  if (options.universeId) {
    body.universeId = options.universeId;
  }

  let response: Response;
  try {
    response = await fetch("/api/v2/project-start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.authToken}`,
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    throw new ProjectStartClientError(
      "service_unavailable",
      err instanceof Error ? err.message : "Network error.",
      0,
    );
  }

  if (response.status === 204 || response.status === 205) {
    throw new ProjectStartClientError(
      "service_unavailable",
      "Empty response from server.",
      response.status,
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new ProjectStartClientError(
      "service_unavailable",
      "Invalid JSON response from server.",
      response.status,
    );
  }

  if (!response.ok) {
    const errBody = payload as Partial<ProjectStartErrorBody>;
    throw new ProjectStartClientError(
      (errBody.code as ProjectStartErrorCode) || "service_unavailable",
      errBody.error || "Project start failed.",
      response.status,
      errBody.correlationId,
    );
  }

  const data = payload as ProjectStartResponse;
  if (!data || data.contractVersion !== WORK_CONTRACT_VERSION) {
    throw new ProjectStartClientError(
      "invalid_contract_version",
      `Unexpected contract version: ${String(data?.contractVersion)}`,
      response.status,
    );
  }
  if (!data.projectId || !data.work?.id || !data.workbenchRoute) {
    throw new ProjectStartClientError(
      "service_unavailable",
      "Incomplete project start response.",
      response.status,
    );
  }
  return data;
}
