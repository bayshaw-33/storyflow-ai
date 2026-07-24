"use client";

import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./settings.module.css";

type UsernameFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** 当前已绑定的 username（用于判断是否真的变更）。 */
  currentUsername?: string | null;
};

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "taken" }
  | { status: "invalid"; message: string }
  | { status: "cooldown"; daysLeft: number }
  | { status: "reserved" }
  | { status: "same" };

const USERNAME_REGEX = /^[a-z0-9_-]+$/;

function localValidate(value: string, isZh: boolean): string | null {
  if (value.length < 3 || value.length > 20) {
    return isZh ? "3-20 个字符" : "3-20 characters";
  }
  if (!USERNAME_REGEX.test(value)) {
    return isZh ? "仅限 a-z 0-9 _ -" : "Only a-z 0-9 _ - allowed";
  }
  if (value.startsWith("-") || value.endsWith("-")) {
    return isZh ? "不能以 - 开头或结尾" : "Cannot start or end with -";
  }
  return null;
}

/**
 * username 输入 + 校验：输入框 + 检查可用性按钮 + URL 预览。
 * 调用 GET /api/profile/check-username?username=xxx。
 * 显示：可用 / 已占用 / 保留字 / 冷静期剩余天数。
 */
export function UsernameField({ value, onChange, currentUsername }: UsernameFieldProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [state, setState] = useState<CheckState>({ status: "idle" });

  const trimmed = value.trim().toLowerCase();
  const localError = localValidate(trimmed, isZh);
  const isSameAsCurrent = !!currentUsername && trimmed === currentUsername.toLowerCase();
  const canCheck = trimmed.length > 0 && !localError && !isSameAsCurrent && state.status !== "checking";

  async function check() {
    if (!canCheck) return;
    setState({ status: "checking" });
    try {
      const response = await fetch(`/api/profile/check-username?username=${encodeURIComponent(trimmed)}`, {
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as
        | { available?: boolean; reason?: string; cooldownDaysLeft?: number }
        | null;
      if (!response.ok || !payload) {
        setState({ status: "invalid", message: isZh ? "校验失败，请重试" : "Check failed, please retry" });
        return;
      }
      if (payload.available) {
        setState({ status: "available" });
      } else if (payload.reason === "cooldown" && typeof payload.cooldownDaysLeft === "number") {
        setState({ status: "cooldown", daysLeft: payload.cooldownDaysLeft });
      } else if (payload.reason === "reserved") {
        setState({ status: "reserved" });
      } else if (payload.reason === "same") {
        setState({ status: "same" });
      } else {
        setState({ status: "taken" });
      }
    } catch {
      setState({ status: "invalid", message: isZh ? "网络错误" : "Network error" });
    }
  }

  function statusMessage(): { text: string; tone: "success" | "error" | "muted" } | null {
    switch (state.status) {
      case "available":
        return { text: isZh ? "可用" : "Available", tone: "success" };
      case "taken":
        return { text: isZh ? "已被占用" : "Already taken", tone: "error" };
      case "reserved":
        return { text: isZh ? "保留字，不可用" : "Reserved word", tone: "error" };
      case "same":
        return { text: isZh ? "与当前一致" : "Same as current", tone: "muted" };
      case "cooldown":
        return {
          text: isZh
            ? `冷静期剩余 ${state.daysLeft} 天` : `${state.daysLeft} days left in cooldown`,
          tone: "error",
        };
      case "invalid":
        return { text: state.message, tone: "error" };
      default:
        return null;
    }
  }

  const msg = statusMessage();

  return (
    <div className={styles.field}>
      <label className={styles.label}>
        {isZh ? "用户名" : "Username"}
        <span className={styles.labelHint}>{isZh ? "3-20 字符 · a-z 0-9 _ - · 30 天冷静期" : "3-20 chars · a-z 0-9 _ - · 30-day cooldown"}</span>
      </label>
      <div className={styles.usernameRow}>
        <input
          type="text"
          className={styles.input}
          value={value}
          placeholder="yourname"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => {
            onChange(event.target.value);
            if (state.status !== "idle") setState({ status: "idle" });
          }}
        />
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={check}
          disabled={!canCheck}
        >
          {state.status === "checking" ? (
            <Loader2 size={14} className="spin" />
          ) : (
            isZh ? "检查" : "Check"
          )}
        </button>
      </div>

      <div className={styles.urlPreview}>
        <strong>kiikis.com/u/</strong>
        {trimmed || "yourname"}
      </div>

      {localError && state.status === "idle" ? (
        <span className={`${styles.usernameStatus} ${styles.errorText}`}>{localError}</span>
      ) : null}

      {msg ? (
        <span
          className={`${styles.usernameStatus} ${
            msg.tone === "success" ? styles.successText : msg.tone === "error" ? styles.errorText : styles.hint
          }`}
        >
          {msg.tone === "success" ? <Check size={12} /> : msg.tone === "error" ? <X size={12} /> : null}
          {msg.text}
        </span>
      ) : null}
    </div>
  );
}
