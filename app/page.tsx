"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { HeroSection } from "@/components/home/HeroSection";
import { ContentSection } from "@/components/home/ContentSection";
import { AuthModal } from "@/components/layout/AuthModal";
import { TopNav } from "@/components/layout/TopNav";
import {
  hasWorkspaceModalPostLoginAction,
  requestWorkspaceModalAfterLogin,
  useWorkspaceModal,
} from "@/hooks/use-workspace-modal";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "signin" | "signup";

export default function LandingPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const { openModal } = useWorkspaceModal();
  const isZh = locale === "zh-CN";
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

      <ContentSection
        id="section-1"
        kicker="KIIKIS"
        titleZh="小说 · 剧本 · 分镜 · 视频 · 歌曲"
        titleEn="Novel · Script · Storyboard · Video · Song"
        subtitleZh="五个工作流。一个宇宙。无限 IP。"
        subtitleEn="Five workflows. One Universe. Infinite IP."
        bgImageZh="url('/design/hero/section-1-ch.png')"
        bgImageEn="url('/design/hero/section-1-en.png')"
        align="left"
        lightBg={false}
      />

      <ContentSection
        id="platform"
        kicker="KIIKIS"
        titleZh="以宇宙为核心的超级创作工作台"
        titleEn="The Universe-First Creative Workbench"
        subtitleZh="五大专业工作流——小说、剧本、分镜、视频、歌曲——每个都能独立运转，通过 Universe 联动后势不可挡。角色一次定义，所有作品自动继承。"
        subtitleEn="Five professional workflows — Novel, Script, Storyboard, Video, Song — each powerful alone, unstoppable when linked through a shared Universe. Build your characters once. Let them live everywhere."
        bgImageZh="url('/design/hero/section-2-ch.png')"
        bgImageEn="url('/design/hero/section-2-en.png')"
        align="right"
        lightBg={false}
      />

      <ContentSection
        id="workflows"
        kicker={isZh ? "五大工作流" : "THE FIVE WORKFLOWS"}
        titleZh="每种格式，每种形式，一个互联的宇宙。"
        titleEn="Every Format. Every Form. One Connected Universe."
        subtitleZh={"小说 · 剧本 · 分镜 · 视频 · 歌曲\n选择任意入口开始，Universe 会把资产沉淀并联动起来。"}
        subtitleEn="Novel · Script · Storyboard · Video · Song"
        ctaLabel={isZh ? "探索全部工作流" : "Explore All Workflows"}
        ctaHref="/dashboard"
        bgImageZh="url('/design/hero/section-3-ch.png')"
        bgImageEn="url('/design/hero/section-3-en.png')"
        align="left"
        lightBg={false}
      />

      <ContentSection
        id="workspace"
        kicker="WORKSPACE"
        titleZh="你的工作台。你的规则。你的 AI。"
        titleEn="Your Workbench. Your Rules. Your AI."
        subtitleZh={"模块化布局。自带 API Key。在不同工作流之间无缝切换，上下文不丢失。\nPRO 创作者掌控创作环境的每一个角落。"}
        subtitleEn="Modular layout. Bring your own API keys. Switch between workflows without losing context. PRO creators own every corner of their creative environment."
        ctaLabel={isZh ? "了解 PRO" : "Learn PRO"}
        ctaHref="/subscription"
        bgImageZh="url('/design/hero/section-4-ch.png')"
        bgImageEn="url('/design/hero/section-4-en.png')"
        align="right"
        lightBg={false}
      />

      <ContentSection
        id="universe"
        kicker={isZh ? "宇宙 · 核心" : "UNIVERSE · THE CORE"}
        titleZh="一个宇宙。所有故事自动继承。"
        titleEn="One Universe. Every Story Inherits It."
        subtitleZh={"一次定义角色、世界观、时间线和正史规则——此后你创作的每部小说、剧本、分镜、视频和歌曲都自动继承它们。\n你的 IP 宇宙随项目生长，而非互相矛盾。"}
        subtitleEn="Define your characters, worlds, timelines, and canon rules once — then every novel, script, storyboard, video, and song you create inherits them automatically. Your IP universe grows with every project, not against it."
        ctaLabel={isZh ? "建造你的宇宙" : "Build Your Universe"}
        ctaHref="/universes"
        bgImageZh="radial-gradient(ellipse at 50% 30%, #0d1040 0%, #060a14 100%)"
        bgImageEn="radial-gradient(ellipse at 50% 30%, #0d1040 0%, #060a14 100%)"
        align="left"
        lightBg={false}
      />

      <ContentSection
        id="join"
        kicker="JOIN KIIKIS"
        titleZh="你的宇宙，今天启航"
        titleEn="Your Universe Starts Today"
        subtitleZh={"免费注册即获 3,000 创作积分，开始搭建。\n邀请一位创作者好友，每位奖励 5,000 积分（最多 3 位）。\n随时升级，解锁五大创作格式的高级工作流。"}
        subtitleEn={"Sign up free — get 3,000 creation credits to start building.\nInvite a creator friend and earn 5,000 more credits per referral (up to 3 friends).\nUpgrade anytime to unlock advanced workflows across all five creative formats."}
        ctaLabel={isZh ? "免费开始建造" : "Start Building Free"}
        ctaHref="/dashboard"
        bgImageZh="radial-gradient(ellipse at 50% 50%, #0d1a2a 0%, #060a14 100%)"
        bgImageEn="radial-gradient(ellipse at 50% 50%, #0d1a2a 0%, #060a14 100%)"
        align="center"
        lightBg={false}
      />
    </main>
  );
}
