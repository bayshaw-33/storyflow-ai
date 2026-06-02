"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Database, KeyRound, Server, ShieldCheck } from "lucide-react";
import { STORAGE_KEY } from "@/lib/projects";

export default function SettingsPage() {
  const [projectCount, setProjectCount] = useState(0);

  useEffect(() => {
    setProjectCount(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").length);
  }, []);

  return (
    <main className="app-shell narrow">
      <header className="app-header">
        <div>
          <span className="kicker">StoryFlow AI</span>
          <h1>设置</h1>
        </div>
        <Link className="icon-button" href="/" title="返回项目列表">
          <ArrowLeft size={18} />
        </Link>
      </header>

      <section className="settings-list">
        <article>
          <KeyRound size={22} />
          <div>
            <h2>AI 生成配置</h2>
            <p>当前生成能力由云端安全处理，页面不会展示密钥或敏感配置。</p>
          </div>
        </article>

        <article>
          <Server size={22} />
          <div>
            <h2>生成能力</h2>
            <p>支持市场、创意、角色、大纲、剧本、翻译、本土化、评估和分镜生成。</p>
          </div>
        </article>

        <article>
          <Database size={22} />
          <div>
            <h2>项目保存</h2>
            <p>当前项目会自动保存在本机浏览器中，刷新页面后仍可继续编辑。</p>
            <strong>{projectCount} 个本地项目</strong>
          </div>
        </article>

        <article>
          <ShieldCheck size={22} />
          <div>
            <h2>安全边界</h2>
            <p>敏感配置只在云端处理，前端仅保存项目内容和编辑状态。</p>
          </div>
        </article>
      </section>
    </main>
  );
}
