import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";

import type { AssembledDocument, DeliveryItem } from "./assembly.ts";

function markdownParagraphs(markdown: string) {
  return markdown.split("\n").map((line) => {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length === 1 ? HeadingLevel.HEADING_1 : heading[1].length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      return new Paragraph({ text: heading[2], heading: level, spacing: { before: 180, after: 100 } });
    }
    if (/^[-*]\s+/.test(line)) {
      return new Paragraph({ text: line.replace(/^[-*]\s+/, ""), bullet: { level: 0 } });
    }
    if (/^>\s?/.test(line)) {
      return new Paragraph({ children: [new TextRun({ text: line.replace(/^>\s?/, ""), italics: true, color: "555555" })], indent: { left: 360 } });
    }
    return new Paragraph({ text: line, spacing: { after: line ? 100 : 40 } });
  });
}

export async function buildDocxBytes(document: AssembledDocument) {
  const docx = new Document({
    creator: "Kiikis",
    title: document.title,
    description: `Kiikis creation delivery in ${document.language}`,
    sections: [{ properties: {}, children: markdownParagraphs(document.markdown) }],
  });
  const blob = await Packer.toBlob(docx);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function buildDeliveryZipBytes(items: DeliveryItem[]) {
  const zip = new JSZip();
  for (const item of items) {
    zip.file(`${item.baseFilename}.md`, item.document.markdown);
    zip.file(`${item.baseFilename}.docx`, await buildDocxBytes(item.document));
  }
  zip.file("manifest.json", JSON.stringify({
    generatedAt: new Date().toISOString(),
    formats: ["md", "docx"],
    items: items.map((item) => ({ id: item.id, label: item.label, baseFilename: item.baseFilename, diagnostics: item.document.diagnostics })),
  }, null, 2));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function downloadMarkdown(document: AssembledDocument, baseFilename: string) {
  downloadBlob(new Blob([document.markdown], { type: "text/markdown;charset=utf-8" }), `${baseFilename}.md`);
}

export async function downloadDocx(document: AssembledDocument, baseFilename: string) {
  const bytes = await buildDocxBytes(document);
  downloadBlob(new Blob([toArrayBuffer(bytes)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), `${baseFilename}.docx`);
}

export async function downloadDeliveryZip(items: DeliveryItem[], baseFilename: string) {
  const bytes = await buildDeliveryZipBytes(items);
  downloadBlob(new Blob([toArrayBuffer(bytes)], { type: "application/zip" }), `${baseFilename}.zip`);
}
