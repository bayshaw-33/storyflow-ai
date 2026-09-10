"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Music2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import type { SongDocument } from "@/lib/song/documents";

export type SongAudioCandidate = {
  id: string;
  label: "A" | "B";
  jobId: string | null;
  status: "queued" | "reconciling" | "generating" | "result_ingesting" | "completed" | "failed" | "provider_timeout";
  resultUrl: string | null;
  provider: string | null;
  model: string | null;
  error: string | null;
  createdAt: string;
};

type SongMusicMode = "vocal" | "instrumental" | "sfx";
type MusicModelOption = {
  id: string;
  labelZh: string;
  labelEn: string;
  descriptionZh?: string;
  descriptionEn?: string;
  available?: boolean;
};

type AudioCandidatesProps = {
  candidates: SongAudioCandidate[];
  busy: boolean;
  isZh: boolean;
  onGenerate: () => void;
  onRetry?: (candidateId: string) => void;
  documents: SongDocument[];
  selectedLyricsDocumentId: string | null;
  selectedStyleDocumentId: string | null;
  selectedSfxDocumentId: string | null;
  onLyricsDocumentChange: (documentId: string) => void;
  onStyleDocumentChange: (documentId: string) => void;
  onSfxDocumentChange: (documentId: string) => void;
  musicModels: MusicModelOption[];
  selectedMusicModel: string;
  onMusicModelChange: (model: string) => void;
  musicMode: SongMusicMode;
  onMusicModeChange: (mode: SongMusicMode) => void;
};

const WAVEFORM_BARS = [24, 40, 31, 56, 38, 68, 45, 78, 52, 34, 62, 44, 72, 48, 28, 58, 39, 65, 47, 30, 55, 42, 70, 36];

