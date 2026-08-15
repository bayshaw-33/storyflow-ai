/**
 * Text/Markdown parser — Phase 4 Task 4.3.
 * Blocks keep line numbers and byte offsets into the original content.
 */

export interface ParsedBlock {
  text: string;
  line: number;
  startOffset: number;
  endOffset: number;
  /** Scene/episode heading when detected (e.g. 第1集 第3场). */
  heading?: { episode?: number; scene?: number };
  /** PDF page number (pdf parser). */
  page?: number;
  /** DOCX heading/section (docx parser). */
  section?: string;
}

export interface ParsedDocument {
  filename: string;
  blocks: ParsedBlock[];
  /** True when the source has no extractable text (scanned/encrypted). */
  degraded: boolean;
  degradedReason: string | null;
}

const HEADING_RE = /第(\d+|[一二三四五六七八九十百]+)集|第(\d+|[一二三四五六七八九十百]+)场/;

function parseCnNumber(text: string): number | undefined {
  if (/^\d+$/.test(text)) return Number(text);
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100 };
  if (!text) return undefined;
  if (text.length === 1) return map[text];
  // simple composition: 十X / X十 / X十Y
  let result = 0;
  if (text.startsWith("十")) result = 10 + (map[text[1]] ?? 0);
  else if (text.endsWith("十")) result = (map[text[0]] ?? 0) * 10;
  else {
    const parts = text.split("十");
    result = ((map[parts[0]] ?? 0) || 1) * 10 + (map[parts[1]] ?? 0);
  }
  return result || undefined;
}

export function parseText(content: string, filename: string): ParsedDocument {
  const blocks: ParsedBlock[] = [];
  const lines = content.split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed) {
      const headingMatch = HEADING_RE.exec(trimmed);
      const block: ParsedBlock = {
        text: trimmed,
        line: i + 1,
        startOffset: offset,
        endOffset: offset + line.length,
      };
      if (headingMatch) {
        block.heading = {
          episode: parseCnNumber(headingMatch[1] ?? ""),
          scene: parseCnNumber(headingMatch[2] ?? ""),
        };
      }
      blocks.push(block);
    }
    offset += line.length + 1; // +1 for \n
  }
  return {
    filename,
    blocks,
    degraded: blocks.length === 0,
    degradedReason: blocks.length === 0 ? "文件没有可读文本行（可能为空文件或扫描件，需要 OCR/可读文件）。" : null,
  };
}
