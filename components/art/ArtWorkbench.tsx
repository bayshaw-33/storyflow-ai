"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { Archive, ChevronDown, FilePlus2, ImagePlus, LoaderCircle, MessageSquareText, Plus, Search, Send, Sparkles, Upload, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readProjectsFromStorage, type DramaProject } from "@/lib/projects";
import { artStateFromProject, assetsFromExtraction, createArtAsset, createEmptyArtWorkbenchState, type ArtAsset, type ArtAssetKind, type ArtWorkbenchState, type ExtractedArtAssets } from "@/lib/art-workbench";
import type { ArtAction } from "@/lib/art/types";
import styles from "./ArtWorkbench.module.css";

export const ART_WORKBENCH_STORAGE_KEY = "kiikis_art_workbench_state";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; note?: string };
type PendingImage = { id: string; name: string; url: string };

export default function ArtWorkbench() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [session, setSession] = useState<Session | null>(null);
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [state, setState] = useState<ArtWorkbenchState>(() => createEmptyArtWorkbenchState());
  const [selectedKind, setSelectedKind] = useState<ArtAssetKind>("character");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: "hello", role: "assistant", content: "我是 KK 美术助理。关联项目或上传资料后，我会拆解角色、场景和关键道具；你也可以直接告诉我要增加或修改什么。" }]);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const sourceInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, next) => setSession(next)) || {};
    setProjects(readProjectsFromStorage());
    try {
      const saved = localStorage.getItem(ART_WORKBENCH_STORAGE_KEY);
      if (saved) setState({ ...createEmptyArtWorkbenchState(), ...JSON.parse(saved) as ArtWorkbenchState });
    } catch { /* Keep a clean local draft. */ }
    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    try { localStorage.setItem(ART_WORKBENCH_STORAGE_KEY, JSON.stringify(state)); } catch { /* Best effort until migration is applied. */ }
  }, [state]);

  const visibleAssets = useMemo(() => state.assets.filter((asset) => asset.kind === selectedKind && (!query.trim() || `${asset.name} ${asset.role} ${asset.description}`.toLowerCase().includes(query.trim().toLowerCase()))), [state.assets, selectedKind, query]);
  const counts = useMemo(() => ({ character: state.assets.filter((asset) => asset.kind === "character").length, scene: state.assets.filter((asset) => asset.kind === "scene").length, prop: state.assets.filter((asset) => asset.kind === "prop").length }), [state.assets]);

  function patchState(patch: Partial<ArtWorkbenchState>) {
    setState((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  }

  function selectProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    patchState(artStateFromProject(project));
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: `已关联《${project.title}》。现有剧本、项目背景和角色资料已经进入分析上下文。` }]);
  }

  function newProject() {
    const name = window.prompt(isZh ? "请输入新项目名称" : "New project name");
    if (!name?.trim()) return;
    const next = createEmptyArtWorkbenchState();
    next.title = name.trim();
    setState(next);
    setMessages([{ id: crypto.randomUUID(), role: "assistant", content: `已新建《${name.trim()}》美术项目。Universe 项目外壳将在云端 migration 启用后同步创建。` }]);
  }

  async function uploadSource(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setBusy("source");
    try {
      let sourceText = state.sourceText;
      const added = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/files/parse", { method: "POST", body: form });
        const payload = await response.json() as { success?: boolean; text?: string; fileName?: string; error?: string };
        if (!response.ok || !payload.text) throw new Error(payload.error || `无法解析 ${file.name}`);
        const entry = { id: crypto.randomUUID(), name: payload.fileName || file.name, text: payload.text, addedAt: new Date().toISOString() };
        added.push(entry);
        sourceText = [sourceText, `【${entry.name}】\n${entry.text}`].filter(Boolean).join("\n\n");
      }
      patchState({ sourceText, sourceFiles: [...added, ...state.sourceFiles] });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: `已读取 ${added.length} 份资料。你可以让我自动拆解，或继续上传补充资料。` }]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "资料解析失败");
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingImage({ id: crypto.randomUUID(), name: file.name, url: String(reader.result || "") });
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function extractAssets() {
    if (!session?.access_token) return setNotice("请先登录后再让 AI 拆解资产。");
    if (!state.sourceText.trim()) return setNotice("请先关联项目或上传资料。");
    setBusy("extract");
    try {
      const response = await fetch("/api/art/extract-assets", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ title: state.title, visualStyle: state.visualStyle, sourceText: state.sourceText }) });
      const payload = await response.json() as ExtractedArtAssets & { success?: boolean; error?: string; warning?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "拆解失败");
      const assets = assetsFromExtraction(payload);
      patchState({ assets, selectedAssetId: assets[0]?.id, title: payload.title || state.title, visualStyle: payload.visualStyle || state.visualStyle });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: `已完成初步拆解：${assets.filter((item) => item.kind === "character").length} 个角色、${assets.filter((item) => item.kind === "scene").length} 个场景、${assets.filter((item) => item.kind === "prop").length} 个关键道具。`, note: payload.warning }]);
    } catch (error) { setNotice(error instanceof Error ? error.message : "拆解失败"); } finally { setBusy(""); }
  }

  async function sendMessage() {
    const content = message.trim();
    if (!content && !pendingImage) return;
    if (!session?.access_token) return setNotice("请先登录后再使用 KK 美术助理。");
    const userMessage = content || `上传图片：${pendingImage?.name}`;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: userMessage }]);
    setMessage("");
    setBusy("chat");
    try {
      const response = await fetch("/api/art/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ message: userMessage, projectTitle: state.title, assets: state.assets, attachments: pendingImage ? [{ id: pendingImage.id, name: pendingImage.name, kind: "image" }] : [] }) });
      const payload = await response.json() as { success?: boolean; assistantText?: string; actions?: ArtAction[]; error?: string; warning?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "KK 暂时无法处理这条指令");
      applyActions(payload.actions || [], pendingImage);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: payload.assistantText || "已完成修改。", note: payload.warning }]);
      setPendingImage(null);
    } catch (error) { setNotice(error instanceof Error ? error.message : "操作失败"); } finally { setBusy(""); }
  }

  function applyActions(actions: ArtAction[], image: PendingImage | null) {
    setState((current) => {
      let assets = [...current.assets];
      for (const action of actions) {
        if (action.type === "create_asset") {
          const asset = createArtAsset(action.kind, { name: action.name, role: action.narrativeRole, description: action.description, conceptUrl: image?.url, referenceSheetUrl: action.kind === "character" ? image?.url : undefined, identityAnchor: image ? `用户上传母版：${image.name}` : "" });
          assets = [asset, ...assets];
        } else if (action.type === "update_asset") {
          assets = assets.map((asset) => asset.id === action.assetId ? { ...asset, name: action.patch.name ?? asset.name, role: action.patch.narrativeRole ?? asset.role, description: action.patch.description ?? asset.description, identityAnchor: action.patch.identityAnchor ?? asset.identityAnchor, updatedAt: new Date().toISOString() } : asset);
        }
      }
      return { ...current, assets, updatedAt: new Date().toISOString() };
    });
  }

  function addAsset() {
    const asset = createArtAsset(selectedKind);
    patchState({ assets: [asset, ...state.assets], selectedAssetId: asset.id });
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}><span>KIIKIS</span><strong>{state.title}</strong><small>美术工作台</small></div>
        <div className={styles.headerActions}>
          <label className={styles.projectSelect}><Archive size={15} /><select value={state.projectId || ""} onChange={(event) => selectProject(event.target.value)}><option value="">关联已有项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><ChevronDown size={14} /></label>
          <button type="button" onClick={newProject}><Plus size={15} />新建项目</button>
          <span className={styles.provider}><Sparkles size={14} />智能选择</span>
        </div>
      </header>

      {notice ? <button className={styles.notice} type="button" onClick={() => setNotice("")}>{notice}</button> : null}

      <div className={styles.workspace}>
        <section className={styles.chatPanel}>
          <div className={styles.chatHead}><div><MessageSquareText size={18} /><strong>KK 美术助理</strong></div><button type="button" onClick={() => sourceInput.current?.click()}><FilePlus2 size={15} />管理资料</button></div>
          <div className={styles.sourceChips}>{state.sourceFiles.slice(0, 5).map((file) => <span key={file.id}>{file.name}</span>)}{state.projectTitle ? <span>Universe · {state.projectTitle}</span> : null}{!state.sourceFiles.length && !state.projectTitle ? <small>还没有资料，上传剧本或关联项目即可开始</small> : null}</div>
          <div className={styles.messages}>{messages.map((item) => <article key={item.id} className={item.role === "user" ? styles.userMessage : styles.assistantMessage}><p>{item.content}</p>{item.note ? <small>{item.note}</small> : null}</article>)}{busy === "chat" ? <div className={styles.thinking}><LoaderCircle className={styles.spin} size={16} />KK 正在整理美术仓库...</div> : null}</div>
          <div className={styles.composer}>
            {pendingImage ? <div className={styles.pendingImage}><img src={pendingImage.url} alt="待发送参考" /><span>{pendingImage.name}</span><button type="button" onClick={() => setPendingImage(null)}>×</button></div> : null}
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void sendMessage(); }} placeholder="告诉 KK 要增加、编辑或修改什么，也可以上传剧本、图片和角色参考……" />
            <div className={styles.composerActions}><div><button type="button" onClick={() => sourceInput.current?.click()} title="上传资料"><Upload size={16} />文件</button><button type="button" onClick={() => imageInput.current?.click()} title="上传图片"><ImagePlus size={16} />图片</button><button type="button" onClick={extractAssets} disabled={busy === "extract"}><Sparkles size={16} />自动拆解</button></div><button className={styles.sendButton} type="button" onClick={sendMessage} disabled={busy === "chat"}><Send size={17} /></button></div>
            <input ref={sourceInput} hidden multiple type="file" accept=".txt,.md,.json,.csv,.doc,.docx,.pdf,.html,.htm,.xlsx" onChange={uploadSource} />
            <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadImage} />
          </div>
        </section>

        <section className={styles.repository}>
          <div className={styles.repoHead}><div><strong>美术仓库</strong><span>{state.assets.length} 项资产</span></div><div className={styles.search}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资产" /></div></div>
          <div className={styles.tabs}>{(["character", "scene", "prop"] as ArtAssetKind[]).map((kind) => <button key={kind} type="button" className={selectedKind === kind ? styles.activeTab : ""} onClick={() => setSelectedKind(kind)}>{kind === "character" ? "角色" : kind === "scene" ? "场景" : "道具"}<span>{counts[kind]}</span></button>)}<button className={styles.addButton} type="button" onClick={addAsset}><Plus size={15} />新增</button></div>
          <div className={styles.assetGrid}>{visibleAssets.map((asset) => <AssetCard key={asset.id} asset={asset} />)}{!visibleAssets.length ? <div className={styles.empty}><Users size={34} /><strong>这里还没有资产</strong><p>让 KK 自动拆解资料，或直接告诉它要增加什么。</p><button type="button" onClick={addAsset}><Plus size={15} />手动新增</button></div> : null}</div>
        </section>
      </div>
    </main>
  );
}

function AssetCard({ asset }: { asset: ArtAsset }) {
  const image = asset.referenceSheetUrl || asset.threeViewUrl || asset.conceptUrl;
  return <Link className={styles.assetCard} href={`/art-workbench/assets/${encodeURIComponent(asset.id)}`}><div className={styles.assetImage}>{image ? <img src={image} alt={asset.name} /> : <ImagePlus size={28} />}</div><div className={styles.assetTitle}><strong>{asset.name}</strong><span className={asset.status === "ready" ? styles.ready : ""}>{asset.status === "ready" ? "已锁定" : asset.status === "generating" ? "生成中" : asset.status === "error" ? "失败" : "草稿"}</span></div><p>{asset.role || asset.description || "尚未填写设计说明"}</p><small>{asset.kind === "character" ? `${asset.variants?.length || 0} 个剧中造型` : `${asset.variants?.length || 0} 个状态变体`}</small></Link>;
}
