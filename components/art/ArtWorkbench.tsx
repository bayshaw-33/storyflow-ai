"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { Archive, ChevronDown, FilePlus2, ImagePlus, LoaderCircle, MessageSquareText, PanelLeftClose, PanelLeftOpen, Plus, Search, Send, Sparkles, Trash2, Upload, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readProjectsFromSupabase } from "@/lib/supabase/projects";
import { readProjectsFromStorage, type DramaProject } from "@/lib/projects";
import { artStateFromProject, assetsFromExtraction, createArtAsset, createEmptyArtWorkbenchState, getArtWorkbenchStorageKey, type ArtAsset, type ArtAssetKind, type ArtWorkbenchState, type ExtractedArtAssets } from "@/lib/art-workbench";
import type { ArtAction } from "@/lib/art/types";
import { readCreativeHandoff } from "@/lib/creative-handoff";
import styles from "./ArtWorkbench.module.css";
import collapseStyles from "./ArtWorkbenchCollapse.module.css";

function getArtWorkbenchArchivePrefix(storageKey: string) {
  return `${storageKey}__archive_`;
}

function getArtWorkbenchArchiveIndexKey(storageKey: string) {
  return `${storageKey}__archive_index`;
}

type ArtWorkbenchArchiveIndex = Array<{ id: string; title: string; archivedAt: string; assetCount: number }>;

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; note?: string };
type PendingImage = { id: string; name: string; url: string; storagePath: string };

// 归档辅助：把当前草稿保存为独立存档，避免被新建/切换项目覆盖
function archiveCurrentDraft(draft: ArtWorkbenchState, storageKey: string): string | null {
  if (!draft.assets?.length && !draft.sourceText?.trim() && !draft.sourceFiles?.length) return null;
  try {
    const archiveId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const archivePrefix = getArtWorkbenchArchivePrefix(storageKey);
    localStorage.setItem(`${archivePrefix}${archiveId}`, JSON.stringify(draft));
    // 更新归档索引
    const archiveIndexKey = getArtWorkbenchArchiveIndexKey(storageKey);
    const indexRaw = localStorage.getItem(archiveIndexKey);
    const index: ArtWorkbenchArchiveIndex = indexRaw ? JSON.parse(indexRaw) : [];
    index.unshift({
      id: archiveId,
      title: draft.title || "未命名美术项目",
      archivedAt: new Date().toISOString(),
      assetCount: draft.assets?.length || 0,
    });
    // 限制归档数量为 20 个，超出删除最旧的
    const trimmed = index.slice(0, 20);
    localStorage.setItem(archiveIndexKey, JSON.stringify(trimmed));
    // 清理被裁剪掉的归档
    for (const item of index.slice(20)) {
      localStorage.removeItem(`${archivePrefix}${item.id}`);
    }
    return archiveId;
  } catch { /* localStorage 写入失败，无法归档 */ return null; }
}

function loadArchive(archiveId: string, storageKey: string): ArtWorkbenchState | null {
  try {
    const raw = localStorage.getItem(`${getArtWorkbenchArchivePrefix(storageKey)}${archiveId}`);
    return raw ? JSON.parse(raw) as ArtWorkbenchState : null;
  } catch { return null; }
}

function readArchiveIndex(storageKey: string): ArtWorkbenchArchiveIndex {
  try {
    const raw = localStorage.getItem(getArtWorkbenchArchiveIndexKey(storageKey));
    return raw ? JSON.parse(raw) as ArtWorkbenchArchiveIndex : [];
  } catch { return []; }
}

function deleteArchive(archiveId: string, storageKey: string) {
  try {
    localStorage.removeItem(`${getArtWorkbenchArchivePrefix(storageKey)}${archiveId}`);
    const index = readArchiveIndex(storageKey).filter((item) => item.id !== archiveId);
    localStorage.setItem(getArtWorkbenchArchiveIndexKey(storageKey), JSON.stringify(index));
  } catch { /* 忽略 */ }
}


