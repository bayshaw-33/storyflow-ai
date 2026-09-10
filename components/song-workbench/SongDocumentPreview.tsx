"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Languages, Save, X } from "lucide-react";
import type { SongDocument } from "@/lib/song/documents";
import { validateV6StylePrompt, utf8Bytes, V6_STYLE_MAX_BYTES } from "@/lib/song/documents";

type Props = {
  document: SongDocument;
  isZh: boolean;
  onClose: () => void;
  onSave: (content: string) => void;
  onCopy: (content: string) => void;
  onTranslate: () => void;
  translatedLyrics: string;
  translating: boolean;
  translationError: string;
  onOpenSuno?: () => void;
};

export function SongDocumentPreview({ document, isZh, onClose, onSave, onCopy, onTranslate, translatedLyrics, translating, translationError, onOpenSuno }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(document.content);
  const isStyle = document.kind === "v6_style";
  const isLyrics = document.kind === "lyrics";
  const bytes = useMemo(() => utf8Bytes(draft), [draft]);
  const valid = !isStyle || validateV6StylePrompt(draft).valid;

  useEffect(() => {
    setEditing(false);
    setDraft(document.content);
  }, [document.id, document.content]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="song-document-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="song-document-modal" role="dialog" aria-modal="true" aria-label={document.title}>
        <header className="song-document-modal-head">
          <div><h2>{document.title} · V{document.version}</h2><small>{isZh ? `由 ${document.source === "ai" ? "AI" : "手动编辑"} 生成 · ${new Date(document.updatedAt).toLocaleString()}` : `${document.source === "ai" ? "AI" : "Manually edited"} · ${new Date(document.updatedAt).toLocaleString()}`}</small></div>
          <div className="song-document-modal-actions">
            {isLyrics ? <button type="button" className="secondary-button" onClick={onTranslate} disabled={translating}><Languages size={14} />{translating ? (isZh ? "翻译中" : "Translating") : (isZh ? "一键翻译" : "Translate")}</button> : null}
            <button type="button" className="secondary-button" onClick={() => onCopy(draft)} disabled={!valid}><Copy size={14} />{isZh ? "复制" : "Copy"}</button>
            {onOpenSuno && isStyle ? <button type="button" className="secondary-button" onClick={onOpenSuno} disabled={!valid}>Suno ↗</button> : null}
            <button type="button" className="primary-button" onClick={() => editing ? (valid && (onSave(draft), setEditing(false))) : setEditing(true)} disabled={editing && !valid}><Save size={14} />{editing ? (isZh ? "保存当前文档" : "Save document") : (isZh ? "进入编辑" : "Edit")}</button>
            <button type="button" className="icon-button" onClick={onClose} aria-label={isZh ? "关闭" : "Close"}><X size={17} /></button>
          </div>
        </header>
        <div className="song-document-modal-body">
          <div className={`song-document-paper ${editing ? "is-editing" : ""}`}>
            {editing ? <textarea value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus /> : <pre>{draft}</pre>}
          </div>
          <aside className="song-document-meta">
            <span>{isZh ? "文档信息" : "Document"}</span>
            <strong>{isLyrics ? (isZh ? "歌词" : "Lyrics") : isStyle ? (isZh ? "V6 专业提示词" : "V6 professional prompt") : (isZh ? "音效描述" : "SFX description")}</strong>
            {isStyle ? <><strong className={valid ? "song-byte-valid" : "song-byte-invalid"}>{bytes} / {V6_STYLE_MAX_BYTES} bytes</strong>{!valid ? <small>{isZh ? "超出限制，保存和发送已禁用。" : "Over the limit. Save and handoff are disabled."}</small> : null}</> : null}
            {isLyrics && translatedLyrics ? <div className="song-translation-preview"><span>{isZh ? "翻译预览" : "Translation preview"}</span><pre>{translatedLyrics}</pre>{translationError ? <small>{translationError}</small> : null}</div> : null}
          </aside>
        </div>
      </section>
    </div>
  );
}
