"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { HeroSection } from "@/components/home/HeroSection";
import { IgniteDemoSection } from "@/components/home/IgniteDemoSection";
import { SiteFooter } from "@/components/home/SiteFooter";
import { AuthModal } from "@/components/layout/AuthModal";
import { TopNav } from "@/components/layout/TopNav";
import {
  hasWorkspaceModalPostLoginAction,
  requestWorkspaceModalAfterLogin,
  useWorkspaceModal,
} from "@/hooks/use-workspace-modal";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "signin" | "signup";

/**
 * T01 六色三时 落地页
 * 结构（自上而下，全长 ≤4 屏）：
 *   1. Hero 区（三场景按时段切换 + 猫标 + slogan 三行入场 + 单 CTA）
 *   2. 点亮演示区（Ignite v0，静态 mock）
 *   3. 页脚（版权 + 邮箱 + 语言切换）
 * 旧版七屏同构 ContentSection 已下线（保留组件文件以便回滚）。
 */
export default function LandingPage() {
  const router = useRouter();
  const { openModal } = useWorkspaceModal();
  const [session, setSession] = useState<Session | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession)) || {};

    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && hasWorkspaceModalPostLoginAction()) {
      openModal();
    }
  }, [session, openModal]);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    setSession(null);
  }

  function enterWriterRoom() {
    router.push("/dashboard");
  }

  function enterWorkspaceModal() {
    if (session) {
      openModal();
      return;
    }

    requestWorkspaceModalAfterLogin();
    openAuth("signin");
  }

  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
    setAuthOpen(true);
  }

  return (
    <main className="kiikis-site kiikis-landing-page">
      <TopNav
        session={session}
        onEnterRoom={enterWriterRoom}
        onSignIn={() => openAuth("signin")}
        onSignUp={() => openAuth("signup")}
        onSignOut={signOut}
      />
      <AuthModal open={authOpen} mode={authMode} onClose={() => setAuthOpen(false)} />
      <HeroSection onStartCreating={enterWorkspaceModal} />
      <IgniteDemoSection />
      <SiteFooter />
    </main>
  );
}
