"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./settings.module.css";

type AvatarAIGeneratorProps = {
  onGenerated: (url: string) => void;
};

const DAILY_LIMIT = 3;

/**
 * AI 生成头像子组件：prompt 输入 + 生成按钮。
 * 调用 POST /api/profile/avatar/ai-generate（每次 1 张，每日 3 次上限）。
 * 白名单校验由父组件 AvatarUploader 完成；本组件只负责生成。
 */
export function AvatarAIGenerator({ onGenerated }: AvatarAIGeneratorProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [remaining, setRemaining] = useState<number | null>(null);

  async function generate() {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/profile/avatar/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ prompt: trimmed }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { url?: string; remaining?: number; error?: string }
        | null;
      if (!response.ok || !payload?.url) {
        setError(payload?.error || (isZh ? "生成失败，请稍后重试" : "Generation failed, please retry"));
        if (typeof payload?.remaining === "number") setRemaining(payload.remaining);
        return;
      }
      if (typeof payload.remaining === "number") setRemaining(payload.remaining);
      onGenerated(payload.url);
    } catch {
      setError(isZh ? "网络错误" : "Network error");
    } finally {
      setLoading(false);
    }
  }

  const limitText = remaining === null
    ? isZh ? `每日上限 ${DAILY_LIMIT} 次` : `${DAILY_LIMIT} per day`
    : isZh ? `今日剩余 ${remaining}/${DAILY_LIMIT}` : `${remaining}/${DAILY_LIMIT} left today`;

  return (
    <div className={styles.aiPanel}>
      <div className={styles.aiHeader}>
        <span className={styles.label}>
          <Sparkles size={14} />
          {isZh ? "AI 生成头像" : "AI generate avatar"}
        </span>
        <span className={styles.aiLimit}>{limitText}</span>
      </div>
      <textarea
        className={styles.textarea}
        value={prompt}
        placeholder={isZh ? "描述你想要的头像风格，例如：赛博朋克霓虹光影下的侧脸肖像" : "Describe the avatar style, e.g. cyberpunk neon side-profile portrait"}
        disabled={loading}
        onChange={(event) => setPrompt(event.target.value)}
      />
      {error ? <span className={styles.errorText}>{error}</span> : null}
      <div className={styles.rowEnd}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={generate}
          disabled={loading || !prompt.trim()}
        >
          {loading ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
          {loading ? (isZh ? "生成中…" : "Generating…") : (isZh ? "生成头像" : "Generate")}
        </button>
      </div>
    </div>
  );
}
