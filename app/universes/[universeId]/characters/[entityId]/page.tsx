"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import { CharacterPassport } from "@/components/character-passport/CharacterPassport";

/**
 * Character Passport 页面（TRAE-V2-02）
 *
 * 路由：/universes/:universeId/characters/:entityId
 *
 * 数据来源：
 * - 客户端 session（accessToken）→ 调用 /api/universes/:universeId/characters/:entityId/passport
 * - 服务端用 service role 绕过 RLS 聚合 5 张表
 *
 * 设计文档：Kiikis-V2.0-TRAE-80%-执行PRD.md §TRAE-V2-02
 */
export default function CharacterPassportPage() {
  const params = useParams<{ universeId: string; entityId: string }>();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [session, setSession] = useState<Session | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSessionResolved(true);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      setSessionResolved(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener?.subscription.unsubscribe();
  }, []);

  if (!sessionResolved) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "rgba(255,255,255,0.6)" }}>
        {isZh ? "加载中…" : "Loading…"}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <CharacterPassport
        universeId={params.universeId}
        entityId={params.entityId}
        accessToken={session?.access_token || null}
        isZh={isZh}
      />
    </div>
  );
}
