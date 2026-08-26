"use client";

import { useEffect, useState } from "react";
import { Music2 } from "lucide-react";

export type SongAudioCandidate = {
  id: string;
  label: "A" | "B";
  jobId: string | null;
  status: "queued" | "generating" | "result_ingesting" | "completed" | "failed" | "provider_timeout";
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
};

function statusLabel(status: SongAudioCandidate["status"], isZh: boolean) {
  const labels = {
    queued: isZh ? "已排队" : "Queued",
    generating: isZh ? "模型生成中" : "Generating",
    result_ingesting: isZh ? "音频入库中" : "Saving audio",
    completed: isZh ? "可试听" : "Ready",
    failed: isZh ? "生成失败" : "Failed",
    provider_timeout: isZh ? "Provider 超时" : "Provider timeout",
  };
  return labels[status];
}

export function AudioCandidates({ candidates, busy, isZh, onGenerate }: AudioCandidatesProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (candidates.length > 0) setOpen(true);
  }, [candidates.length]);

  return (
    <div className="dashboard-panel song-output-card song-audio-card" data-open={open}>
      <div className="song-output-card-head">
        <span className="song-card-title">{isZh ? "音频候选" : "Audio candidates"}</span>
        <div className="song-card-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls="song-audio-candidates-panel"
          >
            {open ? (isZh ? "收起" : "Collapse") : (candidates.length ? (isZh ? "查看候选" : "View") : (isZh ? "展开" : "Open"))}
          </button>
          <button className="primary-button" type="button" onClick={onGenerate} disabled={busy}>
            {busy ? (isZh ? "正在提交 2 首" : "Submitting 2") : (isZh ? "生成 2 首" : "Generate 2 tracks")}
          </button>
        </div>
      </div>
      {open ? <div className="song-audio-panel-body" id="song-audio-candidates-panel">
        {!candidates.length ? (
          <p className="subtle">{isZh ? "歌词和曲风确认后，可在这里生成第一版音乐。" : "Generate the first music version after confirming lyrics and style."}</p>
        ) : (
          <div className="song-audio-candidates" aria-live="polite">
            {candidates.map((candidate) => (
              <article className="song-audio-candidate song-audio-player" key={candidate.id}>
                <div className="song-audio-cover" aria-hidden="true">
                  <Music2 size={20} strokeWidth={1.6} />
                  <strong>{candidate.label}</strong>
                </div>
                <div className="song-audio-player-main">
                  <div className="song-audio-candidate-head">
                    <span>{isZh ? `候选 ${candidate.label}` : `Candidate ${candidate.label}`}</span>
                    <small data-status={candidate.status}>{statusLabel(candidate.status, isZh)}</small>
                  </div>
                  {candidate.resultUrl ? <audio controls preload="metadata" src={candidate.resultUrl} /> : <div className="song-audio-loading-track" data-status={candidate.status} />}
                  {candidate.provider || candidate.model ? <small className="field-note">{[candidate.provider, candidate.model].filter(Boolean).join(" · ")}</small> : null}
                  {candidate.error ? <small className="field-note song-save-warning">{candidate.error}</small> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div> : null}
    </div>
  );
}
