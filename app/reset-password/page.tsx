"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { BRAND_NAME } from "@/lib/brand";
import { useI18n } from "@/lib/i18n/useI18n";

type Status = "idle" | "saving" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  // The browser client has detectSessionInUrl enabled, so arriving via the
  // recovery link establishes a short-lived recovery session and fires a
  // PASSWORD_RECOVERY event. We only enable the form once that session exists.
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasSession(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setHasSession(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function submit() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase 尚未配置。");
      return;
    }

    setError("");
    const next = password.trim();
    if (next.length < 6) {
      setError(t("resetPassword.tooShort"));
      return;
    }

    setStatus("saving");
    const { error: updateError } = await supabase.auth.updateUser({ password: next });

    if (updateError) {
      setStatus("idle");
      setError(updateError.message);
      return;
    }

    setStatus("done");
    // Drop the recovery session and send them back to sign in fresh.
    await supabase.auth.signOut();
    setTimeout(() => router.push("/dashboard"), 1600);
  }

  return (
    <main className="kiikis-site">
      <section style={{ maxWidth: 480, margin: "120px auto 0", padding: "0 20px" }}>
        <div className="modal" style={{ maxWidth: 480 }}>
          <h2>{BRAND_NAME}</h2>
          {status === "done" ? (
            <div className="notice success">{t("resetPassword.success")}</div>
          ) : (
            <>
              <p>{t("resetPassword.title")}</p>
              <p className="subtle" style={{ marginTop: 0 }}>{t("resetPassword.hint")}</p>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("resetPassword.newPassword")}
                type="password"
                disabled={!hasSession || status === "saving"}
              />
              {!hasSession ? (
                <div className="notice">{t("resetPassword.invalidLink")}</div>
              ) : null}
              {error ? <div className="notice error">{error}</div> : null}
              <div className="modal-actions">
                <button
                  className="primary-button"
                  onClick={submit}
                  disabled={!hasSession || status === "saving"}
                >
                  {t("resetPassword.submit")}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
