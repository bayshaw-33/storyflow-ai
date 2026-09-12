"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clipboard, Download, Loader2, Music2, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { SongWorkbenchNav } from "@/components/song-workbench/SongWorkbenchNav";
import { fitV6StylePrompt, validateV6StylePrompt, V6_STYLE_MAX_BYTES } from "@/lib/song/documents";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const templates = [
  { id: "instrumental", title: "纯音乐生成", description: "适合 BGM、OST、氛围音乐和剪辑铺底。", content: "Instrumental only, no vocals, no singing, no spoken words, no chant. Focus on melody, harmony, rhythm, arrangement, texture, and dynamics." },
  { id: "sfx", title: "音效生成", description: "适合动作、材质、空间、距离、冲击和尾音。", content: "Sound effect only, no music, no melody, no vocals, no singing, no spoken words. Focus on source action, material, space, distance, impact, and decay." },
];

export function SongToolkit() {
  const [prompt, setPrompt] = useState("");
  const [copied, setCopied] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [health, setHealth] = useState<{ loading: boolean; message: string; tone: "neutral" | "good" | "bad" }>({ loading: false, message: "", tone: "neutral" });
  const validation = validateV6StylePrompt(prompt);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1400);
  }

  async function runHealthCheck() {
    if (!session?.access_token) {
      setHealth({ loading: false, message: "请先登录，再检查音乐服务。", tone: "bad" });
      return;
    }
    setHealth({ loading: true, message: "正在检查登录、模型和音频文件状态…", tone: "neutral" });
    try {
      const headers = { Authorization: "Bearer " + session.access_token };
      const [capabilitiesResponse, jobsResponse] = await Promise.all([fetch("/api/audio/capabilities", { headers }), fetch("/api/audio/jobs", { headers })]);
      const capabilities = await capabilitiesResponse.json().catch(() => ({})) as { musicModels?: Array<{ id: string; available?: boolean }> };
      const jobs = await jobsResponse.json().catch(() => ({})) as { jobs?: Array<{ status?: string; resultUrl?: string | null }> };
      if (!capabilitiesResponse.ok) throw new Error("音乐模型检查失败 (HTTP " + capabilitiesResponse.status + ")。");
      if (!jobsResponse.ok) throw new Error("生成任务检查失败 (HTTP " + jobsResponse.status + ")。");
      const models = Array.isArray(capabilities.musicModels) ? capabilities.musicModels.filter((item) => item.available !== false) : [];
      const latest = Array.isArray(jobs.jobs) ? jobs.jobs[0] : null;
      const downloadable = latest?.status === "completed" && Boolean(latest.resultUrl);
      setHealth({ loading: false, message: "检查通过：可用模型 " + models.length + " 个；" + (latest ? "最近任务 " + latest.status + (downloadable ? "，音频文件可下载。" : "。") : "暂无历史任务。"), tone: "good" });
    } catch (error) {
      setHealth({ loading: false, message: error instanceof Error ? error.message : "检查失败，请稍后重试。", tone: "bad" });
    }
  }

  return (
    <main className="song-product-page">
      <SongWorkbenchNav active="toolkit" />
      <section className="song-product-content">
        <header className="song-product-heading"><div><span className="song-product-kicker">MUSIC TOOLS</span><h1>音乐工具箱</h1><p>把生成前的检查、纯音乐约束和交付动作集中在一起。</p></div><Link className="primary-button" href="/song-workbench"><Music2 size={16} />返回音乐创作</Link></header>
        <div className="song-tool-grid">
          <section className="song-tool-card song-prompt-checker"><div className="song-tool-card-head"><div><span className="song-product-kicker">SUNO V6</span><h2>曲风提示词检查</h2></div><ShieldCheck size={21} /></div><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="粘贴或输入 Suno V6 曲风提示词…" aria-label="Suno V6 曲风提示词" /><div className="song-prompt-meter" data-valid={validation.valid}><strong>{validation.bytes} / {V6_STYLE_MAX_BYTES} bytes</strong><span>Suno V6 限制：1000 UTF-8 bytes · {validation.valid ? "可复制与应用" : "超出限制，请压缩后再使用"}</span></div><div className="song-tool-actions"><button className="secondary-button" type="button" disabled={!prompt.trim() || !validation.valid} onClick={() => void copy(prompt, "prompt")}>{copied === "prompt" ? <CheckCircle2 size={15} /> : <Clipboard size={15} />}复制提示词</button><button className="secondary-button" type="button" disabled={!prompt.trim() || validation.valid} onClick={() => setPrompt(fitV6StylePrompt(prompt))}><Sparkles size={15} />压缩到限制内</button></div></section>
          <section className="song-tool-card"><div className="song-tool-card-head"><div><span className="song-product-kicker">NO VOCAL</span><h2>纯音乐与音效模板</h2></div><Music2 size={21} /></div><div className="song-template-list">{templates.map((template) => <article key={template.id}><div><h3>{template.title}</h3><p>{template.description}</p></div><button className="icon-button" type="button" onClick={() => void copy(template.content, template.id)} aria-label={"复制" + template.title} title="复制">{copied === template.id ? <CheckCircle2 size={16} /> : <Clipboard size={16} />}</button><pre>{template.content}</pre></article>)}</div></section>
          <section className="song-tool-card song-health-card"><div className="song-tool-card-head"><div><span className="song-product-kicker">RELIABILITY</span><h2>生成与下载检查</h2></div><Wrench size={21} /></div><p>检查当前账号的音乐模型、最近任务和音频文件是否可以下载。</p><button className="primary-button" type="button" onClick={() => void runHealthCheck()} disabled={health.loading}>{health.loading ? <Loader2 className="spin" size={15} /> : <Download size={15} />}检查音乐服务</button>{health.message ? <div className={"song-health-result " + health.tone} role="status">{health.message}</div> : null}</section>
        </div>
      </section>
    </main>
  );
}
