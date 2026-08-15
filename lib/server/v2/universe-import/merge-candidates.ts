/**
 * Candidate merge pipeline — Phase 4 Task 4.3 Step 4/5.
 *
 * Runs over all chunks of a session: extract (idempotent per chunk) →
 * merge duplicates (keep all source locations) → quality gate. Intended to
 * be driven by a background Job that writes Job Events per stage.
 */

import {
  extractCandidatesFromChunk,
  mergeCandidates,
  assessQuality,
  type ImportCandidate,
  type ModelChunkOutput,
} from "./extraction.ts";
import type { SourceChunk } from "./chunker.ts";

export interface ExtractStageResult {
  candidates: ImportCandidate[];
  quality: { passed: boolean; reason: string };
  extractedChunks: number;
}

export function runExtractionPipeline(
  chunks: SourceChunk[],
  modelOutputFor: (chunk: SourceChunk) => ModelChunkOutput,
  sourceHash: string,
): ExtractStageResult {
  const all: ImportCandidate[] = [];
  let covered = 0;
  const errors: string[] = [];
  for (const chunk of chunks) {
    try {
      const output = modelOutputFor(chunk);
      all.push(...extractCandidatesFromChunk(chunk, output, sourceHash));
      covered += 1;
    } catch (error) {
      errors.push(`${chunk.id}: ${error instanceof Error ? error.message : "extraction failed"}`);
    }
  }
  const merged = mergeCandidates(all);
  const byKind: Record<string, number> = {};
  for (const cand of merged) byKind[cand.kind] = (byKind[cand.kind] ?? 0) + 1;
  const quality = assessQuality({ totalChunks: chunks.length, coveredChunks: covered, candidatesByKind: byKind });
  if (errors.length && quality.passed) {
    // partial failures that still pass gates are surfaced but not fatal
    quality.reason = `提示：${errors.length} 个分块提取失败（已跳过）。`;
  }
  return { candidates: merged, quality, extractedChunks: covered };
}
