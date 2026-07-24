"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";

type ProfileSummary = {
  username?: string | null;
};

/**
 * /community 中转路由：
 * - 已登录且有 username → 跳 /u/[username]
 * - 已登录但未设 username → 跳 /settings/profile（引导设置 username）
 * - 未登录 → 跳 /login
 *
 * 此页本身只显示一个简短跳转提示，不渲染导航。
 */
export default function CommunityRedirectPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [status, setStatus] = useState<"loading" | "login" | "no-username" | "redirect">("loading");

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) setStatus("login");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const nextSession = data.session as Session | null;
      if (!nextSession?.user) {
        setStatus("login");
        router.replace("/login");
        return;
      }
      // 读取 username
      const { data: profileRow } = await supabase
        .from("storyflow_profiles")
        .select("username")
        .eq("user_id", nextSession.user.id)
        .maybeSingle();
      if (cancelled) return;
      const username = (profileRow as ProfileSummary | null)?.username?.trim();
      if (!username) {
        setStatus("no-username");
        router.replace("/settings/profile");
        return;
      }
      setStatus("redirect");
      router.replace(`/u/${username}`);
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="cosmic-page" style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--ink-secondary)", fontSize: 14 }}>
        {status === "login"
          ? t("community.loginRequired")
          : t("community.redirecting")}
      </p>
    </main>
  );
}
