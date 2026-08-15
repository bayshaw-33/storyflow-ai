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
import { assetUrl } from "@/lib/design/manifest";

type AuthMode = "signin" | "signup";

function heroBg(token: Parameters<typeof assetUrl>[0]) {
  return `url('${assetUrl(token)}')`;
}

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
        id="workspace"
        kicker={isZh ? "创作链" : "CREATIVE PIPELINE"}
        titleZh="不是一排工具，而是一条完整的创作链。"
        titleEn="Not a collection of tools. One connected creative pipeline."
        subtitleZh="剧本、美术、分镜、视频、歌曲与配音共享同一个项目。前一步确认的成果，直接成为下一步创作的起点。"
        subtitleEn="Scripts, art, storyboards, video, songs, and voice share one project. Every approved result becomes the starting point for what comes next."
        bgImageZh={heroBg("HERO_SECTION_3")}
        bgImageEn={heroBg("HERO_SECTION_3")}
        align="left"
        lightBg={false}
      />

      <ContentSection
        id="universe"
        kicker={isZh ? "UNIVERSE · 创作资产" : "UNIVERSE · CREATIVE ASSETS"}
        titleZh="下一部作品，不必再从头开始。"
        titleEn="Your next project doesn’t have to start from scratch."
        subtitleZh="已经确认的角色、场景、世界规则和故事关系，会沉淀到 Universe。续集、改编或新项目，可以继承这些资产继续创作。"
        subtitleEn="Approved characters, locations, world rules, and story relationships are preserved in your Universe—ready for sequels, adaptations, and whatever comes next."
        ctaLabel={isZh ? "了解 Universe" : "Explore Universe"}
        ctaHref="/universes"
        bgImageZh={heroBg("HERO_SECTION_6")}
        bgImageEn={heroBg("HERO_SECTION_6")}
        align="left"
        lightBg={false}
      />

      <ContentSection
        id="actors"
        kicker={isZh ? "ACTORS · 演员资产" : "ACTORS · ACTOR ASSETS"}
        titleZh="演员，不是一次性生成的面孔。"
        titleEn="An actor is more than a face generated once."
        subtitleZh="Kiikis 将演员、角色与作品造型分别保存：演员保留稳定身份，角色属于 Universe，造型随每部作品变化。"
        subtitleEn="Kiikis keeps actors, characters, and production looks distinct: the actor retains a stable identity, the character belongs to a Universe, and each production creates its own portrayal."
        ctaLabel={isZh ? "打开演员库" : "Open Actor Library"}
        ctaHref="/actors"
        bgImageZh={heroBg("HERO_SECTION_5")}
        bgImageEn={heroBg("HERO_SECTION_5")}
        align="left"
        lightBg={false}
      />

      <ContentSection
        id="provenance"
        kicker={isZh ? "PROVENANCE · 创作留痕" : "PROVENANCE · CREATIVE HISTORY"}
        titleZh="每一次改变，都知道从哪里来。"
        titleEn="Every change has a history."
        subtitleZh="从最初的提示词到最终成片，重要版本、修改与生成过程被持续记录。你可以看见作品如何演变，也能找到每项资产的来源。"
        subtitleEn="From the first prompt to the final cut, key versions, revisions, and generations stay connected—so you can see how the work evolved and where each asset came from."
        ctaLabel={isZh ? "了解创作留痕" : "Explore Provenance"}
        ctaHref="/dashboard"
        bgImageZh={heroBg("HERO_SECTION_7")}
        bgImageEn={heroBg("HERO_SECTION_7")}
        align="left"
        lightBg={false}
      />
    </main>
  );
}