type ArtWorkbenchProps = {
  /** 嵌入模式：制作工作台美术 Tab 传入的项目上下文（任务 2 合并） */
  contextProjectId?: string;
  contextProjectTitle?: string;
  /** PRD §7.2：嵌入美术台必须同时携带 sourceUnitId，scope 不能只有 project */
  contextSourceUnitId?: string;
};

export default function ArtWorkbench({ contextProjectId, contextProjectTitle, contextSourceUnitId }: ArtWorkbenchProps = {}) {
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
  const [archiveIndex, setArchiveIndex] = useState<ArtWorkbenchArchiveIndex>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const sourceInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const storageKey = getArtWorkbenchStorageKey(contextProjectId, contextSourceUnitId);
  // PRD §8.1：嵌入模式（制作工作台美术 Tab）隐藏独立项目创建/切换能力
  const isEmbedded = Boolean(contextProjectId);

  useEffect(() => {
    setIsHydrated(false);
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
    // 加载归档索引（用于"我的草稿"下拉）
    setArchiveIndex(readArchiveIndex(storageKey));
    const params = new URLSearchParams(window.location.search);

    // 通用：开始新草稿前自动归档当前草稿（不丢失任何工作成果）
    const archiveCurrentAndStartNew = (newState: ArtWorkbenchState, welcomeMessage: string) => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const current = JSON.parse(saved) as ArtWorkbenchState;
          const archiveId = archiveCurrentDraft(current, storageKey);
          if (archiveId) {
            setArchiveIndex(readArchiveIndex(storageKey));
            setNotice(isZh ? `已自动保存上一份草稿《${current.title || "未命名"}》到「我的草稿」。` : `Previous draft "${current.title || "Untitled"}" auto-archived to "My Drafts".`);
          }
        }
      } catch { /* 归档失败不阻塞新草稿创建 */ }
      setState(newState);
      setMessages([{ id: crypto.randomUUID(), role: "assistant", content: welcomeMessage }]);
    };

    // 任务 2：嵌入模式（制作工作台美术 Tab）——用传入的项目上下文初始化
    if (contextProjectId) {
      try {
        const existing = localStorage.getItem(storageKey);
        const baseState = existing ? { ...createEmptyArtWorkbenchState(), ...JSON.parse(existing) as ArtWorkbenchState } : createEmptyArtWorkbenchState();
        setState({
          ...baseState,
          projectId: contextProjectId,
          projectTitle: contextProjectTitle || baseState.projectTitle || "",
        });
      } catch {
        setState({ ...createEmptyArtWorkbenchState(), projectId: contextProjectId, projectTitle: contextProjectTitle || "" });
        setNotice(isZh ? "当前项目的本地美术草稿数据损坏，已隔离并新建空白草稿。" : "The local art draft for this project is corrupted and was isolated.");
      }
      setIsHydrated(true);
      return () => listener?.subscription.unsubscribe();
    }

    const handoff = params.get("handoff") === "creative" ? readCreativeHandoff(params.get("sourceProjectId")) : null;
    if (handoff) {
      params.delete("handoff");
      params.delete("sourceProjectId");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`);
      archiveCurrentAndStartNew(
        {
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
        },
        `已接收《${handoff.title}》的创作三件套与${handoff.contentType === "script" ? "剧本" : "小说正文"}。可以直接开始拆解角色、场景和道具。`,
      );
      setIsHydrated(true);
      return () => listener?.subscription.unsubscribe();
    }

    if (params.get("setup") === "1") {
      params.delete("setup");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}`);
      // 自动归档当前草稿后开始新空白项目
      archiveCurrentAndStartNew(createEmptyArtWorkbenchState(), isZh ? "已新建空白美术项目。可在「我的草稿」中找回之前的草稿。" : "Started a new blank art project. Previous drafts are in \"My Drafts\".");
      setIsHydrated(true);
      return () => listener?.subscription.unsubscribe();
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setState({ ...createEmptyArtWorkbenchState(), ...JSON.parse(saved) as ArtWorkbenchState });
    } catch (error) {
      // JSON 解析失败：备份损坏数据以便排查，并提示用户（不静默清空）
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) localStorage.setItem(`${storageKey}__corrupted_backup_${Date.now()}`, saved);
      } catch { /* 备份失败忽略 */ }
      setNotice(isZh ? "本地美术草稿数据损坏，已自动备份原始数据。请重新开始或联系支持。" : "Local art draft data is corrupted. Original data has been backed up.");
    }
    setIsHydrated(true);
    return () => listener?.subscription.unsubscribe();
  }, [contextProjectId, contextProjectTitle, contextSourceUnitId, isZh, storageKey]);

  useEffect(() => {
    if (!isHydrated) return;
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { setNotice("本地保存空间不足，请删除大型本地图片或立即导出项目。"); }
  }, [isHydrated, state, storageKey]);

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
    const name = window.prompt(isZh ? "请输入新项目名称" : "New project name");
    if (!name?.trim()) return;
    // 归档当前草稿（不丢失任何工作成果）
    const archiveId = archiveCurrentDraft(state, storageKey);
    if (archiveId) {
      setArchiveIndex(readArchiveIndex(storageKey));
      setNotice(isZh ? `已自动保存上一份草稿《${state.title || "未命名"}》到「我的草稿」。` : `Previous draft "${state.title || "Untitled"}" auto-archived to "My Drafts".`);
    }
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
    setMessages([{ id: crypto.randomUUID(), role: "assistant", content: `已新建《${name.trim()}》美术项目。${session ? "项目已保存到云端。" : "当前为本地草稿。"}${archiveId ? " 之前的草稿已自动归档。" : ""}` }]);
  }

  function loadArchivedDraft(archiveId: string) {
    const archived = loadArchive(archiveId, storageKey);
    if (!archived) return setNotice(isZh ? "草稿加载失败，可能已损坏或被删除。" : "Draft load failed, may be corrupted or deleted.");
    // 加载归档前，先把当前草稿也归档（如果当前有内容）
    const currentArchiveId = archiveCurrentDraft(state, storageKey);
    if (currentArchiveId) setArchiveIndex(readArchiveIndex(storageKey));
    setState({ ...createEmptyArtWorkbenchState(), ...archived });
    setMessages([{ id: crypto.randomUUID(), role: "assistant", content: `已加载草稿《${archived.title || "未命名"}》。${archived.assets?.length || 0} 个资产已恢复。` }]);
  }

  function deleteArchivedDraft(archiveId: string) {
    const archived = archiveIndex.find((item) => item.id === archiveId);
    if (!archived) return;
    if (!window.confirm(isZh ? `确定删除草稿《${archived.title}》吗？此操作不可撤销。` : `Delete draft "${archived.title}"? This cannot be undone.`)) return;
    deleteArchive(archiveId, storageKey);
    setArchiveIndex(readArchiveIndex(storageKey));
    setNotice(isZh ? "草稿已删除。" : "Draft deleted.");
  }

  function clearCurrentDraft() {
    if (!state.assets?.length && !state.sourceText?.trim()) return setNotice(isZh ? "当前没有可清空的内容。" : "Nothing to clear.");
    if (!window.confirm(isZh ? `确定清空当前草稿《${state.title}》的所有内容吗？\n\n建议先在「我的草稿」中确认已归档。此操作不可撤销。` : `Clear all content of current draft "${state.title}"?\n\nConsider archiving to "My Drafts" first. This cannot be undone.`)) return;
    // 清空前先归档（双保险）
    archiveCurrentDraft(state, storageKey);
    setArchiveIndex(readArchiveIndex(storageKey));
    setState(createEmptyArtWorkbenchState());
    setMessages([{ id: crypto.randomUUID(), role: "assistant", content: isZh ? "已清空当前草稿。之前的版本已自动归档到「我的草稿」。" : "Current draft cleared. Previous version auto-archived to \"My Drafts\"." }]);
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
          {/* PRD §8.1：嵌入模式（制作工作台美术 Tab）隐藏独立项目创建/切换能力 */}
          {isEmbedded ? null : (
            <>
              <label className={styles.projectSelect}><Archive size={15} /><select value={state.projectId || ""} onChange={(event) => selectProject(event.target.value)}><option value="">关联已有项目</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><ChevronDown size={14} /></label>
              <label className={styles.projectSelect}><Archive size={15} /><select value="" onChange={(event) => { const id = event.target.value; if (id) loadArchivedDraft(id); event.target.value = ""; }}><option value="">{isZh ? "我的草稿" : "My Drafts"} ({archiveIndex.length})</option>{archiveIndex.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.assetCount} 项 · {new Date(item.archivedAt).toLocaleDateString()}</option>)}</select><ChevronDown size={14} /></label>
              <button type="button" onClick={newProject}><Plus size={15} />{isZh ? "新建项目" : "New"}</button>
              <button type="button" onClick={clearCurrentDraft} title={isZh ? "清空当前草稿（自动归档后清空）" : "Clear current draft (auto-archives first)"}><Trash2 size={15} />{isZh ? "清空" : "Clear"}</button>
            </>
          )}
          {isEmbedded && contextProjectTitle ? <span className={styles.provider}>{contextProjectTitle}</span> : null}
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
          <div className={`${styles.assetGrid} ${collapseStyles.assetGrid}`}>{visibleAssets.map((asset) => <AssetCard key={asset.id} asset={asset} onDelete={deleteAsset} isZh={isZh} scopeProjectId={contextProjectId} scopeSourceUnitId={contextSourceUnitId} />)}{!visibleAssets.length ? <div className={styles.empty}><Users size={34} /><strong>这里还没有资产</strong><p>让 KK 自动拆解资料，或直接告诉它要增加什么。</p><button type="button" onClick={addAsset}><Plus size={15} />手动新增</button></div> : null}</div>
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

