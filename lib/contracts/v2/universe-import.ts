/**
 * KIIKIS V2.2 Universe import contracts — Phase 4 Task 4.1.
 *
 * Out-of-band original works (screenplay PDF/DOCX or bible triplet) are
 * imported into a read-only Source Work and Universe U1. This module defines
 * the session state machine, source roles and SourceLocation shapes.
 *
 * contract_version = 2.2.0-alpha.1 (additive).
 *
 * Persistence-agnostic; no node:crypto (client-safe).
 */

import { KIIKIS_22_CONTRACT_VERSION } from "./work-history.ts";

export { KIIKIS_22_CONTRACT_VERSION };

export const UNIVERSE_IMPORT_SESSION_V1_SCHEMA = "kiikis.universe-import/1" as const;

export const IMPORT_MODES = ["complete_screenplay", "bible_triplet"] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export const IMPORT_STATES = [
  "upload_draft",
  "uploaded",
  "extracting",
  "review_required",
  "degraded",
  "ready_for_u1",
  "u1_ready",
  "failed",
  "cancelled",
] as const;
export type ImportState = (typeof IMPORT_STATES)[number];

export const SOURCE_ROLES = [
  "screenplay",
  "world_bible",
  "character_bible",
  "plot_outline",
  "supplement",
] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

/** Primary file formats accepted for main roles (Phase 4 scope: no OCR). */
export const PRIMARY_FILE_EXTENSIONS = [".pdf", ".docx", ".doc", ".md", ".txt"] as const;

/** Supplement-only formats: never satisfy mode requirements. */
export const SUPPLEMENT_EXTENSIONS = [".json", ".html", ".csv", ".xlsx"] as const;

export class UniverseImportContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UniverseImportContractError";
  }
}

export interface SourceLocation {
  fileId: string;
  page?: number;
  section?: string;
  episode?: number;
  scene?: number;
  startOffset: number;
  endOffset: number;
  sourceHash: string;
}

const HASH_RE = /^[0-9a-f]{64}$/;

export function assertSourceLocation(input: unknown): asserts input is SourceLocation {
  if (!input || typeof input !== "object") {
    throw new UniverseImportContractError("SourceLocation must be an object.");
  }
  const loc = input as Record<string, unknown>;
  if (typeof loc.fileId !== "string" || !loc.fileId) {
    throw new UniverseImportContractError("SourceLocation.fileId must be a non-empty string.");
  }
  if (typeof loc.startOffset !== "number" || typeof loc.endOffset !== "number") {
    throw new UniverseImportContractError("SourceLocation offsets must be numbers.");
  }
  if (loc.startOffset < 0 || loc.endOffset < loc.startOffset) {
    throw new UniverseImportContractError(`SourceLocation range invalid: [${loc.startOffset}, ${loc.endOffset}).`);
  }
  if (typeof loc.sourceHash !== "string" || !HASH_RE.test(loc.sourceHash)) {
    throw new UniverseImportContractError("SourceLocation.sourceHash must be a sha-256 hex string.");
  }
  for (const key of ["page", "episode", "scene"] as const) {
    if (loc[key] !== undefined && typeof loc[key] !== "number") {
      throw new UniverseImportContractError(`SourceLocation.${key} must be a number when present.`);
    }
  }
  if (loc.section !== undefined && typeof loc.section !== "string") {
    throw new UniverseImportContractError("SourceLocation.section must be a string when present.");
  }
}

export function isImportMode(value: unknown): value is ImportMode {
  return typeof value === "string" && (IMPORT_MODES as readonly string[]).includes(value);
}

export function isImportState(value: unknown): value is ImportState {
  return typeof value === "string" && (IMPORT_STATES as readonly string[]).includes(value);
}

export function isSourceRole(value: unknown): value is SourceRole {
  return typeof value === "string" && (SOURCE_ROLES as readonly string[]).includes(value);
}

function extensionOf(filename: string): string {
  const at = filename.lastIndexOf(".");
  return at < 0 ? "" : filename.slice(at).toLowerCase();
}

export function isPrimaryExtension(ext: string): boolean {
  return (PRIMARY_FILE_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}

export function isSupplementExtension(ext: string): boolean {
  return (SUPPLEMENT_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}

/**
 * Validate that a declared role is legal for the filename's format:
 * primary roles require primary extensions; supplements accept the
 * supplement whitelist. Everything else is rejected.
 */
export function roleForFilename(filename: string, declared: string): SourceRole {
  if (!isSourceRole(declared)) {
    throw new UniverseImportContractError(`Unknown source role: ${declared}.`);
  }
  const ext = extensionOf(filename);
  if (declared === "supplement") {
    if (!isSupplementExtension(ext) && !isPrimaryExtension(ext)) {
      throw new UniverseImportContractError(`Unsupported file format for supplement: ${ext || "(none)"}.`);
    }
    return "supplement";
  }
  if (!isPrimaryExtension(ext)) {
    throw new UniverseImportContractError(
      `Primary role ${declared} requires one of ${PRIMARY_FILE_EXTENSIONS.join("/")}; got ${ext || "(none)"}.`,
    );
  }
  return declared as SourceRole;
}
