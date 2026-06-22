"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { BRAND_NAME } from "@/lib/brand";
import { useI18n } from "@/lib/i18n/useI18n";

type AuthMode = "signin" | "signup";

type AuthModalProps = {
  open: boolean;
  mode: AuthMode;
  onClose: () => void;
};

export function AuthModal({ open, mode, onClose }: AuthModalProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Reset transient fields whenever the modal is (re)opened so a stale
  // password/error from a previous attempt never lingers.
  useEffect(() => {
    if (open) {
      setError("");
      setPassword("");
    }
  }, [open]);

  if (!open) return null;

  async function submitAuth() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase 尚未配置，暂时只能使用本地草稿。");
      return;
    }

    setError("");
    const nextEmail = email.trim();
    const nextPassword = password.trim();
    if (!nextEmail || nextPassword.length < 6) {
      setError("请输入邮箱和至少 6 位密码。");
      return;
    }

    const result =
      mode === "signup"
        ? await supabase.auth.signUp({ email: nextEmail, password: nextPassword })
        : await supabase.auth.signInWithPassword({ email: nextEmail, password: nextPassword });

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setPassword("");
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>{BRAND_NAME}</h2>
        <p>{t("auth.cloudSaveHint")}</p>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("auth.email")}
          type="email"
        />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("auth.password")}
          type="password"
        />
        {error ? <div className="notice error">{error}</div> : null}
        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose}>{t("auth.cancel")}</button>
          <button className="primary-button" onClick={submitAuth}>
            {mode === "signup" ? t("auth.signUp") : t("auth.signIn")}
          </button>
        </div>
      </div>
    </div>
  );
}