function AssetCard({ asset, onDelete, isZh, scopeProjectId, scopeSourceUnitId }: { asset: ArtAsset; onDelete?: (id: string) => void; isZh?: boolean; scopeProjectId?: string; scopeSourceUnitId?: string }) {
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
  // PRD §7.2 / §12.3：资产卡详情链接必须携带 projectId + sourceUnitId，详情页使用同一 scoped storage key
  const assetDetailHref = useMemo(() => {
    const path = `/art-workbench/assets/${encodeURIComponent(asset.id)}`;
    if (scopeProjectId && scopeSourceUnitId) {
      const params = new URLSearchParams({ projectId: scopeProjectId, sourceUnitId: scopeSourceUnitId });
      return `${path}?${params.toString()}`;
    }
    return path;
  }, [asset.id, scopeProjectId, scopeSourceUnitId]);
  return (
    <div className={styles.assetCardWrapper}>
      <Link className={styles.assetCard} href={assetDetailHref}>
        <div className={styles.assetImage}>{image ? <img src={image} alt={asset.name} /> : <ImagePlus size={28} />}</div>
        <div className={styles.assetTitle}><strong>{asset.name}</strong><span className={asset.status === "ready" ? styles.ready : ""}>{asset.status === "ready" ? "已锁定" : asset.status === "generating" ? "生成中" : asset.status === "error" ? "失败" : "草稿"}</span></div>
        <p>{asset.role || asset.description || "尚未填写设计说明"}</p>
        <small>{asset.kind === "character" ? `${asset.variants?.length || 0} 个剧中造型` : `${asset.variants?.length || 0} 个状态变体`}</small>
      </Link>
      {onDelete ? <button type="button" className={styles.assetDeleteBtn} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(asset.id); }} title={isZh ? "删除" : "Delete"}>×</button> : null}
    </div>
  );
}
