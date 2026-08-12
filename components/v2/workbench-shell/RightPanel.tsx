"use client";

import { memo, useState } from "react";
import { Lightbulb, MessageSquare, Send, Settings2, Sparkles } from "lucide-react";
import type { AiContext, ModelSettings } from "@/lib/client/v2/workbench/types";
import styles from "./workbench-shell.module.css";

export interface RightPanelProps {
  aiContext: AiContext;
  modelSettings: ModelSettings;
  locale: string;
}

function RightPanelComponent({ aiContext, modelSettings, locale }: RightPanelProps) {
  const isZh = locale === "zh-CN";
  const [draft, setDraft] = useState("");

  const handleSend = () => {
    // 外壳只负责 UI，实际发送由各工作台通过 adapter 接管。
    // 这里清空输入框，真实接入时由工作台覆盖 onSend。
    setDraft("");
  };

  return (
    <aside className={styles.rightPanel}>
      {/* AI 对话面板 */}
      <section className={styles.panelSection}>
        <h2 className={styles.panelTitle}>
          <MessageSquare size={12} />
          {isZh ? "AI 对话" : "AI Chat"}
        </h2>
        <div className={styles.aiMessages}>
          {aiContext.recentMessages.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {isZh ? "开始与 AI 对话。" : "Start a conversation."}
            </div>
          ) : (
            aiContext.recentMessages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.aiMessage}${msg.role === "user" ? ` ${styles.aiMessageUser}` : ` ${styles.aiMessageAssistant}`}`}
              >
                {msg.content}
              </div>
            ))
          )}
        </div>
        <textarea
          className={styles.aiInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isZh ? "输入消息..." : "Type a message..."}
          rows={3}
        />
        <button type="button" className={styles.aiSend} onClick={handleSend} disabled={!draft.trim()}>
          <Send size={12} />
          {isZh ? "发送" : "Send"}
        </button>
      </section>

      {/* 建议 */}
      {aiContext.suggestions.length > 0 && (
        <section className={styles.panelSection}>
          <h2 className={styles.panelTitle}>
            <Lightbulb size={12} />
            {isZh ? "建议" : "Suggestions"}
          </h2>
          <ul className={styles.suggestionList}>
            {aiContext.suggestions.map((s, i) => (
              <li key={i} className={styles.suggestionItem}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 模型设置 */}
      <section className={styles.panelSection}>
        <h2 className={styles.panelTitle}>
          <Settings2 size={12} />
          {isZh ? "模型设置" : "Model"}
        </h2>
        <div className={styles.modelRow}>
          <span>{isZh ? "模式" : "Mode"}</span>
          <span className={styles.modelValue}>
            <Sparkles size={11} style={{ display: "inline", marginRight: 4 }} />
            {modelSettings.mode === "smart" ? (isZh ? "智能" : "Smart") : isZh ? "手动" : "Manual"}
          </span>
        </div>
        {modelSettings.currentModel && (
          <div className={styles.modelRow}>
            <span>{isZh ? "当前模型" : "Model"}</span>
            <span className={styles.modelValue}>{modelSettings.currentModel}</span>
          </div>
        )}
        {modelSettings.recommendationReason && (
          <p className={styles.modelReason}>{modelSettings.recommendationReason}</p>
        )}
      </section>
    </aside>
  );
}

export const RightPanel = memo(RightPanelComponent);
