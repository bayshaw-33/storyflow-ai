/**
 * Deterministic chunker — Phase 4 Task 4.3.
 *
 * Priority: scene/episode boundaries (heading blocks) start new chunks;
 * token-budget fallback splits long runs; every chunk records offsets and
 * overlap content from both neighbors so cross-boundary references survive.
 */

import type { ParsedDocument, ParsedBlock } from "./parsers/text.ts";

export interface SourceChunk {
  id: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
  page: number | null;
  overlapBefore: string;
  overlapAfter: string;
  idempotencyKey: string;
}

export interface ChunkOptions {
  tokenBudget: number;
  overlapTokens: number;
}

/** Rough CJK-friendly token estimate: 1 token ≈ 1.6 chars. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 1.6);
}

function overlapText(blocks: ParsedBlock[], tokens: number, fromEnd: boolean): string {
  const picked: ParsedBlock[] = [];
  let used = 0;
  const iter = fromEnd ? [...blocks].reverse() : blocks;
  for (const block of iter) {
    const t = estimateTokens(block.text);
    if (used + t > tokens) break;
    picked.push(block);
    used += t;
  }
  if (fromEnd) picked.reverse();
  return picked.map((b) => b.text).join("\n");
}

export function chunkDocument(
  doc: ParsedDocument,
  options: ChunkOptions,
  fileId = "file-001",
): SourceChunk[] {
  const chunks: SourceChunk[] = [];
  let current: ParsedBlock[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (!current.length) return;
    const start = current[0].startOffset;
    const end = current[current.length - 1].endOffset;
    const index = chunks.length;
    chunks.push({
      id: `${fileId}:chunk:${index}:${start}`,
      fileId,
      chunkIndex: index,
      content: current.map((b) => b.text).join("\n"),
      startOffset: start,
      endOffset: end,
      page: current[0].page ?? null,
      overlapBefore: "",
      overlapAfter: "",
      idempotencyKey: `${fileId}:${start}:${end}`,
    });
    current = [];
    currentTokens = 0;
  };

  for (const block of doc.blocks) {
    const isBoundary = Boolean(block.heading);
    const blockTokens = estimateTokens(block.text);
    if (isBoundary && current.length) {
      flush();
    }
    if (currentTokens + blockTokens > options.tokenBudget && current.length) {
      flush();
    }
    current.push(block);
    currentTokens += blockTokens;
  }
  flush();

  // Attach overlaps (previous/next chunk tail/head).
  for (let i = 0; i < chunks.length; i += 1) {
    const prev = chunks[i - 1];
    const next = chunks[i + 1];
    if (prev) {
      const prevBlocks = doc.blocks.filter((b) => b.startOffset >= prev.startOffset && b.endOffset <= prev.endOffset);
      chunks[i].overlapBefore = overlapText(prevBlocks, options.overlapTokens, true);
    }
    if (next) {
      const nextBlocks = doc.blocks.filter((b) => b.startOffset >= next.startOffset && b.endOffset <= next.endOffset);
      chunks[i].overlapAfter = overlapText(nextBlocks, options.overlapTokens, false);
    }
  }
  return chunks;
}
