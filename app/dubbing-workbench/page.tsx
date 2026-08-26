"use client";

import { useMemo, useState } from "react";
import { Loader2, Play, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type DubbingLine = {
  id: string;
  text: string;
  status: string;
  audioUrl: string | null;
  latestJobId: string | null;
  error: string | null;
};

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  background: "linear-gradient(145deg, rgba(22,20,38,0.96), rgba(8,10,18,0.96))",
  padding: 20,
};

export default function DubbingWorkbenchPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [universeId, setUniverseId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [script, setScript] = useState("");
  const [lines, setLines] = useState<DubbingLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const parsedLines = useMemo(() => script.split(/\r?\n/).map((text) => text.trim()).filter(Boolean), [script]);

  async function accessToken() {
    const supabase = getSupabaseBrowserClient();
    const session = await supabase?.auth.getSession();
    return session?.data.session?.access_token || null;
  }

  async function importLines() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const token = await accessToken();
      if (!token) throw new Error(isZh ? "请先登录。" : "Sign in first.");
      const response = await fetch("/api/voice-lines/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ universeId, entityId, projectId, lines: parsedLines.map((text) => ({ text })) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Import failed");
      setLines(payload.voiceLines.map((line: { id: string; text: string; status: string; audioUrl?: string | null; latestJobId?: string | null; error?: string | null }) => ({ id: line.id, text: line.text, status: line.status, audioUrl: line.audioUrl || null, latestJobId: line.latestJobId || null, error: line.error || null })));
      setMessage(isZh ? `已导入 ${payload.voiceLines.length} 条台词。` : `${payload.voiceLines.length} lines imported.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function generateLine(line: DubbingLine) {
    const token = await accessToken();
    if (!token) { setError(isZh ? "请先登录。" : "Sign in first."); return; }
    setLines((current) => current.map((item) => item.id === line.id ? { ...item, status: "generating", error: null } : item));
    const response = await fetch(`/api/voice-lines/${encodeURIComponent(line.id)}/generate`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      setLines((current) => current.map((item) => item.id === line.id ? { ...item, status: "failed", error: payload?.error || "Generation failed" } : item));
      return;
    }
    if (payload.voiceLine) {
      setLines((current) => current.map((item) => item.id === line.id ? { ...item, status: payload.voiceLine.status, audioUrl: payload.voiceLine.audioUrl || null, latestJobId: payload.jobId || null } : item));
    }
    if (payload.jobId) await pollLine(line.id, payload.jobId, token);
  }

  async function pollLine(lineId: string, jobId: string, token: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 4000));
      const response = await fetch(`/api/audio/jobs/${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const payload = await response.json().catch(() => null);
      const job = payload?.job;
      if (!job) return;
      setLines((current) => current.map((item) => item.id === lineId ? { ...item, status: job.status, audioUrl: job.result_url || item.audioUrl, latestJobId: job.id, error: job.error || null } : item));
      if (["completed", "failed", "provider_timeout"].includes(job.status)) return;
    }
  }

  async function generateAll() {
    setBusy(true);
    for (const line of lines) await generateLine(line);
    setBusy(false);
  }

  return (
    <main className="cosmic-page dubbing-workbench-page">
      <header className="cosmic-title-band">
        <div>
          <p className="eyebrow">KIIKIS / AUDIO PRODUCTION</p>
          <h1>{isZh ? "配音工作台" : "Dubbing Workbench"}</h1>
          <p>{isZh ? "把角色台词变成可以试听、审核和留存的声音版本。" : "Turn character dialogue into reviewable, durable voice versions."}</p>
        </div>
      </header>

      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      <section className="dubbing-workbench-grid">
        <div style={panelStyle}>
          <div className="dubbing-section-kicker">01 / {isZh ? "建立配音上下文" : "Set the dubbing context"}</div>
          <h2>{isZh ? "先指定角色，再导入台词" : "Choose the character, then import lines"}</h2>
          <label>{isZh ? "Universe ID" : "Universe ID"}<input value={universeId} onChange={(event) => setUniverseId(event.target.value)} placeholder="universe-id" /></label>
          <label>{isZh ? "角色 Entity ID" : "Character Entity ID"}<input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="entity-id" /></label>
          <label>{isZh ? "项目 ID（可选）" : "Project ID (optional)"}<input value={projectId} onChange={(event) => setProjectId(event.target.value)} placeholder="project-id" /></label>
          <label>{isZh ? "台词（一行一句）" : "Dialogue (one line per row)"}<textarea value={script} onChange={(event) => setScript(event.target.value)} placeholder={isZh ? "我还在这里。\n别回头。\n我们必须现在出发。" : "I am still here.\nDon't look back.\nWe have to leave now."} /></label>
          <button className="primary-button" type="button" onClick={() => void importLines()} disabled={busy || !universeId || !entityId || !parsedLines.length}>
            {busy ? <Loader2 className="spin" size={15} /> : <Sparkles size={15} />}
            {isZh ? "导入台词" : "Import lines"}
          </button>
        </div>

        <div style={panelStyle}>
          <div className="dubbing-section-kicker">02 / {isZh ? "逐句生产与审核" : "Generate and review"}</div>
          <div className="dubbing-review-head"><div><h2>{isZh ? "声音版本" : "Voice versions"}</h2><p>{isZh ? "每条台词独立生成，完成后立即转存到 Kiikis。" : "Each line generates independently and is stored in Kiikis."}</p></div><button className="secondary-button" type="button" onClick={() => void generateAll()} disabled={busy || !lines.length}>{isZh ? "批量生成" : "Batch generate"}</button></div>
          {!lines.length ? <p className="dubbing-empty">{isZh ? "导入台词后，这里会出现逐句任务卡。" : "Import lines to create one task card per line."}</p> : <div className="dubbing-line-list">{lines.map((line, index) => <article className="dubbing-line-card" key={line.id}><div><span className="dubbing-line-index">{String(index + 1).padStart(2, "0")}</span><p>{line.text}</p></div><div className="dubbing-line-actions"><small data-status={line.status}>{line.status}</small>{line.audioUrl ? <audio controls preload="metadata" src={line.audioUrl} /> : <button className="secondary-button" type="button" onClick={() => void generateLine(line)} disabled={busy}><Play size={14} />{isZh ? "生成试听" : "Generate"}</button>}{line.error ? <small className="dubbing-error">{line.error}</small> : null}</div></article>)}</div>}
        </div>
      </section>
    </main>
  );
}
