"use client";

/**
 * TRAE-V2-04 AI Director 客户端 wrapper
 * 从 Supabase session 获取 accessToken，从 URL 获取 projectId/sourceUnitId
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DirectorPanel } from "@/components/director/DirectorPanel";
import type { Session } from "@supabase/supabase-js";

export function DirectorPageClient() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") ?? "";
  const sourceUnitId = searchParams.get("sourceUnitId") ?? "legacy";
  const [session, setSession] = useState<Session | null>(null);
  const [isZh, setIsZh] = useState(true);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = client.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    // 语言检测
    const lang = typeof navigator !== "undefined" ? navigator.language : "zh";
    setIsZh(lang.startsWith("zh"));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!projectId) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
        <div style={{
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          background: "rgba(255,255,255,0.02)",
          padding: 32,
          textAlign: "center",
          color: "rgba(255,255,255,0.6)",
        }}>
          <p style={{ fontSize: 14, marginBottom: 8 }}>
            {isZh ? "请在 URL 中提供 projectId" : "Please provide projectId in URL"}
          </p>
          <code style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            /director?projectId=xxx&sourceUnitId=yyy
          </code>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <DirectorPanel
        projectId={projectId}
        sourceUnitId={sourceUnitId}
        accessToken={session?.access_token ?? null}
        isZh={isZh}
      />
    </div>
  );
}
