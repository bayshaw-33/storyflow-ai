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
        <h1>
          {authMode === "signup"
            ? isZh ? "今天就开始你的第一个宇宙" : "Start Your First Universe Today"
            : isZh ? "欢迎回到你的宇宙" : "Welcome Back To Your Universe"}
        </h1>
        <p>
          {authMode === "signup"
            ? isZh
              ? "免费开始。3,000 创作积分等候领取。五个工作流。一个共享宇宙。"
              : "Free to start. 3,000 creation credits waiting. Five workflows. One shared Universe."
            : isZh
              ? "从上次中断的地方继续。你的角色、项目和草稿都在这里等你。"
              : "Pick up where you left. Your characters, projects, and drafts are waiting."}
        </p>
      </section>
      <section className="dashboard-panel auth-route-card">
        {session ? (
          <>
            <strong>{session.user.email}</strong>
            <Link className="primary-button" href="/dashboard">{isZh ? "打开工作台" : "Open Workspace"}</Link>
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
              {isZh ? "登录" : "Sign In"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setAuthMode("signup");
                setAuthOpen(true);
              }}
            >
              {isZh ? "建造我的宇宙" : "Build My Universe"}
            </button>
          </>
        )}
      </section>
      <AuthModal open={authOpen && !session} mode={authMode} onClose={() => setAuthOpen(false)} />
    </main>
  );
}
