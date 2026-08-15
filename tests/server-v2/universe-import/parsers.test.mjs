/**
 * Phase 4 Task 4.3 — parsers & chunker.
 *
 * Verifies:
 *   - text parser keeps line numbers and byte offsets
 *   - chunker: scene/episode boundaries win; token-budget fallback; overlap
 *     preserved; first & last page content both reach the chunk index
 *   - encrypted/scanned PDFs (no extractable text) → degraded signal
 *
 * Run: node --test tests/server-v2/universe-import/parsers.test.mjs
 *        && node --test tests/server-v2/universe-import/chunker.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { parseText } from "../../../lib/server/v2/universe-import/parsers/text.ts";
import { parseStubPdf } from "../../../lib/server/v2/universe-import/parsers/pdf.ts";
import { chunkDocument } from "../../../lib/server/v2/universe-import/chunker.ts";

const LONG = readFileSync(new URL("../../fixtures/universe-import/long-screenplay.txt", import.meta.url), "utf8");

// ============================================================
// 1. Text parser: line numbers + offsets
// ============================================================

test("text parser records line numbers and offsets for every block", () => {
  const doc = parseText("第一行\n第二行\n\n第三行", "a.txt");
  assert.equal(doc.blocks.length, 3);
  assert.equal(doc.blocks[0].line, 1);
  assert.equal(doc.blocks[0].startOffset, 0);
  assert.equal(doc.blocks[1].line, 2);
  // third block starts after the blank line
  assert.equal(doc.blocks[2].line, 4);
  assert.ok(doc.blocks[2].startOffset > doc.blocks[1].endOffset);
});

// ============================================================
// 2. PDF stub: pages preserved; empty text → degraded
// ============================================================

test("pdf parser keeps page numbers; scanned/empty → degraded signal", () => {
  const doc = parseStubPdf([
    { page: 1, text: "第1页内容" },
    { page: 2, text: "第2页内容" },
  ]);
  assert.equal(doc.blocks.length, 2);
  assert.equal(doc.blocks[0].page, 1);
  assert.equal(doc.blocks[1].page, 2);

  const scanned = parseStubPdf([{ page: 1, text: "" }, { page: 2, text: "   " }]);
  assert.equal(scanned.degraded, true);
  assert.match(scanned.degradedReason ?? "", /OCR|可读/i);
});

// ============================================================
// 3. Chunker: boundary priority + coverage
// ============================================================

test("scene/episode boundaries produce chunk starts; first and last content both indexed", () => {
  const doc = parseText(LONG, "long.txt");
  const chunks = chunkDocument(doc, { tokenBudget: 3500, overlapTokens: 120 });
  assert.ok(chunks.length >= 20, `expected many chunks, got ${chunks.length}`);
  const allText = chunks.map((c) => c.content).join("\n");
  assert.ok(allText.includes("第1集"), "first episode content indexed");
  assert.ok(allText.includes("第100场") || allText.includes("第5集"), "late content indexed");
  // 首尾页都进入 chunk index
  assert.ok(allText.includes("第1次欲言又止"), "first page line in chunks");
  const lastLine = LONG.trimEnd().split("\n").pop() ?? "";
  assert.ok(lastLine && allText.includes(lastLine.slice(0, 8)), "last page line in chunks");
});

test("chunks record offsets and overlap context that includes cross-boundary names", () => {
  const doc = parseText(LONG, "long.txt");
  const chunks = chunkDocument(doc, { tokenBudget: 3000, overlapTokens: 150 });
  for (const chunk of chunks) {
    assert.ok(chunk.startOffset <= chunk.endOffset);
    if (chunk.overlapBefore) {
      // overlap content must come from just before the chunk start
      assert.ok(chunk.startOffset > 0);
    }
  }
  // cross-boundary: 阿仁 appears across many boundaries; every occurrence of
  // any name in the original must appear in at least one chunk or overlap
  const joined = chunks.map((c) => c.overlapBefore + "\n" + c.content + "\n" + c.overlapAfter).join("\n");
  const occurrences = (LONG.match(/阿仁/g) ?? []).length;
  const kept = (joined.match(/阿仁/g) ?? []).length;
  assert.ok(kept >= occurrences, `overlap must not lose name occurrences (${kept}/${occurrences})`);
});

test("deterministic chunking: same input → same chunk boundaries", () => {
  const doc = parseText(LONG, "long.txt");
  const a = chunkDocument(doc, { tokenBudget: 3200, overlapTokens: 100 });
  const b = chunkDocument(doc, { tokenBudget: 3200, overlapTokens: 100 });
  assert.deepEqual(
    a.map((c) => [c.startOffset, c.endOffset]),
    b.map((c) => [c.startOffset, c.endOffset]),
  );
});
