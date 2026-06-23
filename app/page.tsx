"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { HeroSection } from "@/components/home/HeroSection";
import { ContentSection } from "@/components/home/ContentSection";
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
  const isZh = locale === "zh-CN";
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

      <ContentSection
        id="platform"
        kicker="KIIKIS"
        titleZh="创作者的 AI 宇宙"
        titleEn="The AI Universe for Creators"
        subtitleZh="短剧、歌曲、爆款视频、小说——所有创作，一个平台。AI 全程协作，从灵感到交付。"
        subtitleEn="Short drama, music, viral video, novels — all your creative work, one platform."
        bgImageZh="radial-gradient(ellipse at 60% 50%, #0d1a3a 0%, #060a14 100%)"
        bgImageEn="radial-gradient(ellipse at 60% 50%, #0d1a3a 0%, #060a14 100%)"
        align="left"
        lightBg={false}
      />

      <ContentSection
        id="workflows"
        kicker="WORKFLOWS"
        titleZh="为每种创作，配一套完整的流水线"
        titleEn="A Complete Pipeline for Every Creative Form"
        subtitleZh={"短剧工作流 · 歌曲创作 · 爆款视频结构拆解 · 小说连载\n选择你的赛道，AI 带你跑完全程"}
        subtitleEn="Short Drama · Song Creation · Viral Video · Serialized Fiction"
        ctaLabel={isZh ? "开始创作" : "Start Creating"}
        ctaHref="/dashboard"
        bgImageZh="radial-gradient(ellipse at 70% 40%, #0a1628 0%, #060a14 100%)"
        bgImageEn="radial-gradient(ellipse at 70% 40%, #0a1628 0%, #060a14 100%)"
        align="left"
        lightBg={false}
      />

      <ContentSection
        id="workspace"
        kicker="WORKSPACE"
        titleZh="你的工作台，按你的方式运转"
        titleEn="Your Workspace, Your Rules"
        subtitleZh={"模块自由组合，接入你自己的 AI API\nPRO 用户完全掌控创作环境，打造专属工作流"}
        subtitleEn="Modular layout, BYO API. PRO users own their entire creative environment."
        ctaLabel={isZh ? "了解 PRO" : "Learn PRO"}
        ctaHref="/subscription"
        bgImageZh="radial-gradient(ellipse at 30% 60%, #0d1525 0%, #060a14 100%)"
        bgImageEn="radial-gradient(ellipse at 30% 60%, #0d1525 0%, #060a14 100%)"
        align="right"
        lightBg={false}
      />

      <ContentSection
        id="universe"
        kicker="UNIVERSE ENGINE"
        titleZh="建立你自己的故事宇宙"
        titleEn="Build Your Own Story Universe"
        subtitleZh={"角色、世界观、时间线、Canon 规则——一次建立，所有项目共享继承\n创作不再从零开始，你的 IP 永久生长"}
        subtitleEn="Characters, worlds, timelines, canon rules — build once, inherit everywhere."
        ctaLabel={isZh ? "探索宇宙" : "Explore Universe"}
        ctaHref="/universes"
        bgImageZh="radial-gradient(ellipse at 50% 30%, #0d1040 0%, #060a14 100%)"
        bgImageEn="radial-gradient(ellipse at 50% 30%, #0d1040 0%, #060a14 100%)"
        align="left"
        lightBg={false}
      />

      <ContentSection
        id="companions"
        kicker="COMPANIONS"
        titleZh="召唤你的创作搭档"
        titleEn="Summon Your Creative Companions"
        subtitleZh={"故事架构师、角色设计师、剧本医生、市场分析师、视觉导演\n组建你自己的 AI 创作团队"}
        subtitleEn="Story Architect, Character Designer, Script Doctor, Market Analyst, Visual Director."
        ctaLabel={isZh ? "查看伙伴" : "Meet Companions"}
        ctaHref="/companions"
        bgImageZh="radial-gradient(ellipse at 40% 70%, #100d2a 0%, #060a14 100%)"
        bgImageEn="radial-gradient(ellipse at 40% 70%, #100d2a 0%, #060a14 100%)"
        align="right"
        lightBg={false}
      />

      <ContentSection
        id="join"
        kicker="JOIN KIIKIS"
        titleZh="开始点亮你的第一颗星球"
        titleEn="Light Up Your First Planet"
        subtitleZh={"免费注册获得 3,000 KK币 + 专属宠物蛋\n邀请好友各得 5,000 KK币（最多3位）\n成功邀请3位好友，解锁限定 KK 蛋"}
        subtitleEn={"Sign up free: 3,000 KK coins + exclusive pet egg.\nInvite friends: 5,000 KK coins each (up to 3).\nInvite 3 friends: unlock a limited KK egg."}
        ctaLabel={isZh ? "免费开始" : "Start Free"}
        ctaHref="/dashboard"
        bgImageZh="radial-gradient(ellipse at 50% 50%, #0d1a2a 0%, #060a14 100%)"
        bgImageEn="radial-gradient(ellipse at 50% 50%, #0d1a2a 0%, #060a14 100%)"
        align="center"
        lightBg={false}
      />
    </main>
  );
}
