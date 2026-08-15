"use client";

/**
 * 配音台词编辑器 — Phase 5 Task 5.4.
 * 文本/语言/情绪/速度 + 生成按钮（Provider 不可用时禁用并说明原因）。
 * 生成失败保留文本与当前消息（不假成功）。
 */

import { useEffect, useState } from "react";
import styles from "./VoiceWorkbench.module.css";

export interface VoiceLineEditorProps {
  target: { kind: string; id: string; label: string } | null;
  providerAvailable: boolean | null;
  onProviderCheck?: (available: boolean, name?: string) => void;
}

const EMOTIONS = ["平静", "紧张", "激昂", "悲伤", "俏皮"];

export function VoiceLineEditor({ target, providerAvailable, onProviderCheck }: VoiceLineEditorProps) {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState("zh-CN");
  const [emotion, setEmotion] = useState("平静");
  const [speed, setSpeed] = useState(1.0);
  const [voiceRef, setVoiceRef] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    // 服务端只暴露可用性与名称，不暴露任何密钥
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

  const generate = async () => {
    if (!target || !text.trim()) return;
    setGenerating(true);
    setResult(null);
    try {
      const response = await fetch("/api/voice-lines/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetKind: target.kind,
          targetId: target.id,
          text: text.trim(),
          language,
          emotion,
          speed,
          voiceRef: voiceRef || null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; jobId?: string };
      if (!response.ok || !body.success) {
        setResult({ ok: false, message: body.error ?? `生成失败 (${response.status})` });
        return;
      }
      setResult({ ok: true, message: `生成任务已提交（${body.jobId ?? ""}）。` });
    } catch {
      setResult({ ok: false, message: "生成失败，当前文本已保留。" });
    } finally {
      setGenerating(false);
    }
  };

  const canGenerate = Boolean(target) && Boolean(text.trim()) && providerAvailable === true && !generating;

  return (
    <div className={styles.editor} data-testid="voice-line-editor">
      {!target ? (
        <div className={styles.empty}>从左侧选择一个配音目标。</div>
      ) : (
        <>
          <div className={styles.targetLabel}>
            {target.kind === "character" ? "角色声音" : target.kind === "narration" ? "旁白" : "台词"} · {target.label}
          </div>
          <textarea
            className={styles.textArea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入要配音的文本…"
            aria-label="配音文本"
            rows={5}
          />
          <div className={styles.controls}>
            <label>
              语言
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="zh-CN">中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              情绪
              <select value={emotion} onChange={(e) => setEmotion(e.target.value)}>
                {EMOTIONS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </label>
            <label>
              速度 {speed.toFixed(1)}×
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.1}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
            </label>
            <label>
              Voice Identity（可选）
              <input
                type="text"
                value={voiceRef}
                onChange={(e) => setVoiceRef(e.target.value)}
                placeholder="voice-id"
              />
            </label>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.generate} disabled={!canGenerate} onClick={() => void generate()} data-testid="voice-generate">
              {generating ? "生成中…" : "生成试听"}
            </button>
            {providerAvailable === false ? (
              <span className={styles.warn}>配音服务未配置（服务端状态），按钮禁用。</span>
            ) : null}
          </div>
          {result ? (
            <div className={result.ok ? styles.ok : styles.err} role="status">
              {result.message}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
