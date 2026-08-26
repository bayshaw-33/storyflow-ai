"use client";

export type SongAudioCandidate = {
  id: string;
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
  return (
    <div className="dashboard-panel song-output-card song-audio-card">
      <div className="song-output-card-head">
        <span className="song-card-title">{isZh ? "音频候选" : "Audio candidates"}</span>
        <button className="primary-button" type="button" onClick={onGenerate} disabled={busy}>
          {busy ? (isZh ? "已提交" : "Submitted") : (isZh ? "生成候选音频" : "Generate audio")}
        </button>
      </div>
      {!candidates.length ? (
        <p className="subtle">{isZh ? "歌词和曲风确认后，可在这里生成第一版音乐。" : "Generate the first music version after confirming lyrics and style."}</p>
      ) : (
        <div className="song-audio-candidates" aria-live="polite">
          {candidates.map((candidate, index) => (
            <article className="song-audio-candidate" key={candidate.id}>
              <div className="song-audio-candidate-head">
                <span>{isZh ? `候选 ${index + 1}` : `Candidate ${index + 1}`}</span>
                <small data-status={candidate.status}>{statusLabel(candidate.status, isZh)}</small>
              </div>
              {candidate.resultUrl ? <audio controls preload="metadata" src={candidate.resultUrl} /> : null}
              {candidate.provider || candidate.model ? <small className="field-note">{[candidate.provider, candidate.model].filter(Boolean).join(" · ")}</small> : null}
              {candidate.error ? <small className="field-note song-save-warning">{candidate.error}</small> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
