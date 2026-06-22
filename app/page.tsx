"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { HeroSection } from "@/components/home/HeroSection";
import { SignatureSections } from "@/components/landing/SignatureSections";
import { TopNav } from "@/components/layout/TopNav";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const landingCopy = {
  "en-US": {
    statsLabel: "Platform capabilities",
    episodeDrafts: "Episodes per complete draft",
    writers: "Specialized AI writer roles",
    formats: "Story formats supported",
  },
  "zh-CN": {
    statsLabel: "平台能力",
    episodeDrafts: "集完整初稿",
    writers: "个专业 AI 编剧角色",
    formats: "种故事格式",
  },
};

export default function LandingPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const text = landingCopy[locale];
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession)) || {};

    return () => listener?.subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    setSession(null);
  }

  function enterWriterRoom() {
    router.push("/dashboard");
  }

  return (
    <main className="kiikis-site kiikis-landing-page">
      <TopNav
        session={session}
        onEnterRoom={enterWriterRoom}
        onSignIn={enterWriterRoom}
        onSignUp={enterWriterRoom}
        onSignOut={signOut}
      />
      <HeroSection onStartCreating={enterWriterRoom} />
      <section className="scroll-transition" aria-hidden="true" />
      <div className="container">
        <section className="kk-landing-stats" aria-label={text.statsLabel}>
          <div className="kk-stat-glass-card">
            <strong>60-80</strong>
            <span>{text.episodeDrafts}</span>
          </div>
          <div className="kk-stat-glass-card">
            <strong>5</strong>
            <span>{text.writers}</span>
          </div>
          <div className="kk-stat-glass-card">
            <strong>6</strong>
            <span>{text.formats}</span>
          </div>
        </section>
        <SignatureSections />
      </div>
    </main>
  );
}
