/**
 * TRAE-V2-06 OpenCut-ready Editor Framework
 * 客户端页面包装器
 *
 * URL: /editor?projectId=xxx&sourceUnitId=yyy
 */

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { EditorFramework } from "@/components/editor/EditorFramework";
import type { Session } from "@supabase/supabase-js";

export function EditorPageClient() {
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
    const lang = typeof navigator !== "undefined" ? navigator.language : "zh";
    setIsZh(lang.startsWith("zh"));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!projectId) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: 24 }}>
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            background: "rgba(255,255,255,0.02)",
            padding: 32,
            textAlign: "center",
            color: "rgba(255,255,255,0.6)",
          }}
        >
          <p style={{ fontSize: 14, marginBottom: 8 }}>
            {isZh ? "请在 URL 中提供 projectId" : "Please provide projectId in URL"}
          </p>
          <code style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            /editor?projectId=xxx&sourceUnitId=yyy
          </code>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 16, height: "calc(100vh - 64px)" }}>
      <EditorFramework
        projectId={projectId}
        sourceUnitId={sourceUnitId}
        accessToken={session?.access_token ?? null}
        isZh={isZh}
      />
    </div>
  );
}
