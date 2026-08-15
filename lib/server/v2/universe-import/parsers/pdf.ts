/**
 * PDF parser — Phase 4 Task 4.3.
 *
 * Accepts pre-extracted page texts (from pdf-parse or a storage-side
 * extraction job). Pages are preserved on every block. Documents with no
 * extractable text (scanned/encrypted) are marked degraded — Phase 4 does
 * NOT add OCR (禁止扩展); the user is told to provide a readable file.
 */

import type { ParsedDocument, ParsedBlock } from "./text.ts";

export interface PdfPageInput {
  page: number;
  text: string;
}

export function parseStubPdf(pages: PdfPageInput[]): ParsedDocument {
  const blocks: ParsedBlock[] = [];
  let anyText = false;
  for (const { page, text } of pages) {
    const trimmed = (text ?? "").trim();
    if (!trimmed) continue;
    anyText = true;
    let offset = 0;
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (t) {
        blocks.push({ text: t, line: blocks.length + 1, startOffset: offset, endOffset: offset + line.length, page });
      }
      offset += line.length + 1;
    }
  }
  if (!anyText) {
    return {
      filename: "document.pdf",
      blocks: [],
      degraded: true,
      degradedReason: "PDF 无可提取文本（扫描或加密件）；需要 OCR 或可读文件后重试。",
    };
  }
  return { filename: "document.pdf", blocks, degraded: false, degradedReason: null };
}
