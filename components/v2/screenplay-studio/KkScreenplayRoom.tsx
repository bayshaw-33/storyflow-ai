"use client";

/**
 * KK 剧本室 — Phase 3 Task 3.4.
 * 两种操作语义：
 *   - 聊一聊（discuss）：只追加对话，永不动正文。
 *   - 生成修改方案（propose_change）：产生 Candidate Diff，逐块审阅，
 *     显式采用后才创建版本。
 * 失败保护：生成失败保留输入与消息，重试复用同一快照。
 */

import { useCallback, useRef, useState } from "react";
import {
  resolveKkActionMode,
  type CandidateDiffViewModel,
  createCandidateDiffViewModel,
  nextDiffReviewState,
} from "@/lib/client/v2/screenplay-studio/types";
import { fetchScreenplayStudio } from "@/lib/client/v2/screenplay-studio/auth";
import { CandidateDiffPanel } from "./CandidateDiffPanel";
import styles from "./ScreenplayStudio.module.css";

export interface KkMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface KkCandidate {
  id: string;
  status: string;
  patches: Array<{ unitPath: string; before: string; after: string }>;
}

export interface KkScreenplayRoomProps {
  workId: string;
  conversationId: string;
  messages: KkMessage[];
  pendingCandidate: KkCandidate | null;
  onMessagesChange: (messages: KkMessage[]) => void;
  onCandidateChange: (candidate: KkCandidate | null) => void;
  onAppliedVersion: (versionId: string) => void;
  onInputPreserved: (text: string) => void;
  preservedInput: string;
}

export function KkScreenplayRoom({
  workId,
  conversationId,
  messages,
  pendingCandidate,
  onMessagesChange,
  onCandidateChange,
  onAppliedVersion,
  onInputPreserved,
  preservedInput,
}: KkScreenplayRoomProps) {
  const [input, setInput] = useState(preservedInput);
  const [mode, setMode] = useState<"discuss" | "propose_change">("discuss");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffVm, setDiffVm] = useState<CandidateDiffViewModel | null>(null);
  const retryRef = useRef<(() => void) | null>(null);

  const runAction = useCallback(
    async (action: "discuss" | "propose_change", text: string) => {
      if (!text.trim()) return;
      setBusy(true);
      setError(null);
      onInputPreserved(text);
      try {
        const response = await fetchScreenplayStudio(`/api/v2/works/${encodeURIComponent(workId)}/screenplay/${action === "discuss" ? "discuss" : "propose-change"}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, userMessage: text }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          userMessage?: KkMessage;
          assistantMessage?: KkMessage;
          candidate?: KkCandidate;
        };
        if (!response.ok || !body.success) throw new Error(body.error ?? `请求失败 (${response.status})`);
        const next = [...messages];
        if (body.userMessage && !next.some((m) => m.id === body.userMessage!.id)) next.push(body.userMessage);
        if (body.assistantMessage && !next.some((m) => m.id === body.assistantMessage!.id)) next.push(body.assistantMessage);
        onMessagesChange(next);
        if (action === "propose_change" && body.candidate) {
          onCandidateChange(body.candidate);
          setDiffVm(createCandidateDiffViewModel(body.candidate));
        }
        setInput("");
        onInputPreserved("");
      } catch (e) {
        // 失败保护：输入、消息、旧候选全部保留
        setError(e instanceof Error ? e.message : "请求失败；你的输入已保留，可重试。");
        retryRef.current = () => void runAction(action, text);
      } finally {
        setBusy(false);
      }
    },
    [workId, conversationId, messages, onMessagesChange, onCandidateChange, onInputPreserved],
  );

  const handleSend = useCallback(() => {
    const resolved = resolveKkActionMode(mode === "discuss" ? "聊一聊" : "生成修改方案");
    void runAction(resolved, input);
  }, [mode, input, runAction]);

  const applyCandidate = useCallback(
    async (acceptedIndexes: number[]) => {
      if (!pendingCandidate) return;
      setBusy(true);
      try {
        const response = await fetchScreenplayStudio(`/api/v2/works/${encodeURIComponent(workId)}/screenplay/propose-change`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId: pendingCandidate.id, acceptedPatchIndexes: acceptedIndexes }),
        });
        const body = (await response.json().catch(() => ({}))) as { success?: boolean; version?: { id: string }; error?: string };
        if (!response.ok || !body.success || !body.version) throw new Error(body.error ?? "采用失败");
        onAppliedVersion(body.version.id);
        onCandidateChange(null);
        setDiffVm(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "采用失败");
      } finally {
        setBusy(false);
      }
    },
    [workId, pendingCandidate, onAppliedVersion, onCandidateChange],
  );

  const rejectCandidate = useCallback(async () => {
    if (!pendingCandidate) return;
    setBusy(true);
    try {
      const response = await fetchScreenplayStudio(`/api/v2/works/${encodeURIComponent(workId)}/screenplay/propose-change`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: pendingCandidate.id }),
      });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !body.success) throw new Error(body.error ?? "拒绝失败");
      onCandidateChange(null);
      setDiffVm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "拒绝失败");
    } finally {
      setBusy(false);
    }
  }, [workId, pendingCandidate, onCandidateChange]);

  return (
    <div data-testid="kk-screenplay-room">
      <div className={styles.tabBody}>
        {messages.length === 0 ? (
          <div className={styles.placeholder}>和 KK 聊聊这场戏。“聊一聊”只讨论不改稿；“生成修改方案”会给出可审阅的修改块。</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 10 }}>
              <div className={styles.placeholder}>{m.role === "user" ? "我" : "KK"}</div>
              <div>{m.content}</div>
            </div>
          ))
        )}
        {pendingCandidate && diffVm ? (
          <CandidateDiffPanel
            vm={diffVm}
            onToggleHunk={(index, accepted) => setDiffVm((prev) => (prev ? nextDiffReviewState(prev, index, accepted) : prev))}
            onApply={() => void applyCandidate(diffVm.hunks.map((h, i) => (h.accepted ? i : -1)).filter((i) => i >= 0))}
            onReject={() => void rejectCandidate()}
            disabled={busy}
          />
        ) : null}
        {error ? (
          <div className={styles.staleRow} role="alert">
            {error}
            <div className={styles.staleActions}>
              <button type="button" className={styles.staleActionBtn} onClick={() => retryRef.current?.()}>
                重试（复用同一快照）
              </button>
            </div>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button
            type="button"
            className={`${styles.tabBtn} ${mode === "discuss" ? styles.active : ""}`}
            onClick={() => setMode("discuss")}
            data-testid="mode-discuss"
          >
            聊一聊
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${mode === "propose_change" ? styles.active : ""}`}
            onClick={() => setMode("propose_change")}
            data-testid="mode-propose"
          >
            生成修改方案
          </button>
        </div>
        <textarea
          className={styles.editorTextarea}
          style={{ minHeight: 80 }}
          value={input}
          aria-label="KK 输入"
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === "discuss" ? "说说你的想法…" : "描述想要的修改，KK 会给出待审阅的修改块…"}
        />
        <button type="button" className={styles.saveBtn} onClick={handleSend} disabled={busy || !input.trim()} data-testid="kk-send">
          {busy ? "处理中…" : mode === "discuss" ? "发送" : "生成修改方案"}
        </button>
      </div>
    </div>
  );
}
