/**
 * Candidate extraction & merge — Phase 4 Task 4.3.
 *
 * extractCandidatesFromChunk: converts model output for one chunk into
 * candidates of kind entity|fact|relationship|timeline_event|conflict, each
 * with at least one SourceLocation pointing into the original file.
 *
 * mergeCandidates: same-kind + same-normalized-payload candidates merge into
 * one (union of locations, union of merged_from provenance).
 *
 * assessQuality: coverage / required-kind / parse gates → degraded reasons.
 */

import type { SourceChunk } from "./chunker.ts";

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

export type CandidateKind = "entity" | "fact" | "relationship" | "timeline_event" | "conflict";

export interface ImportCandidate {
  kind: CandidateKind;
  payload: Record<string, unknown>;
  locations: SourceLocation[];
  confidence: number;
  idempotencyKey: string;
  mergedFrom: string[];
}

export interface ModelChunkOutput {
  entities: Array<{ name: string; type?: string }>;
  facts: Array<{ statement: string }>;
  relationships: Array<{ from: string; to: string; relation: string }>;
  timeline_events: Array<{ episode?: number; event: string }>;
  conflicts: Array<{ description: string }>;
}

function assertModelOutput(raw: unknown): asserts raw is ModelChunkOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("模型输出无法解析（不是对象）");
  }
  const o = raw as Record<string, unknown>;
  for (const key of ["entities", "facts", "relationships", "timeline_events", "conflicts"]) {
    if (!Array.isArray(o[key])) {
      throw new Error(`模型输出无法解析：缺少 ${key} 数组`);
    }
  }
}

function locate(chunk: SourceChunk, needle: string, sourceHash: string): SourceLocation {
  const at = chunk.content.indexOf(needle);
  const start = at < 0 ? chunk.startOffset : chunk.startOffset + at;
  return {
    fileId: chunk.fileId,
    page: chunk.page ?? undefined,
    startOffset: start,
    endOffset: start + Math.max(needle.length, 1),
    sourceHash,
  };
}

export function extractCandidatesFromChunk(
  chunk: SourceChunk,
  modelOutput: unknown,
  sourceHash: string,
): ImportCandidate[] {
  assertModelOutput(modelOutput);
  const out = modelOutput;
  const candidates: ImportCandidate[] = [];

  for (const e of out.entities) {
    if (!e?.name) continue;
    candidates.push({
      kind: "entity",
      payload: { name: e.name, entityType: e.type ?? "character" },
      locations: [locate(chunk, e.name, sourceHash)],
      confidence: 0.7,
      idempotencyKey: `${chunk.idempotencyKey}:entity:${e.name}`,
      mergedFrom: [],
    });
  }
  for (const f of out.facts) {
    if (!f?.statement) continue;
    candidates.push({
      kind: "fact",
      payload: { statement: f.statement },
      locations: [locate(chunk, f.statement.slice(0, 12), sourceHash)],
      confidence: 0.6,
      idempotencyKey: `${chunk.idempotencyKey}:fact:${hashText(f.statement)}`,
      mergedFrom: [],
    });
  }
  for (const r of out.relationships) {
    if (!r?.from || !r?.to) continue;
    candidates.push({
      kind: "relationship",
      payload: { from: r.from, to: r.to, relation: r.relation ?? "关联" },
      locations: [locate(chunk, r.from, sourceHash)],
      confidence: 0.6,
      idempotencyKey: `${chunk.idempotencyKey}:rel:${r.from}:${r.to}`,
      mergedFrom: [],
    });
  }
  for (const t of out.timeline_events) {
    if (!t?.event) continue;
    candidates.push({
      kind: "timeline_event",
      payload: { episode: t.episode ?? null, event: t.event },
      locations: [locate(chunk, t.event.slice(0, 12), sourceHash)],
      confidence: 0.6,
      idempotencyKey: `${chunk.idempotencyKey}:timeline:${hashText(t.event)}`,
      mergedFrom: [],
    });
  }
  for (const c of out.conflicts) {
    if (!c?.description) continue;
    candidates.push({
      kind: "conflict",
      payload: { description: c.description },
      locations: [locate(chunk, c.description.slice(0, 12), sourceHash)],
      confidence: 0.5,
      idempotencyKey: `${chunk.idempotencyKey}:conflict:${hashText(c.description)}`,
      mergedFrom: [],
    });
  }
  return candidates;
}

import { createHash } from "node:crypto";
function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Normalize payload for duplicate detection. */
function dedupeKey(cand: ImportCandidate): string {
  switch (cand.kind) {
    case "entity":
      return `entity:${String(cand.payload.name ?? "")}`;
    case "relationship":
      return `rel:${String(cand.payload.from ?? "")}:${String(cand.payload.to ?? "")}`;
    case "fact":
      return `fact:${hashText(String(cand.payload.statement ?? ""))}`;
    case "timeline_event":
      return `timeline:${String(cand.payload.episode ?? "")}:${hashText(String(cand.payload.event ?? ""))}`;
    case "conflict":
      return `conflict:${hashText(String(cand.payload.description ?? ""))}`;
    default:
      return `${cand.kind}:${JSON.stringify(cand.payload)}`;
  }
}

export function mergeCandidates(candidates: ImportCandidate[]): ImportCandidate[] {
  const byKey = new Map<string, ImportCandidate>();
  for (const cand of candidates) {
    const key = dedupeKey(cand);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...cand, locations: [...cand.locations] });
      continue;
    }
    // union locations (dedupe by offset)
    const seenOffsets = new Set(existing.locations.map((l) => `${l.fileId}:${l.startOffset}`));
    for (const loc of cand.locations) {
      if (!seenOffsets.has(`${loc.fileId}:${loc.startOffset}`)) {
        existing.locations.push(loc);
        seenOffsets.add(`${loc.fileId}:${loc.startOffset}`);
      }
    }
    existing.mergedFrom.push(cand.idempotencyKey);
    existing.confidence = Math.max(existing.confidence, cand.confidence);
  }
  return [...byKey.values()];
}

export interface QualityInput {
  totalChunks: number;
  coveredChunks: number;
  candidatesByKind: Record<string, number>;
}

export function assessQuality(input: QualityInput): { passed: boolean; reason: string } {
  if (input.totalChunks > 0 && input.coveredChunks < input.totalChunks) {
    const tailMissing = input.totalChunks - input.coveredChunks;
    if (input.coveredChunks / input.totalChunks < 0.95) {
      return { passed: false, reason: `来源覆盖不足：${input.coveredChunks}/${input.totalChunks} 块已提取（缺尾部 ${tailMissing} 块）。` };
    }
  }
  // Required kinds for U1: entities and relationships must exist.
  for (const kind of ["entity", "relationship"]) {
    if (!(input.candidatesByKind[kind] > 0)) {
      return { passed: false, reason: `必需候选类型为空：${kind}。` };
    }
  }
  return { passed: true, reason: "" };
}
