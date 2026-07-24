"use client";

import { useState } from "react";
import { Lock, Loader2, ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./universe-share.module.css";

export interface SharePasswordGateProps {
  universeId: string;
  universe: {
    name: string;
    cover_url?: string;
    owner_username?: string;
    owner_display_name?: string;
    owner_avatar_url?: string;
  };
  onVerified: (token: string) => void;
}

/**
 * 访客密码输入页（客户端组件）。
 * 居中暗色玻璃卡片 + 锁图标 + 宇宙封面/名称/创作者 + 密码输入。
 * 提交调 POST /api/universes/[id]/share/verify，成功后回调 onVerified(token)。
 */
export function SharePasswordGate({ universeId, universe, onVerified }: SharePasswordGateProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (loading || !password) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/universes/${universeId}/share/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        // 不区分"宇宙不存在"与"密码错误"（防枚举），统一提示密码错误
        throw new Error("verify failed");
      }
      const data = (await res.json()) as { token: string };
      onVerified(data.token);
    } catch {
      setError(isZh ? "密码错误" : "Incorrect password");
    } finally {
      setLoading(false);
    }
  }

  const ownerLabel =
    universe.owner_display_name?.trim() ||
    (universe.owner_username ? `@${universe.owner_username}` : "");

  return (
    <div className={styles.gateWrap}>
      <div className={styles.gateCard}>
        <div className={styles.gateLock}>
          <Lock size={22} />
        </div>

        {universe.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.gateCover} src={universe.cover_url} alt={universe.name} />
        ) : null}

        <h1 className={styles.gateName}>{universe.name}</h1>

        {ownerLabel ? <p className={styles.gateOwner}>by {ownerLabel}</p> : null}

        <p className={styles.gateHint}>
          {isZh
            ? "请输入创作者提供的访问密码"
            : "Enter the access password provided by the creator"}
        </p>

        <form
          className={styles.gateForm}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            type="password"
            className={styles.input}
            value={password}
            autoFocus
            placeholder={isZh ? "访问密码" : "Access password"}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error ? <div className={styles.inlineError}>{error}</div> : null}

          <button
            type="submit"
            className={styles.gateSubmit}
            disabled={loading || !password}
          >
            {loading ? <Loader2 size={14} className="spin" /> : null}
            {isZh ? "进入" : "Enter"}
            {!loading ? <ArrowRight size={14} /> : null}
          </button>
        </form>
      </div>
    </div>
  );
}
