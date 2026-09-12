"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Music2, Pencil, Plus, Trash2, X } from "lucide-react";
import { SongWorkbenchNav } from "@/components/song-workbench/SongWorkbenchNav";
import { cloneSinger, defaultSingers, emptySingerDraft, normalizeSingerDraft, SONG_SINGER_HANDOFF_STORAGE_KEY, SONG_SINGER_LIBRARY_STORAGE_KEY, SONG_WORKBENCH_STORAGE_KEY, type SingerProfile, uniqueSingerProfiles } from "@/lib/song/singers";

type ListField = "genres" | "voiceTexture" | "delivery" | "language" | "safePromptTerms" | "forbiddenOutputTerms";
const listLabels: Record<ListField, string> = { genres: "适合曲风", voiceTexture: "声音质感", delivery: "演唱方式", language: "语言", safePromptTerms: "安全提示词", forbiddenOutputTerms: "禁止输出词" };

function readLibrary() {
  try {
    const raw = window.localStorage.getItem(SONG_SINGER_LIBRARY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? uniqueSingerProfiles(parsed as SingerProfile[]) : defaultSingers;
  } catch {
    return readLegacyLibrary();
  }
}

function readLegacyLibrary() {
  try {
    const raw = window.localStorage.getItem(SONG_WORKBENCH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as { singers?: unknown } : null;
    const legacySingers = Array.isArray(parsed?.singers) ? parsed.singers as SingerProfile[] : [];
    return uniqueSingerProfiles([...legacySingers, ...defaultSingers]);
  } catch {
    return defaultSingers;
  }
}

export function SongVoiceLibrary() {
  const [singers, setSingers] = useState<SingerProfile[]>(defaultSingers);
  const [draft, setDraft] = useState<SingerProfile | null>(null);
  const [notice, setNotice] = useState("");
  const libraryLoadedRef = useRef(false);

  useEffect(() => {
    const next = readLibrary();
    libraryLoadedRef.current = true;
    setSingers(next);
    window.localStorage.setItem(SONG_SINGER_LIBRARY_STORAGE_KEY, JSON.stringify(next));
  }, []);
  useEffect(() => {
    if (!libraryLoadedRef.current) return;
    window.localStorage.setItem(SONG_SINGER_LIBRARY_STORAGE_KEY, JSON.stringify(uniqueSingerProfiles(singers)));
  }, [singers]);

  const profileCount = useMemo(() => uniqueSingerProfiles(singers).length, [singers]);

  function updateListField(field: ListField, value: string) {
    if (!draft) return;
    setDraft({ ...draft, [field]: value.split(",").map((item) => item.trim()).filter(Boolean) });
  }

  function saveDraft() {
    if (!draft?.displayName.trim()) {
      setNotice("请填写音色名称。");
      return;
    }
    const normalized = normalizeSingerDraft(draft);
    setSingers((current) => uniqueSingerProfiles(current.some((item) => item.id === normalized.id) ? current.map((item) => item.id === normalized.id ? normalized : item) : [...current, normalized]));
    setDraft(null);
    setNotice("音色设定已保存。");
  }

  function copySinger(singer: SingerProfile) {
    setDraft({ ...cloneSinger(singer), id: "manual-" + Date.now(), displayName: singer.displayName + " Copy" });
  }

  function deleteSinger(singer: SingerProfile) {
    if (!window.confirm("确定删除“" + singer.displayName + "”吗？")) return;
    setSingers((current) => current.filter((item) => item.id !== singer.id));
    setNotice("音色设定已删除。");
  }

  function applySinger(singer: SingerProfile) {
    window.localStorage.setItem(SONG_SINGER_HANDOFF_STORAGE_KEY, singer.id);
    window.location.href = "/song-workbench?singerId=" + encodeURIComponent(singer.id);
  }

  return (
    <main className="song-product-page">
      <SongWorkbenchNav active="voices" />
      <section className="song-product-content">
        <header className="song-product-heading">
          <div><span className="song-product-kicker">SINGER SETTINGS</span><h1>歌曲音色库</h1><p>保存可复用的人声质感与演唱方向，一键带回音乐创作。</p></div>
          <button className="primary-button" type="button" onClick={() => setDraft({ ...emptySingerDraft, id: "manual-" + Date.now() })}><Plus size={16} />新增音色</button>
        </header>
        {notice ? <div className="song-product-notice" role="status">{notice}</div> : null}
        <div className="song-voice-library-summary"><Music2 size={18} /><strong>{profileCount}</strong><span>组歌曲人声设定</span><Link href="/song-workbench">返回音乐工作台</Link></div>
        <section className="song-voice-grid">
          {singers.map((singer) => (
            <article className="song-voice-card" key={singer.id}>
              <div className="song-voice-card-head"><div className="song-voice-avatar"><Music2 size={20} /></div><div><h2>{singer.displayName}</h2><span>{singer.gender} · {singer.language.join(" / ") || "未指定语言"}</span></div></div>
              <div className="song-voice-tags">{[...singer.voiceTexture, ...singer.delivery, ...singer.genres].slice(0, 7).map((tag) => <span key={tag}>{tag}</span>)}</div>
              <p>{singer.notes || "暂无备注。"}</p>
              <div className="song-voice-card-actions"><button className="primary-button" type="button" onClick={() => applySinger(singer)}><Check size={15} />应用到音乐工作台</button><button className="icon-button" type="button" onClick={() => setDraft(cloneSinger(singer))} aria-label={"编辑 " + singer.displayName} title="编辑"><Pencil size={16} /></button><button className="icon-button" type="button" onClick={() => copySinger(singer)} aria-label={"复制 " + singer.displayName} title="复制"><Copy size={16} /></button><button className="icon-button" type="button" onClick={() => deleteSinger(singer)} aria-label={"删除 " + singer.displayName} title="删除"><Trash2 size={16} /></button></div>
            </article>
          ))}
        </section>
      </section>
      {draft ? <div className="song-voice-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setDraft(null); }}><section className="song-voice-editor" role="dialog" aria-modal="true" aria-label="编辑歌曲音色"><header><div><span className="song-product-kicker">SINGER PROFILE</span><h2>{draft.id.startsWith("manual-") ? "新增音色" : "编辑音色"}</h2></div><button className="icon-button" type="button" onClick={() => setDraft(null)} aria-label="关闭"><X size={18} /></button></header><div className="song-voice-form"><label>名称<input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} autoFocus /></label><label>人声方向<input value={draft.gender} onChange={(event) => setDraft({ ...draft, gender: event.target.value })} /></label>{(["language", "genres", "voiceTexture", "delivery", "safePromptTerms", "forbiddenOutputTerms"] as ListField[]).map((field) => <label key={field}>{listLabels[field]}<input value={draft[field].join(", ")} onChange={(event) => updateListField(field, event.target.value)} placeholder="用逗号分隔" /></label>)}<label>备注<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={3} /></label></div><footer><button className="secondary-button" type="button" onClick={() => setDraft(null)}>取消</button><button className="primary-button" type="button" onClick={saveDraft}>保存设定</button></footer></section></div> : null}
    </main>
  );
}
