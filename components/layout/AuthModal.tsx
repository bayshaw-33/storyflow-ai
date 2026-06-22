"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { BRAND_NAME } from "@/lib/brand";
import { useI18n } from "@/lib/i18n/useI18n";

type AuthMode = "signin" | "signup";
type AuthView = "auth" | "forgot" | "sent";

type AuthModalProps = {
  open: boolean;
  mode: AuthMode;
  onClose: () => void;
};

// Where Supabase sends users back to after they click the password-reset
// email. Prefer the configured site URL (production Vercel domain); fall back
// to the current origin for local dev.
function resetRedirectUrl() {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/reset-password`;
}

export function AuthModal({ open, mode, onClose }: AuthModalProps) {
  const { t } = useI18n();
  const [view, setView] = useState<AuthView>("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset transient state whenever the modal is (re)opened so a stale
  // password/error/view from a previous attempt never lingers.
  useEffect(() => {
    if (open) {
      setView("auth");
      setError("");
      setPassword("");
      setBusy(false);
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

    setBusy(true);
    const result =
      mode === "signup"
        ? await supabase.auth.signUp({ email: nextEmail, password: nextPassword })
        : await supabase.auth.signInWithPassword({ email: nextEmail, password: nextPassword });
    setBusy(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setPassword("");
    onClose();
  }

  async function sendResetLink() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase 尚未配置，暂时只能使用本地草稿。");
      return;
    }

    setError("");
    const nextEmail = email.trim();
    if (!nextEmail) {
      setError(t("auth.email"));
      return;
    }

    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(nextEmail, {
      redirectTo: resetRedirectUrl(),
    });
    setBusy(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setView("sent");
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        {view === "auth" ? (
          <>
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
            {mode === "signin" ? (
              <button
                className="kk-text-button"
                type="button"
                onClick={() => {
                  setError("");
                  setView("forgot");
                }}
              >
                {t("auth.forgotPassword")}
              </button>
            ) : null}
            <div className="modal-actions">
              <button className="secondary-button" onClick={onClose} disabled={busy}>
                {t("auth.cancel")}
              </button>
              <button className="primary-button" onClick={submitAuth} disabled={busy}>
                {mode === "signup" ? t("auth.signUp") : t("auth.signIn")}
              </button>
            </div>
          </>
        ) : null}

        {view === "forgot" ? (
          <>
            <h2>{t("auth.resetTitle")}</h2>
            <p>{t("auth.resetHint")}</p>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("auth.email")}
              type="email"
            />
            {error ? <div className="notice error">{error}</div> : null}
            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  setError("");
                  setView("auth");
                }}
                disabled={busy}
              >
                {t("auth.backToSignIn")}
              </button>
              <button className="primary-button" onClick={sendResetLink} disabled={busy}>
                {t("auth.sendResetLink")}
              </button>
            </div>
          </>
        ) : null}

        {view === "sent" ? (
          <>
            <h2>{t("auth.resetTitle")}</h2>
            <div className="notice success">{t("auth.resetSent")}</div>
            <div className="modal-actions">
              <button className="primary-button" onClick={() => setView("auth")}>
                {t("auth.backToSignIn")}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
