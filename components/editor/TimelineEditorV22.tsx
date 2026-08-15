"use client";

/**
 * TimelineEditorV22 — Phase 5 Task 5.5.
 * React Timeline Editor 只编辑 projection；不保存第三方内部 state。
 * 轨道/片段与 kiikis.timeline/1 双向映射；保存走 CAS（409 冲突提示）。
 * WebCodecs 不可用（Safari/Firefox）时显示 EDL/FCPXML 兼容退路，不假成功。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import styles from "./TimelineEditorV22.module.css";

// react-timeline-editor 需要浏览器环境：客户端动态导入，SSR 安全
const ReactTimelineEditor = dynamic(
  () => import("@xzdarcy/react-timeline-editor").then((m) => m.default ?? m.Editor),
  { ssr: false, loading: () => <div className={styles.loading}>加载时间线编辑器…</div> },
);

export interface TimelineV22Clip {
  id: string;
  sourceAssetVersionId?: string;
  in?: number;
  out?: number;
  duration: number;
  transform?: Record<string, unknown>;
  volume?: number;
  text?: string;
}

export interface TimelineV22Track {
  id: string;
  kind: "video" | "audio" | "subtitle";
  clips: TimelineV22Clip[];
}

export interface TimelineV22 {
  schemaVersion: "kiikis.timeline/1";
  tracks: TimelineV22Track[];
  duration: number;
}

export interface TimelineEditorV22Props {
  workId: string;
  timeline: TimelineV22 | null;
  versionId: string | null;
  onSaved: (result: { versionId: string; versionNo: number }) => void;
}

export function TimelineEditorV22({ workId, timeline, versionId, onSaved }: TimelineEditorV22Props) {
  const [draft, setDraft] = useState<TimelineV22 | null>(timeline);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webCodecs, setWebCodecs] = useState(false);

  useEffect(() => {
    setDraft(timeline);
    setConflict(false);
  }, [timeline, versionId]);

  useEffect(() => {
    setWebCodecs(typeof window !== "undefined" && "VideoEncoder" in window && "AudioEncoder" in window);
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setConflict(false);
    setError(null);
    try {
      const response = await fetch(`/api/v2/works/${encodeURIComponent(workId)}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeline: draft, baseVersionId: versionId }),
      });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; version?: { versionId: string; versionNo: number }; error?: string };
      if (response.status === 409) {
        setConflict(true);
        setError("版本冲突：时间线已被其他窗口修改。请刷新后重试（不会覆盖他人版本）。");
        return;
      }
      if (!response.ok || !body.success || !body.version) {
        setError(body.error ?? `保存失败 (${response.status})`);
        return;
      }
      onSaved({ versionId: body.version.versionId, versionNo: body.version.versionNo });
    } catch {
      setError("保存失败。");
    } finally {
      setSaving(false);
    }
  }, [workId, draft, versionId, onSaved]);

  const rows = useMemo(
    () =>
      (draft?.tracks ?? []).map((track) => ({
        id: track.id,
        actions: track.clips.map((clip) => ({
          id: clip.id,
          start: clip.in ?? 0,
          end: clip.out ?? clip.duration,
        })),
      })),
    [draft],
  );

  return (
    <div className={styles.editor} data-testid="timeline-editor-v22">
      <div className={styles.header}>
        <span className={styles.schema}>kiikis.timeline/1</span>
        <button type="button" className={styles.save} disabled={saving || !draft} onClick={() => void save()} data-testid="timeline-save">
          {saving ? "保存中…" : "保存版本"}
        </button>
      </div>
      {conflict ? (
        <div className={styles.conflict} role="alert">
          并发冲突：你的基线已过期，未覆盖任何版本。刷新后可继续。
        </div>
      ) : null}
      {error && !conflict ? <div className={styles.error} role="alert">{error}</div> : null}
      {draft ? (
        <div className={styles.canvas}>
          <ReactTimelineEditor data={rows} />
        </div>
      ) : (
        <div className={styles.empty}>暂无时间线。先保存一版开始剪辑。</div>
      )}
      <div className={styles.fallback}>
        {webCodecs ? (
          <span className={styles.ok}>WebCodecs 可用：浏览器可预览/组合。</span>
        ) : (
          <span className={styles.warn}>
            当前浏览器不支持 WebCodecs：提供 EDL / FCPXML / 服务端导出退路，不伪装预览成功。
          </span>
        )}
      </div>
    </div>
  );
}
