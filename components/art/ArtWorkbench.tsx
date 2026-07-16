"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { Archive, ChevronDown, FilePlus2, ImagePlus, LoaderCircle, MessageSquareText, PanelLeftClose, PanelLeftOpen, Plus, Search, Send, Sparkles, Upload, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readProjectsFromSupabase } from "@/lib/supabase/projects";
import { readProjectsFromStorage, type DramaProject } from "@/lib/projects";
import { artStateFromProject, assetsFromExtraction, createArtAsset, createEmptyArtWorkbenchState, type ArtAsset, type ArtAssetKind, type ArtWorkbenchState, type ExtractedArtAssets } from "@/lib/art-workbench";
import type { ArtAction } from "@/lib/art/types";
import { readCreativeHandoff } from "@/lib/creative-handoff";
import styles from "./ArtWorkbench.module.css";
import collapseStyles from "./ArtWorkbenchCollapse.module.css";

export const ART_WORKBENCH_STORAGE_KEY = "kiikis_art_workbench_state";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; note?: string };
type PendingImage = { id: string; name: string; url: string; storagePath: string };

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
  const [isAssistantCollapsed, setIsAssistantCollapsed] = useState(false);
  const sourceInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const localProjects = readProjectsFromStorage();
    setProjects(localProjects);
    const loadSession = async (next: Session | null) => {
      setSession(next);
      if (!next?.access_token) return setProjects(localProjects);
      const cloudProjects = await readProjectsFromSupabase({ accessToken: next.access_token }).catch(() => []);
      setProjects(mergeArtProjects(localProjects, cloudProjects));
    };
    void supabase?.auth.getSession().then(({ data }) => loadSession(data.session || null));
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, next) => { void loadSession(next); }) || {};
    const params = new URLSearchParams(window.location.search);
    const handoff = params.get("handoff") === "creative" ? readCreativeHandoff(params.get("sourceProjectId")) : null;
    if (handoff) {
      // 检测 localStorage 是否已有草稿 assets，避免覆盖用户未导出的工作成果
      let hasExistingAssets = false;
      try {
        const saved = localStorage.getItem(ART_WORKBENCH_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as ArtWorkbenchState;
          hasExistingAssets = Boolean(parsed?.assets?.length);
        }
      } catch { /* 解析失败视为无草稿 */ }
      if (hasExistingAssets) {
        const choice = window.confirm(isZh
          ? "检测到本地已有未导出的美术资产。\n\n点击「确定」将用创作工作台的新资料覆盖现有草稿（assets 将被清空）；点击「取消」将保留现有草稿，仅继续编辑。"
          : "Existing unsaved art assets found locally.\n\nClick OK to overwrite with new handoff materials (assets will be cleared); click Cancel to keep the existing draft.");
        if (!choice) {
          // 用户取消：保留草稿，从 localStorage 恢复
          try {
            const saved = localStorage.getItem(ART_WORKBENCH_STORAGE_KEY);
            if (saved) setState({ ...createEmptyArtWorkbenchState(), ...JSON.parse(saved) as ArtWorkbenchState });
          } catch { /* 保留当前空 state */ }
          return () => listener?.subscription.unsubscribe();
        }
      }
      setState({
        ...createEmptyArtWorkbenchState(),
        projectId: handoff.sourceProjectId,
        projectTitle: handoff.title,
        title: `${handoff.title} 美术设定`,
        sourceText: [
          handoff.projectBackground ? `【项目背景】\n${handoff.projectBackground}` : "",
          handoff.worldAndOutline ? `【世界观与大纲】\n${handoff.worldAndOutline}` : "",
          handoff.characterBible ? `【角色 Bible】\n${handoff.characterBible}` : "",
          handoff.manuscript ? `【${handoff.contentType === "script" ? "剧本" : "小说正文"}】\n${handoff.manuscript}` : "",
        ].filter(Boolean).join("\n\n"),
      });
      setMessages([{ id: crypto.randomUUID(), role: "assistant", content: `已接收《${handoff.title}》的创作三件套与${handoff.contentType === "script" ? "剧本" : "小说正文"}。可以直接开始拆解角色、场景和道具。` }]);
      return () => listener?.subscription.unsubscribe();
    }
    if (params.get("setup") === "1") {
      params.delete("setup");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`);
      // 检测 localStorage 是否已有草稿数据，避免清空用户未导出的工作成果
      let hasExistingDraft = false;
      try {
        const saved = localStorage.getItem(ART_WORKBENCH_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as ArtWorkbenchState;
          hasExistingDraft = Boolean(parsed?.assets?.length || parsed?.sourceText?.trim() || parsed?.sourceFiles?.length);
        }
      } catch { /* 解析失败视为无草稿 */ }
      if (hasExistingDraft) {
        // 已有草稿：提示用户选择保留或清空，默认保留
        const choice = window.confirm(isZh
          ? "检测到本地已有未导出的美术工作草稿。\n\n点击「确定」将清空草稿并新建空白项目；点击「取消」将保留现有草稿并继续编辑。"
          : "Existing unsaved art workbench draft found locally.\n\nClick OK to clear it and start a new blank project; click Cancel to keep the existing draft.");
        if (!choice) {
          // 用户取消：保留草稿，从 localStorage 恢复
          try {
            const saved = localStorage.getItem(ART_WORKBENCH_STORAGE_KEY);
            if (saved) setState({ ...createEmptyArtWorkbenchState(), ...JSON.parse(saved) as ArtWorkbenchState });
          } catch { /* 保留当前空 state */ }
          return () => listener?.subscription.unsubscribe();
        }
      }
      localStorage.removeItem(ART_WORKBENCH_STORAGE_KEY);
      setState(createEmptyArtWorkbenchState());
      return () => listener?.subscription.unsubscribe();
    }
    try {
      const saved = localStorage.getItem(ART_WORKBENCH_STORAGE_KEY);
      if (saved) setState({ ...createEmptyArtWorkbenchState(), ...JSON.parse(saved) as ArtWorkbenchState });
    } catch (error) {
      // JSON 解析失败：备份损坏数据以便排查，并提示用户（不静默清空）
      try {
        const saved = localStorage.getItem(ART_WORKBENCH_STORAGE_KEY);
        if (saved) localStorage.setItem(`${ART_WORKBENCH_STORAGE_KEY}__corrupted_backup_${Date.now()}`, saved);
      } catch { /* 备份失败忽略 */ }
      setNotice(isZh ? "本地美术草稿数据损坏，已自动备份原始数据。请重新开始或联系支持。" : "Local art draft data is corrupted. Original data has been backed up.");
    }
    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    try { localStorage.setItem(ART_WORKBENCH_STORAGE_KEY, JSON.stringify(state)); } catch { setNotice("本地保存空间不足，请删除大型本地图片或立即导出项目。"); }
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

  async function newProject() {
    // 检测当前是否已有草稿 assets，避免误操作清空
    if (state.assets?.length) {
      const confirmed = window.confirm(isZh
        ? `当前美术工作台已有 ${state.assets.length} 个资产尚未导出。\n\n新建项目将清空当前所有资产。确定继续吗？`
        : `Current workbench has ${state.assets.length} assets not yet exported.\n\nCreating a new project will clear all current assets. Continue?`);
      if (!confirmed) return;
    }
    const name = window.prompt(isZh ? "请输入新项目名称" : "New project name");
    if (!name?.trim()) return;
    const next = createEmptyArtWorkbenchState();
    next.title = name.trim();
    const supabase = getSupabaseBrowserClient();
    if (session?.user && supabase) {
      const { data, error } = await supabase.from("storyflow_art_projects").insert({ owner_id: session.user.id, name: next.title, visual_style: next.visualStyle }).select("id").single();
      if (error) return setNotice(`云端项目创建失败：${error.message}`);
      next.id = data.id;
    } else {
      setNotice("当前未登录，项目只保存在这台设备。登录后可创建团队云端项目。");
    }
    setState(next);
    setMessages([{ id: crypto.randomUUID(), role: "assistant", content: `已新建《${name.trim()}》美术项目。${session ? "项目已保存到云端。" : "当前为本地草稿。"}` }]);
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

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!session?.access_token) return setNotice("请先登录后再上传参考图。");
    setBusy("image");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/art/upload-reference", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form });
      const payload = await response.json() as { success?: boolean; previewUrl?: string; storagePath?: string; error?: string };
      if (!response.ok || !payload.previewUrl || !payload.storagePath) throw new Error(payload.error || "参考图上传失败");
      setPendingImage({ id: crypto.randomUUID(), name: file.name, url: payload.previewUrl, storagePath: payload.storagePath });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "参考图上传失败");
    } finally {
      setBusy("");
      event.target.value = "";
    }
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
      const response = await fetch("/api/art/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ message: userMessage, projectTitle: state.title, assets: state.assets, attachments: pendingImage ? [{ id: pendingImage.id, name: pendingImage.name, kind: "image", url: pendingImage.url, storagePath: pendingImage.storagePath }] : [] }) });
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

  function deleteAsset(assetId: string) {
    if (!window.confirm(isZh ? "确定删除这个资产吗？" : "Delete this asset?")) return;
    patchState({ assets: state.assets.filter((item) => item.id !== assetId), selectedAssetId: state.selectedAssetId === assetId ? "" : state.selectedAssetId });
  }

  return (
    <main className={`${styles.page} art-workbench-shell`}>
      <header className={styles.header}>
        <div className={styles.brand}><span>KIIKIS</span><strong>{state.title}</strong><small>美术工作台</small></div>
        <div className={styles.headerActions}>
          <label className={styles.projectSelect}><Archive size={15} /><select value={state.projectId || ""} onChange={(event) => selectProject(event.target.value)}><option value="">关联已有项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><ChevronDown size={14} /></label>
          <button type="button" onClick={newProject}><Plus size={15} />新建项目</button>
          <span className={styles.provider}><Sparkles size={14} />智能选择</span>
        </div>
      </header>

      {notice ? <button className={styles.notice} type="button" onClick={() => setNotice("")}>{notice}</button> : null}

      <div className={`${styles.workspace} ${collapseStyles.workspace} ${isAssistantCollapsed ? collapseStyles.assistantCollapsed : ""}`}>
        <section className={styles.chatPanel}>
          <div className={`${styles.chatHead} ${collapseStyles.chatHead}`}><div><MessageSquareText size={18} /><strong>KK 美术助理</strong></div><div className={collapseStyles.chatHeadActions}><button className={collapseStyles.collapseButton} type="button" aria-expanded={!isAssistantCollapsed} aria-label={isAssistantCollapsed ? "展开 KK 美术助理" : "折叠 KK 美术助理"} title={isAssistantCollapsed ? "展开 KK 美术助理" : "折叠 KK 美术助理"} onClick={() => setIsAssistantCollapsed((collapsed) => !collapsed)}>{isAssistantCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button><button className={collapseStyles.manageSourcesButton} type="button" onClick={() => sourceInput.current?.click()}><FilePlus2 size={15} />管理资料</button></div></div>
          <div className={`${styles.sourceChips} ${collapseStyles.sourceChips}`}>{state.sourceFiles.slice(0, 5).map((file) => <span key={file.id}>{file.name}</span>)}{state.projectTitle ? <span>Universe · {state.projectTitle}</span> : null}{!state.sourceFiles.length && !state.projectTitle ? <small>还没有资料，上传剧本或关联项目即可开始</small> : null}</div>
          <div className={`${styles.messages} ${collapseStyles.messages}`}>{messages.map((item) => <article key={item.id} className={item.role === "user" ? styles.userMessage : styles.assistantMessage}><p>{item.content}</p>{item.note ? <small>{item.note}</small> : null}</article>)}{busy === "chat" ? <div className={styles.thinking}><LoaderCircle className={styles.spin} size={16} />KK 正在整理美术仓库...</div> : null}</div>
          <div className={`${styles.composer} ${collapseStyles.composer}`}>
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
          <div className={`${styles.assetGrid} ${collapseStyles.assetGrid}`}>{visibleAssets.map((asset) => <AssetCard key={asset.id} asset={asset} onDelete={deleteAsset} isZh={isZh} />)}{!visibleAssets.length ? <div className={styles.empty}><Users size={34} /><strong>这里还没有资产</strong><p>让 KK 自动拆解资料，或直接告诉它要增加什么。</p><button type="button" onClick={addAsset}><Plus size={15} />手动新增</button></div> : null}</div>
        </section>
      </div>
    </main>
  );
}

function mergeArtProjects(localProjects: DramaProject[], cloudProjects: DramaProject[]) {
  const projects = new Map<string, DramaProject>();
  for (const project of [...localProjects, ...cloudProjects]) {
    const current = projects.get(project.id);
    if (!current || project.updatedAt.localeCompare(current.updatedAt) > 0) projects.set(project.id, project);
  }
  return Array.from(projects.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function AssetCard({ asset, onDelete, isZh }: { asset: ArtAsset; onDelete?: (id: string) => void; isZh?: boolean }) {
  const image = useMemo(() => {
    // 优先使用已设为终稿的版本图；否则取最新生成的版本图
    const masterVariant = asset.variants?.find((item) => item.type === "master");
    const approvedVersion = masterVariant?.versions.find((item) => item.id === masterVariant.approvedVersionId);
    if (approvedVersion?.imageUrl?.startsWith("http")) return approvedVersion.imageUrl;
    const latestVersion = asset.variants?.flatMap((item) => item.versions).find((item) => item.imageUrl?.startsWith("http"));
    if (latestVersion?.imageUrl) return latestVersion.imageUrl;
    // 回退到资产级字段（仅在未使用 variants 结构时）
    return asset.referenceSheetUrl || asset.threeViewUrl || asset.conceptUrl;
  }, [asset]);
  return (
    <div className={styles.assetCardWrapper}>
      <Link className={styles.assetCard} href={`/art-workbench/assets/${encodeURIComponent(asset.id)}`}>
        <div className={styles.assetImage}>{image ? <img src={image} alt={asset.name} /> : <ImagePlus size={28} />}</div>
        <div className={styles.assetTitle}><strong>{asset.name}</strong><span className={asset.status === "ready" ? styles.ready : ""}>{asset.status === "ready" ? "已锁定" : asset.status === "generating" ? "生成中" : asset.status === "error" ? "失败" : "草稿"}</span></div>
        <p>{asset.role || asset.description || "尚未填写设计说明"}</p>
        <small>{asset.kind === "character" ? `${asset.variants?.length || 0} 个剧中造型` : `${asset.variants?.length || 0} 个状态变体`}</small>
      </Link>
      {onDelete ? <button type="button" className={styles.assetDeleteBtn} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(asset.id); }} title={isZh ? "删除" : "Delete"}>×</button> : null}
    </div>
  );
}