function statusLabel(status: SongAudioCandidate["status"], isZh: boolean) {
  const labels = {
    queued: isZh ? "已排队" : "Queued",
    reconciling: isZh ? "任务确认中" : "Confirming task",
    generating: isZh ? "模型生成中" : "Generating",
    result_ingesting: isZh ? "音频入库中" : "Saving audio",
    completed: isZh ? "可试听" : "Ready",
    failed: isZh ? "生成失败" : "Failed",
    provider_timeout: isZh ? "Provider 超时" : "Provider timeout",
  };
  return labels[status];
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function AudioCandidates({ candidates, busy, isZh, onGenerate, onRetry, documents, selectedLyricsDocumentId, selectedStyleDocumentId, selectedSfxDocumentId, onLyricsDocumentChange, onStyleDocumentChange, onSfxDocumentChange, musicModels, selectedMusicModel, onMusicModelChange, musicMode, onMusicModeChange }: AudioCandidatesProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!candidates.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => current && candidates.some((candidate) => candidate.id === current)
      ? current
      : candidates.find((candidate) => candidate.status === "completed")?.id || candidates[0].id);
  }, [candidates]);

  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedId) || candidates[0] || null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.src = selectedCandidate?.resultUrl || "";
    audio.load();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [selectedCandidate?.id, selectedCandidate?.resultUrl]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !selectedCandidate?.resultUrl) return;
    if (audio.paused) {
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }

  function selectCandidate(candidate: SongAudioCandidate) {
    setSelectedId(candidate.id);
    if (!candidate.resultUrl) setIsPlaying(false);
  }

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const lyricsDocuments = documents.filter((document) => document.kind === "lyrics");
  const styleDocuments = documents.filter((document) => document.kind === "v6_style");
  const sfxDocuments = documents.filter((document) => document.kind === "sfx_description");
  const hasSelectedContent = musicMode === "vocal"
    ? Boolean(selectedLyricsDocumentId && selectedStyleDocumentId)
    : musicMode === "instrumental" ? Boolean(selectedStyleDocumentId) : Boolean(selectedSfxDocumentId);

  return (
    <div className="dashboard-panel song-output-card song-audio-card">
      <div className="song-output-card-head">
        <div>
          <span className="song-card-title">{isZh ? "音频候选" : "Audio candidates"}</span>
          <small className="song-audio-subtitle">{isZh ? "选择模型与生成类型，版本会保留在这里试听" : "Choose a model and mode; versions stay here for preview"}</small>
        </div>
        <div className="song-audio-controls" style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, flex: "1 1 auto" }}>
          <label className="song-audio-model-selector" style={{ display: "grid", gap: 3, minWidth: 154, color: "var(--text-secondary)", fontSize: 10, fontWeight: 500 }}>
            <span>{isZh ? "音乐模型" : "Music model"}</span>
            <select style={{ width: "100%", minHeight: 36, maxWidth: "none", fontSize: 12 }} value={selectedMusicModel} onChange={(event) => onMusicModelChange(event.target.value)} aria-label={isZh ? "选择音乐模型" : "Choose music model"}>
              {musicModels.map((model) => <option value={model.id} key={model.id}>{isZh ? model.labelZh : model.labelEn}</option>)}
            </select>
          </label>
          <div className="song-audio-mode-switch" style={{ display: "inline-flex", alignItems: "stretch", padding: 2, border: "1px solid var(--glass-border)", borderRadius: 9, background: "rgba(255, 255, 255, 0.04)" }} role="group" aria-label={isZh ? "选择生成类型" : "Choose generation mode"}>
            {([
              ["vocal", isZh ? "人声歌曲" : "Vocal"],
              ["instrumental", isZh ? "纯音乐" : "Instrumental"],
              ["sfx", isZh ? "音效实验" : "SFX experimental"],
            ] as const).map(([value, label]) => <button className="song-audio-mode-button" style={{ minHeight: 32, padding: "0 9px", border: 0, borderRadius: 7, color: musicMode === value ? "#071313" : "var(--text-secondary)", background: musicMode === value ? "#5eead4" : "transparent", fontSize: 11, cursor: "pointer" }} data-active={musicMode === value} type="button" onClick={() => onMusicModeChange(value)} key={value}>{label}</button>)}
          </div>
          <button className="primary-button" type="button" onClick={onGenerate} disabled={busy || !hasSelectedContent}>
            {busy ? (isZh ? "正在提交 2 首" : "Submitting 2") : (isZh ? "生成 2 首" : "Generate 2 tracks")}
          </button>
        </div>
      </div>
      <div className="song-audio-content-selectors">
        {musicMode === "vocal" ? <label><span>{isZh ? "歌词内容" : "Lyrics content"}</span><select value={selectedLyricsDocumentId || ""} onChange={(event) => onLyricsDocumentChange(event.target.value)} aria-label={isZh ? "选择歌词文档" : "Choose lyrics document"} disabled={!lyricsDocuments.length}><option value="">{isZh ? "先在聊天中生成歌词文档" : "Generate a lyrics document in chat first"}</option>{lyricsDocuments.map((document) => <option key={document.id} value={document.id}>{isZh ? `歌词 · V${document.version}` : `Lyrics · V${document.version}`}</option>)}</select></label> : null}
        {musicMode !== "sfx" ? <label><span>{isZh ? "V6 曲风提示词" : "V6 style prompt"}</span><select value={selectedStyleDocumentId || ""} onChange={(event) => onStyleDocumentChange(event.target.value)} aria-label={isZh ? "选择 V6 曲风提示词" : "Choose V6 style prompt"} disabled={!styleDocuments.length}><option value="">{isZh ? "先在聊天中生成曲风文档" : "Generate a style document in chat first"}</option>{styleDocuments.map((document) => <option key={document.id} value={document.id}>{isZh ? `曲风 · V${document.version}` : `Style · V${document.version}`}</option>)}</select></label> : null}
        {musicMode === "sfx" ? <label><span>{isZh ? "音效生成描述" : "SFX description"}</span><select value={selectedSfxDocumentId || ""} onChange={(event) => onSfxDocumentChange(event.target.value)} aria-label={isZh ? "选择音效描述" : "Choose SFX description"} disabled={!sfxDocuments.length}><option value="">{isZh ? "先在聊天中生成音效描述" : "Generate an SFX description in chat first"}</option>{sfxDocuments.map((document) => <option key={document.id} value={document.id}>{isZh ? `音效 · V${document.version}` : `SFX · V${document.version}`}</option>)}</select></label> : null}
      </div>
      <div className="song-audio-mode-note" style={{ margin: "0 14px 10px", padding: "8px 10px", border: "1px solid rgba(45, 212, 191, 0.2)", borderRadius: 8, color: "var(--text-secondary)", background: "rgba(45, 212, 191, 0.06)", fontSize: 11, lineHeight: 1.45 }} role="status">
        {isZh
          ? (musicMode === "sfx" ? "音效实验：会按动作、材质、空间、距离、冲击和尾音调整提示词；音乐模型生成结果可能带有旋律。" : musicMode === "instrumental" ? "纯音乐：后台 AI 会生成器乐提示词，提交时不会发送歌词。" : "人声歌曲：后台 AI 会保留歌词、人声段落和演唱方向。")
          : (musicMode === "sfx" ? "SFX experimental: prompts emphasize action, material, space, distance, impact, and decay; a music model may still add melody." : musicMode === "instrumental" ? "Instrumental: the AI writes an arrangement prompt and lyrics are not submitted." : "Vocal song: the AI keeps lyrics, vocal sections, and delivery direction.")}
      </div>
      <div className="song-audio-panel-body" id="song-audio-candidates-panel">
        {!candidates.length ? (
          <p className="subtle">{isZh ? "歌词和曲风确认后，可在这里生成第一版音乐。" : "Generate the first music version after confirming lyrics and style."}</p>
        ) : (
          <div className="song-audio-candidates" aria-live="polite">
            {candidates.map((candidate) => {
              const isSelected = candidate.id === selectedCandidate?.id;
              const isReady = candidate.status === "completed" && Boolean(candidate.resultUrl);
              const canRetry = candidate.status === "failed" || candidate.status === "provider_timeout";
              return (
                <article className="song-audio-candidate song-audio-track" data-selected={isSelected} key={candidate.id}>
                  <button className="song-audio-track-select" type="button" onClick={() => selectCandidate(candidate)} aria-pressed={isSelected}>
                    <span className="song-audio-cover" aria-hidden="true">
                      <Music2 size={20} strokeWidth={1.6} />
                      <strong>{candidate.label}</strong>
                    </span>
                    <span className="song-audio-player-main">
                      <span className="song-audio-candidate-head">
                        <span>{isZh ? `候选 ${candidate.label}` : `Candidate ${candidate.label}`}</span>
                        <small data-status={candidate.status}>{statusLabel(candidate.status, isZh)}</small>
                      </span>
                      <span className="song-audio-waveform" aria-hidden="true">
                        {WAVEFORM_BARS.map((height, index) => <span className="song-audio-wave-bar" style={{ height: `${height}%` }} key={`${candidate.id}-bar-${index}`} />)}
                      </span>
                      <span className="song-audio-track-progress"><span style={{ width: isSelected ? `${progress}%` : "0%" }} /></span>
                      <span className="song-audio-track-meta">
                        <small>{isReady ? (isZh ? "点击下方播放器试听" : "Use the player below") : statusLabel(candidate.status, isZh)}</small>
                        {candidate.provider || candidate.model ? <small>{[candidate.provider, candidate.model].filter(Boolean).join(" · ")}</small> : null}
                      </span>
                    </span>
                  </button>
                  <span className="song-audio-track-actions">
                    {canRetry && onRetry ? <button className="icon-button song-audio-retry" type="button" onClick={() => onRetry(candidate.id)} title={isZh ? "重试" : "Retry"} aria-label={isZh ? `重试候选 ${candidate.label}` : `Retry candidate ${candidate.label}`}><RotateCcw size={16} /></button> : null}
                    {candidate.resultUrl ? <a className="icon-button song-audio-download" href={candidate.resultUrl} download title={isZh ? "下载" : "Download"} aria-label={isZh ? `下载候选 ${candidate.label}` : `Download candidate ${candidate.label}`}><Download size={16} /></a> : null}
                  </span>
                  {canRetry && candidate.error ? <small className="field-note song-save-warning">{candidate.error}</small> : null}
                </article>
              );
            })}
          </div>
        )}
        <div className="song-audio-persistent-player" data-empty={!selectedCandidate?.resultUrl}>
          <button className="song-audio-play-button" type="button" onClick={togglePlay} disabled={!selectedCandidate?.resultUrl} aria-label={isPlaying ? (isZh ? "暂停" : "Pause") : (isZh ? "播放" : "Play")}>
            {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
          </button>
          <div className="song-audio-player-info">
            <strong>{selectedCandidate ? (isZh ? `候选 ${selectedCandidate.label}` : `Candidate ${selectedCandidate.label}`) : (isZh ? "尚未生成音频" : "No audio yet")}</strong>
            <span>{selectedCandidate ? statusLabel(selectedCandidate.status, isZh) : (isZh ? "生成后将在此播放" : "Generate a track to play it here")}</span>
          </div>
          <div className="song-audio-player-timeline">
            <div className="song-audio-progress"><span style={{ width: `${progress}%` }} /></div>
            <div className="song-audio-time"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
          </div>
          <button className="icon-button song-audio-volume" type="button" onClick={() => {
            setIsMuted((current) => !current);
            if (audioRef.current) audioRef.current.muted = !audioRef.current.muted;
          }} aria-label={isMuted ? (isZh ? "打开声音" : "Unmute") : (isZh ? "静音" : "Mute")}>
            {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <audio
            ref={audioRef}
            className="song-audio-native"
            preload="metadata"
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
        </div>
      </div>
    </div>
  );
}
