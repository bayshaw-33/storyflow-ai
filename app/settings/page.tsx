"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowLeft, Cloud, Coins, Database, KeyRound, ShieldCheck } from "lucide-react";
import { STORAGE_KEY } from "@/lib/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type CreditState = {
  balance: number;
  monthlyLimit: number;
  periodEnd: string;
};

export default function SettingsPage() {
  const [projectCount, setProjectCount] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [credits, setCredits] = useState<CreditState | null>(null);
  const [syncStatus, setSyncStatus] = useState("本地草稿可用");

  useEffect(() => {
    setProjectCount(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").length);
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      setSyncStatus(data.session ? "云端同步已启用" : "未登录，仅保存本地草稿");
      if (data.session) void loadCredits(data.session);
    });
  }, []);

  async function loadCredits(nextSession: Session) {
    try {
      const response = await fetch("/api/account/credits", {
        headers: { Authorization: `Bearer ${nextSession.access_token}` },
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setCredits({
          balance: data.credits.balance,
          monthlyLimit: data.credits.monthlyLimit,
          periodEnd: data.credits.periodEnd,
        });
      }
    } catch {
      setCredits(null);
    }
  }

  return (
    <main className="app-shell narrow">
      <header className="app-header">
        <div className="brand-lockup">
          <img className="brand-logo" src="/storyflow-logo-white.png" alt="StoryFlow" />
          <div>
            <span className="kicker">StoryFlow 2.0</span>
            <h1>设置</h1>
          </div>
        </div>
        <Link className="icon-button" href="/" title="返回项目列表">
          <ArrowLeft size={18} />
        </Link>
      </header>

      <section className="settings-list">
        <article>
          <Cloud size={22} />
          <div>
            <h2>云端同步</h2>
            <p>{syncStatus}</p>
            <strong>{session?.user.email || "未登录"}</strong>
          </div>
        </article>

        <article>
          <Coins size={22} />
          <div>
            <h2>AI 额度</h2>
            <p>{credits ? `本月剩余 ${credits.balance} / ${credits.monthlyLimit}` : "登录后显示本月额度。"}</p>
            {credits?.periodEnd ? <strong>重置时间：{new Date(credits.periodEnd).toLocaleDateString("zh-CN")}</strong> : null}
          </div>
        </article>

        <article>
          <Database size={22} />
          <div>
            <h2>本地草稿</h2>
            <p>未登录时仍可创建和编辑草稿；登录后会与云端项目合并同步。</p>
            <strong>{projectCount} 个本地项目</strong>
          </div>
        </article>

        <article>
          <KeyRound size={22} />
          <div>
            <h2>AI Provider</h2>
            <p>DeepSeek 负责本土化与文本深加工，MiniMax 用于多模态图片能力；密钥只在服务端读取。</p>
          </div>
        </article>

        <article>
          <ShieldCheck size={22} />
          <div>
            <h2>安全边界</h2>
            <p>前端只持有 Supabase anon key 和用户会话；AI Key、Service Role Key、额度扣减都在服务端处理。</p>
          </div>
        </article>
      </section>
    </main>
  );
}
