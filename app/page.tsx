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
        kicker="WORKSPACE"
        titleZh="一个人，也该拥有一整个剧组。"
        titleEn="One creator deserves a whole studio."
        subtitleZh="四个工作台之间没有墙。剧本写完的那一刻，分镜已经在等你。"
        subtitleEn="Four workbenches. No walls between them. The moment the script is done, the storyboard is ready."
        bgImageZh={heroBg("HERO_SECTION_3")}
        bgImageEn={heroBg("HERO_SECTION_3")}
        align="left"
        lightBg={false}
      >
        <div className="workspace-doors">
          <div className="workspace-door">
            <p className="workspace-door-label">{isZh ? "我要原创" : "CREATE"}</p>
            <h3 className="workspace-door-title">
              {isZh ? "从一张白纸，到一个活着的世界。" : "From a blank page to a living world."}
            </h3>
            <p className="workspace-door-body">
              {isZh
                ? "小说、剧本与歌曲，在这里从无到有。"
                : "Novels, scripts and songs begin here."}
            </p>
          </div>
          <div className="workspace-door">
            <p className="workspace-door-label">{isZh ? "我要制作" : "PRODUCE"}</p>
            <h3 className="workspace-door-title">
              {isZh ? "剧本一进来，整部戏就开始运转。" : "Bring in the script, and the whole production starts moving."}
            </h3>
            <p className="workspace-door-body">
              {isZh
                ? "美术、分镜、视频、配音、剪辑，在同一座制作工作台里完成。"
                : "Art, storyboards, video, voice and editing — all inside one Production Workbench."}
            </p>
          </div>
          <div className="workspace-door">
            <p className="workspace-door-label">{isZh ? "我要改编" : "REMAKE"}</p>
            <h3 className="workspace-door-title">
              {isZh ? "看见一个爆款，不只是模仿它。" : "Don't just copy a hit."}
            </h3>
            <p className="workspace-door-body">
              {isZh
                ? "拆开它为什么成立，再用你的角色、你的世界，重新讲一遍。"
                : "Break down why it works, then retell it with your characters, in your world."}
            </p>
          </div>
        </div>
      </ContentSection>

      <ContentSection
        id="universe"
        kicker={isZh ? "宇宙 · 核心" : "UNIVERSE · THE CORE"}
        titleZh="你的角色，不该每一集都重新投胎。"
        titleEn="Your characters shouldn't be reborn every episode."
        subtitleZh={"角色是谁，世界如何运转，时间线走到哪里，哪些事永远不能被改写——这些，只需要在宇宙里定义一次。\n\n之后的每一部小说、每一集分镜、每一段视频、每一首歌、每一次改编，都会继承同一张脸、同一段过去、同一套世界规则。\n\nIP 不是一次爆款带来的运气。它是你一砖一瓦，持续积累出来的资产。"}
        subtitleEn={"Who they are. How the world works. Where the timeline stands. What can never be rewritten. Define it once in your Universe.\n\nEvery novel, storyboard, video, song and remake that follows inherits the same face, the same history, the same world.\n\nIP is not the luck of one viral hit. It is an asset you build, brick by brick."}
        ctaLabel={isZh ? "建立你的宇宙" : "Build Your Universe"}
        ctaHref="/universes"
        bgImageZh={heroBg("HERO_SECTION_6")}
        bgImageEn={heroBg("HERO_SECTION_6")}
        align="left"
        lightBg={false}
      />

      <ContentSection
        id="actors"
        kicker={isZh ? "演员 · 角色资产" : "ACTORS · CHARACTER ASSETS"}
        titleZh="选一次角，演一辈子。"
        titleEn="Cast once. Star forever."
        subtitleZh={"虚拟演员住进演员库。\n脸属于演员，人物设定属于宇宙，造型属于每一部戏。\n\n下一次开拍，不必重新选角。你只需要喊一声：开机。"}
        subtitleEn={"Virtual actors live in your Actor Library.\nThe face belongs to the actor. The canon belongs to the Universe. The look belongs to each production.\n\nNext time you shoot, there is no need to cast again. You just call action."}
        ctaLabel={isZh ? "打开演员库" : "Open Actor Library"}
        ctaHref="/actors"
        bgImageZh={heroBg("HERO_SECTION_5")}
        bgImageEn={heroBg("HERO_SECTION_5")}
        align="left"
        lightBg={false}
      />

      <ContentSection
        id="provenance"
        kicker={isZh ? "留痕确权 · IP 系统" : "PROVENANCE · IP SYSTEM"}
        titleZh="你的 IP，从第一天起就有来历可查。"
        titleEn="Your IP has a traceable history from day one."
        subtitleZh={`从第一句提示词，到最后一版成片，每一次生成、每一个版本、每一次修改，都被持续记录。\n\n什么时候发生，用了什么模型，改过哪些内容，从哪个版本演变而来——创作过程不再散落在聊天记录、文件夹和记忆里。\n\n当有人问："凭什么说这是你的？"你不需要临时拼证据。创作链路，本来就在那里。`}
        subtitleEn={`From the first prompt to the final cut, every generation, version and revision is continuously recorded.\n\nWhen it happened. Which model was used. What changed. Which version it came from. Your creative process no longer disappears across chats, folders and memory.\n\nWhen someone asks, "What proves this is yours?" You do not have to rebuild the story afterward. The creative trail is already there.`}
        ctaLabel={isZh ? "了解留痕确权" : "See How Provenance Works"}
        ctaHref="/dashboard"
        bgImageZh={heroBg("HERO_SECTION_7")}
        bgImageEn={heroBg("HERO_SECTION_7")}
        align="left"
        lightBg={false}
      />
    </main>
  );
}
