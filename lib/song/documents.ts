export type SongDocumentKind = "lyrics" | "v6_style" | "sfx_description";

export type SongDocument = {
  id: string;
  kind: SongDocumentKind;
  version: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  source: "ai" | "manual";
};

export const V6_STYLE_MAX_BYTES = 1000;

export function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).length;
}

export function isSongDocumentKind(value: unknown): value is SongDocumentKind {
  return value === "lyrics" || value === "v6_style" || value === "sfx_description";
}

export function createSongDocument(kind: SongDocumentKind, content: string, existing: SongDocument[] = [], source: SongDocument["source"] = "ai", title?: string): SongDocument {
  const sameKind = existing.filter((document) => document.kind === kind);
  const now = new Date().toISOString();
  return {
    id: `song-document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    version: sameKind.reduce((max, document) => Math.max(max, document.version), 0) + 1,
    title: title || (kind === "lyrics" ? "歌词" : kind === "v6_style" ? "Suno V6 曲风提示词" : "音效生成描述"),
    content,
    createdAt: now,
    updatedAt: now,
    source,
  };
}

export function latestSongDocument(documents: SongDocument[], kind: SongDocumentKind) {
  return documents
    .filter((document) => document.kind === kind)
    .sort((a, b) => b.version - a.version || b.updatedAt.localeCompare(a.updatedAt))[0] || null;
}

export function replaceSongDocument(documents: SongDocument[], next: SongDocument) {
  return documents.map((document) => document.id === next.id ? { ...next, updatedAt: new Date().toISOString(), source: "manual" as const } : document);
}

export function validateV6StylePrompt(value: string) {
  const bytes = utf8Bytes(value);
  return { bytes, valid: bytes <= V6_STYLE_MAX_BYTES };
}

export function fitV6StylePrompt(value: string) {
  if (validateV6StylePrompt(value).valid) return value.trim();
  const encoder = new TextEncoder();
  let output = "";
  for (const char of value.trim()) {
    const next = output + char;
    if (encoder.encode(next).length > V6_STYLE_MAX_BYTES) break;
    output = next;
  }
  return output.trim().replace(/[,;，；\s]+$/g, "");
}
