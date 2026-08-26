"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Music2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";

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

type AudioCandidatesProps = {
  candidates: SongAudioCandidate[];
  busy: boolean;
  isZh: boolean;
  onGenerate: () => void;
  onRetry?: (candidateId: string) => void;
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

export function AudioCandidates({ candidates, busy, isZh, onGenerate, onRetry }: AudioCandidatesProps) {
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

  return (
    <div className="dashboard-panel song-output-card song-audio-card">
      <div className="song-output-card-head">
        <div>
          <span className="song-card-title">{isZh ? "音频候选" : "Audio candidates"}</span>
          <small className="song-audio-subtitle">{isZh ? "选择版本试听，播放器保持在这里" : "Select a version to preview"}</small>
        </div>
        <div className="song-card-actions">
          <button className="primary-button" type="button" onClick={onGenerate} disabled={busy}>
            {busy ? (isZh ? "正在提交 2 首" : "Submitting 2") : (isZh ? "生成 2 首" : "Generate 2 tracks")}
          </button>
        </div>
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
                  {candidate.error ? <small className="field-note song-save-warning">{candidate.error}</small> : null}
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
