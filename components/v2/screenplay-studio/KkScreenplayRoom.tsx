"use client";

/**
 * KK 剧本室 — Phase 3 Task 3.4 · 2026-08-16 production hotfix.
 * 两种操作语义：
 *   - 聊一聊（discuss）：只追加对话，永不动正文。
 *   - 生成修改方案（propose_change）：产生 Candidate Diff，逐块审阅，
 *     显式采用后才创建版本（服务端原子 RPC 完成状态转换）。
 * 失败保护：生成失败保留输入与消息，重试复用同一快照。
 * 会话历史由父组件从服务端加载（刷新不丢）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  resolveKkActionMode,
  type CandidateDiffViewModel,
  createCandidateDiffViewModel,
  nextDiffReviewState,
} from "@/lib/client/v2/screenplay-studio/types";
import {
  screenplayStudioApi,
  ScreenplayStudioApiError,
} from "@/lib/client/v2/screenplay-studio/api";
import { CandidateDiffPanel } from "./CandidateDiffPanel";
import styles from "./ScreenplayStudio.module.css";

export interface KkMessage {
  id: string;
  role: string;
  content: string;
}

export interface KkCandidate {
  id: string;
  status: string;
  patches: Array<{ unitPath: string; before: string; after: string }>;
}

export interface KkContextSummary {
  label: string;
  detail: string;
}

export interface KkPresetInput {
  text: string;
  mode: "discuss" | "propose_change";
  contextLabel?: string;
}

export interface KkScreenplayRoomProps {
  workId: string;
  conversationId: string;
  messages: KkMessage[];
  pendingCandidate: KkCandidate | null;
  contextSummary: KkContextSummary | null;
  presetInput?: KkPresetInput | null;
  onPresetConsumed?: () => void;
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
  contextSummary,
  presetInput,
  onPresetConsumed,
  onMessagesChange,
  onCandidateChange,
  onAppliedVersion,
  onInputPreserved,
  preservedInput,
}: KkScreenplayRoomProps) {
  const [input, setInput] = useState(preservedInput);
  const [mode, setMode] = useState<"discuss" | "propose_change">("discuss");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [diffVm, setDiffVm] = useState<CandidateDiffViewModel | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // 外部工具（本土化等）注入的预设输入。
  useEffect(() => {
    if (!presetInput) return;
    setInput(presetInput.text);
    setMode(presetInput.mode);
    onInputPreserved(presetInput.text);
    onPresetConsumed?.();
  }, [presetInput, onInputPreserved, onPresetConsumed]);

  // 新消息时滚到底部（会话恢复后同样生效）。
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pendingCandidate?.id]);

  const describeError = useCallback((e: unknown): { message: string; requestId?: string } => {
    if (e instanceof ScreenplayStudioApiError) {
      return { message: e.userMessage, requestId: e.requestId };
    }
    return { message: e instanceof Error ? e.message : "请求失败；你的输入已保留，可重试。" };
  }, []);

  const runAction = useCallback(
    async (action: "discuss" | "propose_change", text: string) => {
      if (!text.trim()) return;
      setBusy(true);
      setError(null);
      onInputPreserved(text);
      try {
        if (action === "discuss") {
          const body = await screenplayStudioApi.discuss(workId, {
            conversationId,
            userMessage: text,
            clientContext: contextSummary ? `${contextSummary.label} · ${contextSummary.detail}`.slice(0, 200) : undefined,
          });
          const next = [...messages];
          if (!next.some((m) => m.id === body.userMessage.id)) next.push(body.userMessage);
          if (!next.some((m) => m.id === body.assistantMessage.id)) next.push(body.assistantMessage);
          onMessagesChange(next);
        } else {
          const body = await screenplayStudioApi.proposeChange(workId, {
            conversationId,
            userMessage: text,
            scope: { kind: "all" },
            clientContext: contextSummary ? `${contextSummary.label} · ${contextSummary.detail}`.slice(0, 200) : undefined,
          });
          // propose 的用户/助手消息在服务端追加；拉取最新会话保持一致。
          try {
            const history = await screenplayStudioApi.listMessages(workId, conversationId);
            onMessagesChange(history);
          } catch {
            /* 历史拉取失败不阻断候选展示 */
          }
          if (body.candidate) {
            onCandidateChange(body.candidate);
            setDiffVm(createCandidateDiffViewModel(body.candidate));
          }
        }
        setInput("");
        onInputPreserved("");
      } catch (e) {
        // 失败保护：输入、消息、旧候选全部保留
        const described = describeError(e);
        setError({
          message: described.requestId ? `${described.message}（编号 ${described.requestId}）` : described.message,
          requestId: described.requestId,
        });
        retryRef.current = () => void runAction(action, text);
      } finally {
        setBusy(false);
      }
    },
    [workId, conversationId, messages, contextSummary, onMessagesChange, onCandidateChange, onInputPreserved, describeError],
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
        const body = await screenplayStudioApi.applyCandidate(workId, {
          candidateId: pendingCandidate.id,
          acceptedPatchIndexes: acceptedIndexes,
        });
        onAppliedVersion(body.version.id);
        onCandidateChange(null);
        setDiffVm(null);
      } catch (e) {
        setError(describeError(e));
      } finally {
        setBusy(false);
      }
    },
    [workId, pendingCandidate, onAppliedVersion, onCandidateChange, describeError],
  );

  const rejectCandidate = useCallback(async () => {
    if (!pendingCandidate) return;
    setBusy(true);
    try {
      await screenplayStudioApi.rejectCandidate(workId, { candidateId: pendingCandidate.id });
      onCandidateChange(null);
      setDiffVm(null);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }, [workId, pendingCandidate, onCandidateChange, describeError]);

  return (
    <div className={styles.kkConversation} data-testid="kk-screenplay-room">
      {contextSummary ? (
        <div className={styles.kkContextChip} data-testid="kk-context">
          <span className={styles.kkContextLabel}>{contextSummary.label}</span>
          <span className={styles.kkContextDetail}>{contextSummary.detail}</span>
        </div>
      ) : null}
      <div className={styles.kkTranscript} ref={transcriptRef}>
        {messages.length === 0 ? (
          <div className={styles.kkWelcome}>
            <div className={styles.kkWelcomeEyebrow}>KK · AI 剧本伙伴</div>
            <h2>从你的意图开始，和剧本一起长出来。</h2>
            <p>可以先讨论世界观、角色和剧情，也可以让 KK 生成逐块可审阅的修改方案。对话不会静默改动正文。</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`${styles.kkMessage} ${m.role === "user" ? styles.kkMessageUser : styles.kkMessageAssistant}`}>
              <div className={styles.kkMessageRole}>{m.role === "user" ? "我" : "KK"}</div>
              <div className={styles.kkMessageContent}>{m.content}</div>
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
            {error.message}
            <div className={styles.staleActions}>
              <button type="button" className={styles.staleActionBtn} onClick={() => retryRef.current?.()}>
                重试（复用同一快照）
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className={styles.kkComposer}>
        <div className={styles.kkModeRow}>
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
          style={{ minHeight: 96 }}
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
