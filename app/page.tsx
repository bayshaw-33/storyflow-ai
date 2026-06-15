"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { KKFloatingOrb } from "@/components/home/KKFloatingOrb";
import { HeroSection } from "@/components/home/HeroSection";
import { StoryPlanetSection } from "@/components/landing/StoryPlanetSection";
import { TopNav } from "@/components/layout/TopNav";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LandingPage() {
  const router = useRouter();
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
    <main className="kiikis-site">
      <TopNav
        session={session}
        onEnterRoom={enterWriterRoom}
        onSignIn={enterWriterRoom}
        onSignUp={enterWriterRoom}
        onSignOut={signOut}
      />
      <HeroSection onStartCreating={enterWriterRoom} />
      <StoryPlanetSection />
      <KKFloatingOrb />
    </main>
  );
}
