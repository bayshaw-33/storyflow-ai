"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { AuthModal } from "@/components/layout/AuthModal";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";

type AuthMode = "signin" | "signup";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="cosmic-page auth-route-page" />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const initialMode: AuthMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
  const [authOpen, setAuthOpen] = useState(true);

  useEffect(() => {
    setAuthMode(initialMode);
    setAuthOpen(true);
  }, [initialMode]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        if (nextSession) router.replace("/dashboard");
      }) ?? {};

    return () => listener?.subscription.unsubscribe();
  }, [router]);

  return (
    <main className="cosmic-page auth-route-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
      </header>
      <section className="cosmic-title-band">
        <span>{isZh ? "账号" : "Account"}</span>
        <h1>{isZh ? "登录 Kiikis" : "Sign in to Kiikis"}</h1>
        <p>{isZh ? "登录后可同步项目、使用 AI 额度并访问会员功能。" : "Sign in to sync projects, use AI credits, and access member features."}</p>
      </section>
      <section className="dashboard-panel auth-route-card">
        {session ? (
          <>
            <strong>{session.user.email}</strong>
            <Link className="primary-button" href="/dashboard">{isZh ? "进入工作台" : "Open dashboard"}</Link>
          </>
        ) : (
          <>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setAuthMode("signin");
                setAuthOpen(true);
              }}
            >
              {isZh ? "登录" : "Sign in"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setAuthMode("signup");
                setAuthOpen(true);
              }}
            >
              {isZh ? "注册" : "Create account"}
            </button>
          </>
        )}
      </section>
      <AuthModal open={authOpen && !session} mode={authMode} onClose={() => setAuthOpen(false)} />
    </main>
  );
}
