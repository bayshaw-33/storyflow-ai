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
            <h2>DeepSeek API Key</h2>
            <p>只能在 Vercel 或本地 `.env.local` 的服务端环境变量中配置，前端不会读取或展示。</p>
            <code>DEEPSEEK_API_KEY</code>
          </div>
        </article>

        <article>
          <Server size={22} />
          <div>
            <h2>模型</h2>
            <p>默认使用 `deepseek-chat`，可通过服务端环境变量覆盖。</p>
            <code>DEEPSEEK_MODEL=deepseek-chat</code>
          </div>
        </article>

        <article>
          <Database size={22} />
          <div>
            <h2>本地项目存储</h2>
            <p>当前项目保存到浏览器 localStorage，字段已按 PRD 和演示工作流组织，后续可迁移到数据库。</p>
            <code>{STORAGE_KEY}</code>
            <strong>{projectCount} 个本地项目</strong>
          </div>
        </article>

        <article>
          <ShieldCheck size={22} />
          <div>
            <h2>安全边界</h2>
            <p>生成请求统一发送到服务端 API，API Key 不会进入页面组件、localStorage 或浏览器网络载荷。</p>
            <code>POST /api/ai/generate</code>
          </div>
        </article>
      </section>
    </main>
  );
}
