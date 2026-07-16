"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { AutoAssemblyPanel } from "@/components/production/AutoAssemblyPanel";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useProductionSync } from "@/lib/production/hooks";
import { createEmptyProductionState } from "@/lib/production/state";
import type { ProductionProjectState } from "@/lib/production/types";

const shellStyle: React.CSSProperties = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
};

const headerStyle: React.CSSProperties = {
  maxWidth: 1760,
  margin: "0 auto 18px",
};

const eyebrowStyle: React.CSSProperties = {
  margin: "0 0 6px",
  color: "#6de7df",
  fontSize: 13,
  fontWeight: 800,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "clamp(24px, 2vw, 34px)",
  fontWeight: 900,
};

const sectionStyle: React.CSSProperties = {
  maxWidth: 1760,
  margin: "0 auto",
};

const noticeStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  background: "rgba(255,255,255,0.05)",
  color: "#f4f7f8",
};

export default function AssemblyPage() {
  return (
    <Suspense fallback={<main style={shellStyle}>加载中...</main>}>
      <AssemblyContent />
    </Suspense>
  );
}

function AssemblyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "draft";
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [state, setState] = useState<ProductionProjectState>(() =>
    createEmptyProductionState({ projectId, mode: "assembly" }),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const sync = useProductionSync(session, projectId);

  useEffect(() => {
    document.title = "自动顺片 | Kiikis";
  }, []);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setSessionLoaded(true);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!active) return;
        setSession(data.session);
        setSessionLoaded(true);
      } catch {
        if (active) setSessionLoaded(true);
      }
    })();
    const { data: sub } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void (async () => {
      try {
        const loaded = await sync.loadFromCloud();
        if (active && loaded) {
          setState(loaded);
        }
      } catch (err) {
        if (active) {
          setLoadError(err instanceof Error ? err.message : "加载项目状态失败。");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [session, sync]);

  useEffect(() => {
    if (sessionLoaded && !session) {
      router.push("/login");
    }
  }, [sessionLoaded, session, router]);

  if (!sessionLoaded) {
    return <main style={shellStyle}>加载中...</main>;
  }
  if (!session) {
    return <main style={shellStyle}>请先登录，正在跳转...</main>;
  }

  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <p style={eyebrowStyle}>Kiikis Production</p>
        <h1 style={titleStyle}>自动顺片</h1>
      </header>
      <section style={sectionStyle}>
        {sync.loading && <div style={noticeStyle}>正在加载项目数据...</div>}
        {loadError && <div style={{ ...noticeStyle, color: "#ff8b8b" }}>{loadError}</div>}
        {sync.error && <div style={{ ...noticeStyle, color: "#ff8b8b" }}>{sync.error}</div>}
        <AutoAssemblyPanel state={state} />
      </section>
    </main>
  );
}
