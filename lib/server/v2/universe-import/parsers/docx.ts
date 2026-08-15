/**
 * DOCX parser — Phase 4 Task 4.3.
 * Accepts pre-extracted paragraph records (mammoth in production); keeps
 * paragraph order and offsets within the concatenated text stream.
 */

import type { ParsedDocument, ParsedBlock } from "./text.ts";

export interface DocxParagraphInput {
  index: number;
  text: string;
  heading?: string;
}

export function parseDocx(paragraphs: DocxParagraphInput[], filename = "document.docx"): ParsedDocument {
  const blocks: ParsedBlock[] = [];
  let offset = 0;
  for (const p of paragraphs) {
    const trimmed = (p.text ?? "").trim();
    if (trimmed) {
      blocks.push({
        text: trimmed,
        line: p.index,
        startOffset: offset,
        endOffset: offset + trimmed.length,
        section: p.heading,
      });
    }
    offset += (p.text ?? "").length + 1;
  }
  return {
    filename,
    blocks,
    degraded: blocks.length === 0,
    degradedReason: blocks.length === 0 ? "DOCX 无可读段落（可能为空文档）。" : null,
  };
}
