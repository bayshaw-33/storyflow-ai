/**
 * KIIKIS V2.2 project-start client types.
 *
 * Replaces the K2-T-03 fixture-era types. V2.2 entry is an 8-module grid with
 * no free-text input, no novel, no fixture fallback (PRD §5.1).
 *
 * contract_version = 2.2.0-alpha.1.
 */

import type { WorkType, WorkContractVersion } from "../../../contracts/v2/work.ts";

export { WORK_CONTRACT_VERSION } from "../../../contracts/v2/work.ts";

export type { WorkType } from "../../../contracts/v2/work.ts";

/**
 * Request body for POST /api/v2/project-start.
 * The client MUST NOT send ownerId — identity comes from the auth token.
 * Title is optional; server falls back to DEFAULT_WORK_TITLES.
 */
export interface ProjectStartRequest {
  workType: WorkType;
  title?: string;
  universeId?: string | null;
}

/**
 * Successful response from POST /api/v2/project-start.
 * workbenchRoute is generated server-side; clients must use it as-is.
 */
export interface ProjectStartResponse {
  contractVersion: WorkContractVersion;
  projectId: string;
  work: {
    id: string;
    workType: WorkType;
    title: string;
  };
  workbenchRoute: string;
}

/**
 * Error body returned by the server.
 */
export interface ProjectStartErrorBody {
  success: false;
  error: string;
  code: ProjectStartErrorCode;
  correlationId?: string;
}

export type ProjectStartErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "validation_failed"
  | "conflict"
  | "service_unavailable"
  | "invalid_contract_version";
