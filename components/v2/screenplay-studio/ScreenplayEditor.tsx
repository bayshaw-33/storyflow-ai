"use client";

/**
 * 当前文档抽屉。保存创建 Unit Version（CAS baseVersionId），409 冲突显示
 * 处置条而不是覆盖；确认可用版本只是一个可回退的工作流 checkpoint。
 */

import { useEffect, useRef, useState } from "react";
import { emptyUnitSuggestion } from "@/lib/client/v2/screenplay-studio/types";
import type { ScreenplayUnitClientDto } from "@/lib/client/v2/screenplay-studio/api";
import styles from "./ScreenplayStudio.module.css";

export interface ScreenplayEditorProps {
  unit: ScreenplayUnitClientDto | null;
  content: string;
  saving: boolean;
  conflict: { currentVersionId: string | null } | null;
  onContentChange: (body: string) => void;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onConfirmUsable: () => void;
  confirming: boolean;
}

export function ScreenplayEditor({
  unit,
  content,
  saving,
  conflict,
  onContentChange,
  onTitleChange,
  onSave,
  onConfirmUsable,
  confirming,
}: ScreenplayEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);

  // 切换 unit 时恢复光标附近位置（保存于 data-caret）
  useEffect(() => {
    if (unit && textareaRef.current) {
      const saved = Number((unit as unknown as { __caret?: number }).__caret ?? 0);
      const el = textareaRef.current;
      requestAnimationFrame(() => {
        el.focus({ preventScroll: true });
        const pos = Math.min(saved, el.value.length);
        el.setSelectionRange(pos, pos);
      });
    }
  }, [unit]);

  if (!unit) {
    return (
      <div className={styles.editorBody}>
        <div className={styles.emptyHints}>
          <div className={styles.emptyHintTitle}>从左侧选择一个节点，或新建一个开始写作</div>
          <div className={styles.placeholder}>世界观、角色、大纲、分集、正文都可以作为起点，没有顺序要求。</div>
        </div>
      </div>
    );
  }

  const isEmpty = !content || content.trim().length === 0;
  const suggestion = emptyUnitSuggestion(unit.type);

  return (
    <>
      <div className={styles.editorHeader}>
        <input
          className={styles.editorTitleInput}
          value={unit.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="节点标题"
          aria-label="节点标题"
        />
        <span className={styles.readinessLabel}>{unit.readiness === "finalized" ? "已确认可用" : unit.readiness}</span>
      </div>
      <div className={styles.editorBody}>
        {isEmpty ? (
          <div className={styles.emptyHints} data-testid="empty-hints">
            <div className={styles.emptyHintTitle}>这里还是空的。可以：</div>
            {suggestion.hints.map((hint) => (
              <button
                key={hint}
                type="button"
                className={styles.emptyHintItem}
                onClick={() => {
                  onContentChange(hint);
                  textareaRef.current?.focus();
                }}
              >
                {hint}
              </button>
            ))}
            <button
              type="button"
              className={styles.staleActionBtn}
              data-testid="continue-writing"
              onClick={() => textareaRef.current?.focus()}
            >
              继续创作
            </button>
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          className={styles.editorTextarea}
          value={content}
          aria-label="正文编辑区"
          onChange={(e) => {
            onContentChange(e.target.value);
            setCaret(e.target.selectionStart ?? 0);
          }}
          onBlur={() => {
            if (unit) (unit as unknown as { __caret?: number }).__caret = caret;
          }}
          placeholder="把想法写在这里，或回到上方和 KK 对话…"
          style={isEmpty ? { position: "absolute", left: -9999, top: 0 } : undefined}
        />
      </div>
      <div className={styles.editorFooter}>
        <span>{saving ? "保存中…" : unit.finalizedVersionId ? "可随时返回修改" : "草稿版本"}</span>
        <button type="button" className={styles.saveBtn} onClick={onSave} disabled={saving} data-testid="save-unit">
          {saving ? "保存中" : "保存版本"}
        </button>
        <button
          type="button"
          className={styles.confirmBtn}
          onClick={onConfirmUsable}
          disabled={saving || confirming || !unit.currentVersionId || Boolean(unit.finalizedVersionId)}
          data-testid="confirm-usable"
        >
          {confirming ? "确认中…" : unit.finalizedVersionId ? "已确认可用" : "确认可用版本"}
        </button>
      </div>
      {conflict ? (
        <div className={styles.conflictBar} data-testid="conflict-bar" role="alert">
          <span>这个节点被另一个会话修改过（版本 {conflict.currentVersionId ?? "?"}）。你的内容还在编辑区，刷新最新版后再合并，或覆盖创建新版本。</span>
          <button type="button" className={styles.staleActionBtn} onClick={() => window.location.reload()}>
            刷新最新版
          </button>
        </div>
      ) : null}
    </>
  );
}
