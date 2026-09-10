"use client";

import { FileText, Gauge, Volume2 } from "lucide-react";
import type { SongDocument } from "@/lib/song/documents";
import { utf8Bytes } from "@/lib/song/documents";

type Props = { document: SongDocument; isZh: boolean; onOpen: (document: SongDocument) => void };

export function SongDocumentCard({ document, isZh, onOpen }: Props) {
  const isSfx = document.kind === "sfx_description";
  const label = document.kind === "lyrics" ? (isZh ? "歌词" : "Lyrics") : document.kind === "v6_style" ? (isZh ? "Suno V6 曲风提示词" : "Suno V6 style prompt") : (isZh ? "音效生成描述" : "SFX generation description");
  const detail = document.kind === "v6_style" ? `${utf8Bytes(document.content)} / 1000 bytes` : isSfx ? (isZh ? "聊天成果 · 可用于音效生成" : "Chat result · ready for SFX") : (isZh ? "点击预览 · 可编辑保存" : "Click to preview · edit and save");
  return (
    <button type="button" className="song-document-card" onClick={() => onOpen(document)}>
      <span className="song-document-icon" aria-hidden="true">{isSfx ? <Volume2 size={18} /> : document.kind === "v6_style" ? <Gauge size={18} /> : <FileText size={18} />}</span>
      <span className="song-document-copy"><strong>{label} · V{document.version}</strong><small>{detail}</small></span>
      <span className="song-document-arrow" aria-hidden="true">›</span>
    </button>
  );
}
