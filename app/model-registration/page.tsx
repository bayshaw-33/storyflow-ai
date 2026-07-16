"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { ModelRegistryPanel } from "@/components/production/ModelRegistryPanel";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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

export default function ModelRegistrationPage() {
  return (
    <Suspense fallback={<main style={shellStyle}>加载中...</main>}>
      <ModelRegistrationContent />
    </Suspense>
  );
}

function ModelRegistrationContent() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    document.title = "模型注册 | Kiikis";
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
        <h1 style={titleStyle}>模型注册</h1>
      </header>
      <section style={sectionStyle}>
        <ModelRegistryPanel onClose={() => router.back()} />
      </section>
    </main>
  );
}
