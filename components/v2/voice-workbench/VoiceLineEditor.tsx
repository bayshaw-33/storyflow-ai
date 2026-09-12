"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./VoiceWorkbench.module.css";

type VoiceSource = "personal" | "shared";

type DirectoryVoice = {
  voiceId: string;
  name: string;
  category: string | null;
  description: string | null;
  labels: Record<string, string>;
  previewUrl: string | null;
  verifiedLanguages: Array<Record<string, unknown>>;
  isOwner: boolean;
  voiceType: string | null;
};

type GenerationResponse = {
  success?: boolean;
  error?: string;
  jobId?: string;
  job?: { id?: string; status?: string; result_url?: string | null };
};

export interface VoiceLineEditorProps {
  target: { kind: string; id: string; label: string } | null;
  providerAvailable: boolean | null;
  providerName?: string;
  onProviderCheck?: (available: boolean, name?: string) => void;
}

const EMOTIONS = ["平静", "紧张", "激昂", "悲伤", "俏皮"];

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return {};
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function VoiceLineEditor({ target, providerAvailable, providerName, onProviderCheck }: VoiceLineEditorProps) {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("zh-CN");
  const [emotion, setEmotion] = useState("平静");
  const [speed, setSpeed] = useState(1.0);
  const [voiceRef, setVoiceRef] = useState("");
  const [voices, setVoices] = useState<DirectoryVoice[]>([]);
  const [voiceSource, setVoiceSource] = useState<VoiceSource>("personal");
  const [voiceSearch, setVoiceSearch] = useState("");
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [cloneName, setCloneName] = useState("");
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const [cloneLoading, setCloneLoading] = useState(false);
  const [cloneMessage, setCloneMessage] = useState("");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/api/voice/provider-status")
      .then((r) => r.json().catch(() => ({})))
      .then((body) => {
        const ok = body.available === true;
        onProviderCheck?.(ok, String(body.name ?? "unknown"));
        if (!ok) setResult({ ok: false, message: "配音服务未配置：仅可编辑台词，无法生成试听。" });
      })
      .catch(() => {
        onProviderCheck?.(false, "unknown");
        setResult({ ok: false, message: "无法检查配音服务状态。" });
      });
  }, [onProviderCheck]);

  const fetchVoiceDirectory = async (source: VoiceSource, search: string) => {
    setVoiceLoading(true);
    setVoiceError("");
    try {
      const params = new URLSearchParams({ source, pageSize: "30" });
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/voice/elevenlabs/voices?${params.toString()}`, {
        headers: await getAuthHeaders(),
      });
      const body = (await response.json().catch(() => ({}))) as { voices?: DirectoryVoice[]; error?: string };
      if (!response.ok) {
        setVoices([]);
        setVoiceError(body.error ?? "音色库暂时无法访问。");
        return;
      }
      setVoices(Array.isArray(body.voices) ? body.voices : []);
    } catch {
      setVoices([]);
      setVoiceError("音色库连接失败，请稍后重试。");
    } finally {
      setVoiceLoading(false);
    }
  };

  useEffect(() => {
    if (providerName === "elevenlabs") void fetchVoiceDirectory(voiceSource, "");
  }, [providerName, voiceSource]);

  const selectVoiceSource = (source: VoiceSource) => {
    setVoiceSource(source);
    setVoiceRef("");
    setPlayingVoiceId(null);
  };

  const createVoiceClone = async () => {
    if (!cloneName.trim() || !cloneFile) {
      setCloneMessage("请填写音色名称并选择音频文件。");
      return;
    }
    setCloneLoading(true);
    setCloneMessage("");
    try {
      const form = new FormData();
      form.set("name", cloneName.trim());
      form.set("file", cloneFile);
      form.set("removeBackgroundNoise", "true");
      const response = await fetch("/api/voice/elevenlabs/clone", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: form,
      });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; voiceId?: string; requiresVerification?: boolean; error?: string };
      if (!response.ok || !body.success || !body.voiceId) {
        setCloneMessage(body.error ?? "音色创建失败，请检查音频后重试。");
        return;
      }
      setVoiceSource("personal");
      setVoiceSearch("");
      setVoiceRef(body.voiceId);
      setCloneName("");
      setCloneFile(null);
      setCloneMessage(body.requiresVerification ? "音色已创建，需在 ElevenLabs 完成验证后使用。" : "音色已创建，并已选中。 ");
      await fetchVoiceDirectory("personal", "");
    } catch {
      setCloneMessage("音色创建请求失败，请稍后重试。");
    } finally {
      setCloneLoading(false);
    }
  };

  const toggleVoicePreview = (voice: DirectoryVoice) => {
    if (!voice.previewUrl) return;
    if (playingVoiceId === voice.voiceId) {
      previewAudioRef.current?.pause();
      setPlayingVoiceId(null);
      return;
    }
    previewAudioRef.current?.pause();
    const audio = new Audio(voice.previewUrl);
    audio.onended = () => setPlayingVoiceId(null);
    previewAudioRef.current = audio;
    setPlayingVoiceId(voice.voiceId);
    void audio.play().catch(() => {
      setPlayingVoiceId(null);
      setVoiceError("音色试听失败，请稍后重试。");
    });
  };

  const generate = async () => {
    if (!target || !text.trim()) return;
    setGenerating(true);
    setResult(null);
    setAudioUrl(null);
    setDownloadUrl(null);
    try {
      const isElevenLabs = providerName === "elevenlabs";
      const response = await fetch(isElevenLabs ? "/api/audio/jobs" : "/api/voice-lines/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        body: JSON.stringify(isElevenLabs ? {
          kind: "tts",
          provider: "elevenlabs",
          targetType: "voice_line",
          targetId: target.id,
          text: text.trim(),
          language,
          speed,
          voiceProviderVoiceId: voiceRef || null,
          inputParams: { targetKind: target.kind, targetLabel: target.label, title: `${target.label} 配音` },
        } : {
          targetKind: target.kind,
          targetId: target.id,
          text: text.trim(),
          language,
          emotion,
          speed,
          voiceRef: voiceRef || null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as GenerationResponse;
      if (!response.ok || !body.success) {
        setResult({ ok: false, message: body.error ?? `生成失败 (${response.status})` });
        return;
      }
      const jobId = body.jobId ?? body.job?.id ?? "";
      const generatedUrl = body.job?.result_url ?? null;
      if (isElevenLabs && jobId) {
        setAudioUrl(generatedUrl);
        setDownloadUrl(`/api/audio/jobs/${encodeURIComponent(jobId)}/download`);
      }
      setResult({ ok: true, message: generatedUrl ? "配音已生成，可以试听或下载。" : `生成任务已提交（${jobId}）。` });
    } catch {
      setResult({ ok: false, message: "生成失败，当前文本已保留。" });
    } finally {
      setGenerating(false);
    }
  };

  const canGenerate = Boolean(target)
    && Boolean(text.trim())
    && providerAvailable === true
    && !generating
    && (providerName !== "elevenlabs" || Boolean(voiceRef));

  return (
    <div className={styles.editor} data-testid="voice-line-editor">
      {!target ? (
        <div className={styles.empty}>从左侧选择一个配音目标。</div>
      ) : (
        <>
          <div className={styles.targetLabel}>
            {target.kind === "character" ? "角色声音" : target.kind === "narration" ? "旁白" : "台词"} · {target.label}
          </div>
          <textarea className={styles.textArea} value={text} onChange={(e) => setText(e.target.value)} placeholder="输入要配音的文本…" aria-label="配音文本" rows={5} />
          {providerName === "elevenlabs" ? (
            <section className={styles.voiceSelector} data-testid="elevenlabs-voice-selector" aria-label="ElevenLabs 音色选择">
              <div className={styles.voiceSelectorHeader}>
                <div><strong>人声音色</strong><span>{voiceRef ? `已选择：${voices.find((voice) => voice.voiceId === voiceRef)?.name ?? voiceRef}` : "请选择一个音色"}</span></div>
                <span className={styles.voiceProviderPill}>ElevenLabs</span>
              </div>
              <div className={styles.voiceTabs} role="tablist" aria-label="音色来源">
                <button type="button" className={voiceSource === "personal" ? styles.voiceTabActive : styles.voiceTab} onClick={() => selectVoiceSource("personal")} role="tab" aria-selected={voiceSource === "personal"}>我的音色</button>
                <button type="button" className={voiceSource === "shared" ? styles.voiceTabActive : styles.voiceTab} onClick={() => selectVoiceSource("shared")} role="tab" aria-selected={voiceSource === "shared"}>ElevenLabs 音色库</button>
              </div>
              <div className={styles.voiceSearch}>
                <input value={voiceSearch} onChange={(e) => setVoiceSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void fetchVoiceDirectory(voiceSource, voiceSearch); }} placeholder="搜索音色、口音或用途…" aria-label="搜索音色" />
                <button type="button" onClick={() => void fetchVoiceDirectory(voiceSource, voiceSearch)} disabled={voiceLoading}>搜索</button>
              </div>
              <div className={styles.voiceCloneBox}>
                <div className={styles.voiceCloneHeading}><strong>上传新音色</strong><span>会加入 Kiikis 工作室音色库</span></div>
                <div className={styles.voiceCloneControls}>
                  <input value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="音色名称" aria-label="克隆音色名称" />
                  <input type="file" accept="audio/*" onChange={(e) => setCloneFile(e.target.files?.[0] ?? null)} aria-label="克隆音色音频文件" />
                  <button type="button" onClick={() => void createVoiceClone()} disabled={cloneLoading}>{cloneLoading ? "创建中…" : "创建克隆音色"}</button>
                </div>
                <small>建议上传干净、连续的单人语音；统一账号创建的音色会被工作室成员使用。</small>
                {cloneMessage ? <div className={styles.voiceCloneMessage} role="status">{cloneMessage}</div> : null}
              </div>
              {voiceLoading ? <div className={styles.voiceStatus}>正在加载音色…</div> : null}
              {voiceError ? <div className={styles.voiceError} role="status">{voiceError}</div> : null}
              {!voiceLoading && !voiceError && voices.length === 0 ? <div className={styles.voiceStatus}>暂时没有匹配的音色。</div> : null}
              <div className={styles.voiceGrid} role="list">
                {voices.map((voice) => (
                  <div key={voice.voiceId} className={`${styles.voiceCard} ${voiceRef === voice.voiceId ? styles.voiceCardSelected : ""}`} role="listitem">
                    <button type="button" className={styles.voiceCardMain} onClick={() => setVoiceRef(voice.voiceId)} aria-pressed={voiceRef === voice.voiceId}>
                      <span className={styles.voiceAvatar}>{voice.name.slice(0, 1).toUpperCase()}</span>
                      <span className={styles.voiceCardCopy}><strong>{voice.name}</strong><small>{voice.labels.use_case || voice.labels.accent || voice.category || "通用配音"}</small></span>
                    </button>
                    {voice.previewUrl ? <button type="button" className={styles.voicePreview} onClick={() => toggleVoicePreview(voice)} aria-label={`${playingVoiceId === voice.voiceId ? "停止" : "试听"}${voice.name}`}>{playingVoiceId === voice.voiceId ? "停止" : "试听"}</button> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <label className={styles.legacyVoiceField}>Voice Identity（可选）<input type="text" value={voiceRef} onChange={(e) => setVoiceRef(e.target.value)} placeholder="voice-id" /></label>
          )}
          <div className={styles.controls}>
            <label>语言<select value={language} onChange={(e) => setLanguage(e.target.value)}><option value="zh-CN">中文</option><option value="en">English</option></select></label>
            <label>情绪<select value={emotion} onChange={(e) => setEmotion(e.target.value)}>{EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}</select></label>
            <label>速度 {speed.toFixed(1)}×<input type="range" min={0.7} max={1.2} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.generate} disabled={!canGenerate} onClick={() => void generate()} data-testid="voice-generate">{generating ? "生成中…" : "生成试听"}</button>
            {providerName === "elevenlabs" && !voiceRef && providerAvailable === true ? <span className={styles.warn}>请先选择 ElevenLabs 音色。</span> : null}
            {providerAvailable === false ? <span className={styles.warn}>配音服务未配置（服务端状态），按钮禁用。</span> : null}
          </div>
          {result ? <div className={result.ok ? styles.ok : styles.err} role="status">{result.message}</div> : null}
          {audioUrl ? <div className={styles.generatedAudio}><audio controls src={audioUrl} aria-label="生成的配音预览" />{downloadUrl ? <a href={downloadUrl} className={styles.download} download>下载配音</a> : null}</div> : null}
        </>
      )}
    </div>
  );
}
