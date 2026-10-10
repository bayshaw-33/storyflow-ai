"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { Archive, ChevronDown, FilePlus2, ImagePlus, LoaderCircle, MessageSquareText, PanelRightClose, PanelRightOpen, Plus, Search, Sparkles, Trash2, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import { readProjectsFromSupabase } from "@/lib/supabase/projects";
import { readProjectsFromStorage, type DramaProject } from "@/lib/projects";
import { artStateFromProject, assetsFromExtraction, backupCorruptedArtDraft, canPersistArtDraft, collectArtStoragePaths, createArtAsset, createEmptyArtWorkbenchState, replaceArtVersionPreviewUrls, resolveArtDraftKey, type ArtAsset, type ArtAssetKind, type ArtWorkbenchState, type ExtractedArtAssets } from "@/lib/art-workbench";
import type { ArtAction } from "@/lib/art/types";
import { addGeneratedArtCandidates, applyArtChatActions, resolveStandaloneArtDraftKey, type ArtChatDraft, type ArtChatJob, type ArtChatMessage, type ArtChatScope, type ArtReference } from "@/lib/art/chat-workflow";
import { buildArtGenerationPrompt } from "@/lib/art/chat-intent";
import { listCompatibleArtModels, resolveCompatibleArtModelId } from "@/lib/art/providers/selection";
import type { ArtModelDescriptor } from "@/lib/art/providers/types";
import ArtChatComposer from "./ArtChatComposer";
import ArtChatImages from "./ArtChatImages";
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

const welcome: ArtChatMessage = { id: "hello", role: "assistant", content: "我是 KK 美术助理。上传参考图，告诉我想画什么；我会生成图片候选并放进美术仓库。也可以上传剧本，让我拆解角色、场景与道具。" };

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
  /** Task 6：嵌入美术台必须绑定到明确的 stage Work */
  contextWorkId?: string;
  /** 独立美术台的本地草稿作用域；避免详情页回读账号级旧缓存 */
  standaloneDraftId?: string;
};

export default function ArtWorkbench({ contextProjectId, contextProjectTitle, contextSourceUnitId, contextWorkId, standaloneDraftId: standaloneDraftIdProp }: ArtWorkbenchProps = {}) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [state, setState] = useState<ArtWorkbenchState>(() => createEmptyArtWorkbenchState());
  const [selectedKind, setSelectedKind] = useState<ArtAssetKind>("character");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ArtChatMessage[]>([welcome]);
  const [pendingImages, setPendingImages] = useState<ArtReference[]>([]);
  const [jobs, setJobs] = useState<ArtChatJob[]>([]);
  const [models, setModels] = useState<ArtModelDescriptor[]>([]);
  const [modelId, setModelId] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1" | "4:3" | "3:4">("9:16");
  const [count, setCount] = useState<1 | 2 | 4>(1);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [isRepositoryCollapsed, setIsRepositoryCollapsed] = useState(false);
  const [archiveIndex, setArchiveIndex] = useState<ArtWorkbenchArchiveIndex>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [standaloneDraftId, setStandaloneDraftId] = useState<string | null>(standaloneDraftIdProp || null);
  const sourceInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const chatPanel = useRef<HTMLElement>(null);
  const isEmbedded = Boolean(contextProjectId || contextWorkId);
  const embeddedStorageKey = isEmbedded
    ? resolveArtDraftKey({ userId: session?.user.id, projectId: contextProjectId, workId: contextWorkId })
    : null;
  const storageKey = embeddedStorageKey || (!isEmbedded ? resolveStandaloneArtDraftKey(session?.user.id || (sessionReady ? "local" : undefined), standaloneDraftId || undefined) : null) || "";
  const storageReady = Boolean(storageKey);
  const scope: ArtChatScope = isEmbedded ? { projectId: contextProjectId, workId: contextWorkId } : { draftId: standaloneDraftId || undefined };
  const scopeRef = useRef(storageKey);
  scopeRef.current = storageKey;
  const stateRef = useRef(state);
  stateRef.current = state;
  const ready = isHydrated && canPersistArtDraft({ storageReady, storageKey, hydratedStorageKey });
  const cloudWrites = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (standaloneDraftIdProp) setStandaloneDraftId(standaloneDraftIdProp);
  }, [standaloneDraftIdProp]);

  useEffect(() => {
    const panel = chatPanel.current?.querySelector<HTMLElement>("[aria-live=polite]");
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [messages, busy]);

  function setStandaloneDraftScope(draftId: string, initialState?: ArtWorkbenchState) {
    if (isEmbedded) return;
    const nextKey = resolveStandaloneArtDraftKey(session?.user.id || "local", draftId)!;
    if (initialState) localStorage.setItem(nextKey, JSON.stringify(initialState));
    setStandaloneDraftId(draftId);
    if (typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("draftId", draftId);
        url.searchParams.delete("setup");
        window.history.replaceState(null, "", url.toString());
      } catch { /* URL 更新失败不阻塞新草稿创建 */ }
    }
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const localProjects = readProjectsFromStorage();
    setProjects(localProjects);
    const loadSession = async (next: Session | null) => {
      setSession(next);
      setSessionReady(true);
      if (!next?.access_token) return setProjects(localProjects);
      const cloudProjects = await readProjectsFromSupabase({ accessToken: next.access_token }).catch(() => []);
      setProjects(mergeArtProjects(localProjects, cloudProjects));
    };
    if (!supabase) setSessionReady(true);
    void supabase?.auth.getSession().then(({ data }) => loadSession(data.session || null));
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, next) => { void loadSession(next); }) || {};
    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.access_token) { setModels([]); return; }
    let cancelled = false;
    void fetchWithAuthRetry("/api/art/models").then(response => response.json()).then(payload => {
      if (!cancelled) setModels(payload.models || []);
    }).catch(() => { if (!cancelled) setNotice("图片模型暂时加载失败，请刷新后重试。"); });
    return () => { cancelled = true; };
  }, [session?.user.id]);

  useEffect(() => {
    const compatibleId = resolveCompatibleArtModelId(models, modelId, pendingImages.length);
    if (compatibleId === modelId) return;
    const replacement = models.find((item) => item.id === compatibleId);
    setModelId(compatibleId);
    setNotice(replacement
      ? `已切换为 ${replacement.label}，适配${pendingImages.length ? "参考图生成" : "文生图"}。`
      : `已切换为智能选择，适配${pendingImages.length ? "参考图生成" : "文生图"}。`);
  }, [models, modelId, pendingImages.length]);

  useEffect(() => {
    setIsHydrated(false);
    setHydratedStorageKey(null);
    setCloudReady(false);
    setPendingImages([]);
    setMessage("");
    setBusy("");
    setMessages([welcome]);
    setJobs([]);
    setState({ ...createEmptyArtWorkbenchState(), projectId: contextProjectId, projectTitle: contextProjectTitle });
    if (!sessionReady) return;
    const params = new URLSearchParams(window.location.search);
    if (!isEmbedded && (!standaloneDraftId || params.get("setup") === "1")) {
      const next = createEmptyArtWorkbenchState();
      const handoff = params.get("handoff") === "creative" ? readCreativeHandoff(params.get("sourceProjectId")) : null;
      if (handoff) {
        next.projectId = handoff.sourceProjectId;
        next.title = `${handoff.title} 美术设定`;
        next.projectTitle = handoff.title;
        next.sourceText = [handoff.projectBackground, handoff.worldAndOutline, handoff.characterBible, handoff.manuscript].filter(Boolean).join("\n\n");
      }
      try { setStandaloneDraftScope(next.id, next); } catch { setNotice("无法保存新草稿，请检查设备存储空间。"); }
      return;
    }
    if (!storageReady) return;
    let cancelled = false;
    void (async () => {
      let saved: ArtChatDraft | null = null;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) saved = { state: JSON.parse(raw), messages: [welcome], jobs: [], ...JSON.parse(localStorage.getItem(`${storageKey}__chat`) || "{}") };
      } catch {
        try { backupCorruptedArtDraft(localStorage, storageKey); } catch { /* Keep corrupt original. */ }
        setNotice("草稿数据损坏，已保留原始数据备份。");
      }
      if (session?.access_token) {
        try {
          const response = await fetchWithAuthRetry(`/api/art/draft?${new URLSearchParams(scope as Record<string, string>)}`);
          const payload = await response.json() as { success?: boolean; draft?: ArtChatDraft };
          if (!response.ok) throw new Error();
          if (!cancelled) setCloudReady(true);
          if (payload.draft?.state && (!saved || payload.draft.state.updatedAt > saved.state.updatedAt)) saved = payload.draft;
        } catch { if (!cancelled) setNotice("云端草稿暂时无法读取，当前使用本地草稿；请勿清理浏览器数据。"); }
      }
      if (cancelled) return;
      const next = { ...createEmptyArtWorkbenchState(), ...saved?.state, ...(isEmbedded ? { projectId: contextProjectId, projectTitle: contextProjectTitle || saved?.state.projectTitle } : {}) };
      setState(next);
      setMessages(saved?.messages?.length ? saved.messages : [welcome]);
      setJobs(saved?.jobs || []);
      setArchiveIndex(readArchiveIndex(storageKey));
      setHydratedStorageKey(storageKey);
      setIsHydrated(true);
    })();
    return () => { cancelled = true; };
  // Only identity changes rehydrate; editing a project title must not reset chat.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, storageReady, sessionReady]);

  useEffect(() => {
    if (!isHydrated || !canPersistArtDraft({ storageReady, storageKey, hydratedStorageKey })) return;
    const draft: ArtChatDraft = { state, messages, jobs };
    try { localStorage.setItem(storageKey, JSON.stringify(state)); localStorage.setItem(`${storageKey}__chat`, JSON.stringify({ messages, jobs })); } catch { setNotice("本地保存空间不足，请立即导出项目。"); }
    if (!session?.access_token || !cloudReady) return;
    const timer = setTimeout(() => {
      cloudWrites.current = cloudWrites.current.catch(() => undefined).then(async () => {
        if (scopeRef.current !== storageKey) return;
        const response = await fetchWithAuthRetry("/api/art/draft", { method: "PUT", body: JSON.stringify({ ...scope, draft }) });
        if (!response.ok && scopeRef.current === storageKey) setNotice("云端同步失败，草稿已保存在本机；请稍后重试。");
      }).catch(() => { if (scopeRef.current === storageKey) setNotice("云端同步失败，草稿已保存在本机。"); });
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydratedStorageKey, isHydrated, state, messages, jobs, storageKey, storageReady, cloudReady]);

  const artStoragePathSignature = useMemo(() => collectArtStoragePaths(state).join("\n"), [state]);
  useEffect(() => {
    if (!isHydrated || !canPersistArtDraft({ storageReady, storageKey, hydratedStorageKey }) || !artStoragePathSignature) return;
    let cancelled = false;
    void fetchArtDraftPreviewUrls(state).then((urls) => {
      if (!cancelled && urls) {
        setState((current) => replaceArtVersionPreviewUrls(current, urls));
        setMessages(current => current.map(item => ({ ...item, images: item.images?.map(image => ({ ...image, previewUrl: urls[image.storagePath] || image.previewUrl })) })));
      }
    });
    return () => { cancelled = true; };
  // Re-sign once per distinct durable path set; URL changes alone do not loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artStoragePathSignature, hydratedStorageKey, isHydrated, storageKey, storageReady]);

  const visibleAssets = useMemo(() => ready ? state.assets.filter((asset) => asset.kind === selectedKind && (!query.trim() || `${asset.name} ${asset.role} ${asset.description}`.toLowerCase().includes(query.trim().toLowerCase()))) : [], [ready, state.assets, selectedKind, query]);
  const counts = useMemo(() => ({ character: state.assets.filter((asset) => asset.kind === "character").length, scene: state.assets.filter((asset) => asset.kind === "scene").length, prop: state.assets.filter((asset) => asset.kind === "prop").length }), [state.assets]);

  function patchState(patch: Partial<ArtWorkbenchState>) {
    setState((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  }

  // 自动同步项目资料：projects 加载完成或 projectId 变化时，强制用最新项目数据同步 sourceText。
  // 修复"美术台解析与剧本无关"问题：之前只在 sourceText 为空时同步，导致 localStorage 缓存的
  // 旧 sourceText（可能因为字段读取 bug 而缺失剧本正文）不会被刷新。
  const lastSyncedProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isHydrated) return;
    if (!state.projectId) return;
    // 只在 projectId 变化或首次同步时执行，避免无限循环
    if (lastSyncedProjectIdRef.current === state.projectId) return;
    const project = projects.find((item) => item.id === state.projectId);
    if (!project) return;
    const patch = artStateFromProject(project);
    if (!patch.sourceText?.trim()) return;
    lastSyncedProjectIdRef.current = state.projectId;
    patchState({ ...patch, projectId: state.projectId });
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: `已同步《${project.title}》的最新资料（共 ${(patch.sourceText || "").length.toLocaleString()} 字），现在可以点击「自动拆解」了。` }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, projects, state.projectId]);

  function selectProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const patch = artStateFromProject(project);
    if (!isEmbedded) {
      const next = { ...createEmptyArtWorkbenchState(), ...patch };
      setStandaloneDraftScope(next.id, next);
      setState(next);
    }
    // 嵌入模式（制作工作台美术 Tab）：同步更新 URL 的 projectId，
    // 让父组件 ProductionWorkbench 在下次刷新时能感知到 art 关联的项目切换。
    if (isEmbedded && typeof window !== "undefined") {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("projectId", projectId);
        window.history.replaceState(null, "", url.toString());
      } catch { /* URL 更新失败不阻塞关联 */ }
    }
    // 明确告知用户同步了哪些资料 + 字数，避免"看不到资料"的错觉
    const syncedParts: string[] = [];
    if (project.idea?.trim()) syncedParts.push("项目创意");
    if (project.brief?.trim()) syncedParts.push("项目背景");
    if (project.storyBible) syncedParts.push("故事圣经");
    if (project.characters?.trim()) syncedParts.push("角色资料");
    if (project.characterCards?.length) syncedParts.push("角色卡");
    if (project.finalScript?.trim() || project.chineseScript?.trim() || project.importedScript?.trim()) syncedParts.push("剧本");
    const charCount = (patch.sourceText || "").length;
    const syncedText = syncedParts.length
      ? `已同步资料：${syncedParts.join("、")}（共 ${charCount.toLocaleString()} 字）。`
      : `该项目暂无可同步的剧本/资料，请先在创作工作台补充内容，或直接上传资料。`;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: `已关联《${project.title}》。${syncedText}${syncedParts.length ? "点击右上方「自动拆解」按钮即可让 KK 拆解角色、场景和道具。" : ""}` }]);
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
    setStandaloneDraftScope(next.id, next);
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
    const targetScope = storageKey;
    try {
      let sourceText = state.sourceText;
      const added = [];
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetchWithAuthRetry("/api/files/parse", { method: "POST", body: form });
        const payload = await response.json() as { success?: boolean; text?: string; fileName?: string; error?: string };
        if (!response.ok || !payload.success || !payload.text?.trim()) throw new Error(payload.error || `无法解析 ${file.name}（HTTP ${response.status}）`);
        const entry = { id: crypto.randomUUID(), name: payload.fileName || file.name, text: payload.text, addedAt: new Date().toISOString() };
        added.push(entry);
        sourceText = [sourceText, `【${entry.name}】\n${entry.text}`].filter(Boolean).join("\n\n");
      }
      if (scopeRef.current !== targetScope) return;
      patchState({ sourceText, sourceFiles: [...added, ...state.sourceFiles] });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: `已读取 ${added.length} 份资料。你可以让我自动拆解，或继续上传补充资料。` }]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "资料解析失败");
    } finally {
      if (scopeRef.current === targetScope) setBusy("");
      event.target.value = "";
    }
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length || !ready) return;
    if (!session?.access_token) return setNotice("请先登录后再上传参考图。");
    setBusy("image");
    const targetScope = storageKey;
    try {
      for (const file of files.slice(0, Math.max(0, 8 - pendingImages.length))) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetchWithAuthRetry("/api/art/upload-reference", { method: "POST", body: form });
        const payload = await response.json() as { previewUrl?: string; storagePath?: string; error?: string };
        if (!response.ok || !payload.previewUrl || !payload.storagePath) throw new Error(payload.error || "参考图上传失败");
        if (scopeRef.current !== targetScope) return;
        setPendingImages(current => [...current, { id: crypto.randomUUID(), name: file.name, url: payload.previewUrl!, storagePath: payload.storagePath! }]);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "参考图上传失败");
    } finally {
      if (scopeRef.current === targetScope) setBusy("");
      event.target.value = "";
    }
  }

  async function extractAssets() {
    if (!ready || busy) return;
    if (!session?.access_token) return setNotice("请先登录后再让 AI 拆解资产。");

    // 强制用最新项目数据重建 sourceText，避免 localStorage 缓存旧的/缺失剧本正文的 sourceText
    let effectiveSourceText = state.sourceText;
    if (state.projectId) {
      const latestProject = projects.find((item) => item.id === state.projectId);
      if (latestProject) {
        const freshPatch = artStateFromProject(latestProject);
        if (freshPatch.sourceText?.trim()) {
          effectiveSourceText = freshPatch.sourceText;
          patchState({ sourceText: effectiveSourceText, projectTitle: latestProject.title, title: freshPatch.title || state.title });
        }
      }
    }

    if (!effectiveSourceText.trim()) return setNotice("请先关联项目或上传资料。");
    if (effectiveSourceText.length < 100) return setNotice("项目资料太少，无法拆解。请确认项目已关联剧本正文（最终剧本/导入剧本）。");

    setBusy("extract");
    const targetScope = storageKey;
    try {
      const response = await fetchWithAuthRetry("/api/art/extract-assets", { method: "POST", body: JSON.stringify({ title: state.title, visualStyle: state.visualStyle, sourceText: effectiveSourceText }) });
      const payload = await response.json() as ExtractedArtAssets & { success?: boolean; error?: string; warning?: string; degraded?: boolean; sourceTextPreview?: string; sourceTextLength?: number };
      if (!response.ok || !payload.success) throw new Error(payload.error || "拆解失败");
      if (scopeRef.current !== targetScope) return;
      const assets = assetsFromExtraction(payload);
      patchState({ assets, selectedAssetId: assets[0]?.id, title: payload.title || state.title, visualStyle: payload.visualStyle || state.visualStyle });
      // degraded 时在消息正文里明确标注"降级模式"，避免用户忽略 note
      const baseContent = `已完成初步拆解：${assets.filter((item) => item.kind === "character").length} 个角色、${assets.filter((item) => item.kind === "scene").length} 个场景、${assets.filter((item) => item.kind === "prop").length} 个关键道具。`;
      const debugInfo = payload.sourceTextLength ? `\n\n（资料：${payload.sourceTextLength} 字符）` : "";
      const content = payload.degraded
        ? `⚠️ 降级模式：AI 调用失败，已根据剧本资料生成基础初稿（建议检查后手动修正）。\n${baseContent}\n失败原因：${payload.error || "未知错误"}${debugInfo}`
        : `${baseContent}${debugInfo}`;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content, note: payload.warning }]);
    } catch (error) { if (scopeRef.current === targetScope) setNotice(error instanceof Error ? error.message : "拆解失败"); } finally { if (scopeRef.current === targetScope) setBusy(""); }
  }

  async function sendMessage() {
    const content = message.trim();
    if ((!content && !pendingImages.length) || busy || !ready) return;
    if (jobs.some(job => job.status === "running")) return setNotice("当前图片任务尚未完成，请等结果恢复后再发送，避免重复生成。");
    if (!session?.access_token) return setNotice("请先登录后再使用 KK 美术助理。");
    const targetScope = storageKey;
    const references = [...pendingImages];
    const userMessage = content || "请根据参考图生成图片候选，保持主体一致。";
    const userMessageId = crypto.randomUUID();
    setMessages((current) => [...current, { id: userMessageId, role: "user", content: userMessage, images: references.map(ref => ({ previewUrl: ref.url, storagePath: ref.storagePath })) }]);
    setBusy("chat");
    setNotice("");
    try {
      const response = await fetchWithAuthRetry("/api/art/chat", { method: "POST", body: JSON.stringify({ message: userMessage, projectTitle: state.title, visualStyle: state.visualStyle, sourceText: state.sourceText.slice(0, 16000), history: messages.slice(-12).map(item => ({ role: item.role, content: item.content })), assets: state.assets, attachments: references.map(ref => ({ ...ref, kind: "image" })) }) });
      const payload = await response.json() as { success?: boolean; assistantText?: string; actions?: ArtAction[]; generation?: { prompt: string; assetId?: string; kind?: ArtAssetKind; name?: string }; error?: string; warning?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || "KK 暂时无法处理这条指令");
      if (scopeRef.current !== targetScope) return;
      const applied = applyArtChatActions(stateRef.current, payload.actions || [], references);
      let next = applied.state;
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: [payload.assistantText || "已整理修改。", ...applied.feedback].join("\n"), note: payload.warning }]);
      if (payload.generation?.prompt) {
        const compatibleModels = listCompatibleArtModels(models, references.length);
        const model = modelId ? compatibleModels.find(item => item.id === modelId) : undefined;
        if (!models.length) throw new Error("当前没有可用的图片服务，请配置服务后重试。");
        if (!compatibleModels.length) throw new Error("当前参考图数量没有适配的已配置模型，请减少参考图或切换模型。");
        if (modelId && !model) throw new Error("所选模型不支持当前任务，请切换模型。");
        const generationPrompt = buildArtGenerationPrompt(userMessage, payload.generation.prompt, references.length);
        let asset = next.assets.find(item => item.id === payload.generation?.assetId || item.id === applied.createdAssetId);
        if (!asset) {
          asset = createArtAsset(payload.generation.kind || selectedKind, { name: payload.generation.name || "聊天生成", description: userMessage, prompt: generationPrompt });
          next = { ...next, assets: [asset, ...next.assets] };
        }
        const variant = asset.variants?.[0];
        if (!variant) throw new Error("请先在资产编辑器创建母版。");
        const job: ArtChatJob = { id: crypto.randomUUID(), assetId: asset.id, variantId: variant.id, prompt: generationPrompt, status: "running", createdAt: new Date().toISOString() };
        setState(next);
        stateRef.current = next;
        localStorage.setItem(targetScope, JSON.stringify(next));
        setJobs(current => [...current, job]);
        // Persist the task pointer synchronously so a refresh can recover its result.
        localStorage.setItem(`${targetScope}__chat`, JSON.stringify({ messages: [...messages, { id: userMessageId, role: "user", content: userMessage }], jobs: [...jobs, job] }));
        setBusy("generate");
        // Save the result destination before spending image credits.
        cloudWrites.current = cloudWrites.current.catch(() => undefined).then(async () => {
          if (scopeRef.current !== targetScope) throw new Error("项目已切换，未调用图片模型。");
          const saved = await fetchWithAuthRetry("/api/art/draft", { method: "PUT", body: JSON.stringify({ ...scope, draft: { state: next, messages: [...messages, { id: userMessageId, role: "user", content: userMessage }], jobs: [...jobs, job] } }) });
          if (!saved.ok) throw new Error("生成前保存失败，尚未调用图片模型。请检查云端存储后重试。");
        });
        try { await cloudWrites.current; } catch (error) {
          if (scopeRef.current === targetScope) setJobs(current => current.map(item => item.id === job.id ? { ...item, status: "failed", error: "生成前保存失败，未调用图片模型" } : item));
          throw error;
        }
        if (scopeRef.current !== targetScope) return;
        const generated = await fetchWithAuthRetry("/api/art/generate-image", { method: "POST", body: JSON.stringify({ scope, jobId: job.id, assetId: asset.id, projectId: contextProjectId || standaloneDraftId, task: references.length ? "edit" : "concept", prompt: job.prompt, referencePaths: references.map(ref => ref.storagePath), referenceUrls: [], modelId: model?.id, selection: model?.provider || "smart", aspectRatio, count }) });
        const result = await generated.json() as { success?: boolean; status?: string; job?: { status?: string }; images?: ArtChatJob["images"]; error?: string };
        if (scopeRef.current !== targetScope) return;
        if (generated.status === 202 || result.status === "running") {
          setNotice("原任务仍在生成，完成后会自动恢复图片；请勿重复生成。");
          return;
        }
        if (!generated.ok || !result.success || !result.images?.length) {
          if (generated.status < 500 || result.status === "failed" || result.job?.status === "failed") setJobs(current => current.map(item => item.id === job.id ? { ...item, status: "failed", error: result.error || "没有返回图片" } : item));
          throw new Error(result.error || "图片尚未完成，请稍后查看任务状态。");
        }
        completeJob({ ...job, status: "completed", images: result.images });
      } else {
        setState(next);
      }
      setMessage("");
      setPendingImages([]);
    } catch (error) { if (scopeRef.current === targetScope) setNotice(error instanceof Error ? error.message : "操作失败，输入和参考图已保留。"); } finally { if (scopeRef.current === targetScope) setBusy(""); }
  }

  function completeJob(job: ArtChatJob) {
    if (!job.images?.length) return;
    setState(current => addGeneratedArtCandidates(current, { ...job, images: job.images! }));
    setJobs(current => current.map(item => item.id === job.id ? job : item));
    setMessages(current => current.some(item => item.id === `job-${job.id}`) ? current : [...current, { id: `job-${job.id}`, role: "assistant", content: "图片已生成并保存为候选。可下载原图，或作为参考继续修改。", images: job.images, assetId: job.assetId }]);
  }

  useEffect(() => {
    if (!ready || !session?.access_token || !jobs.some(job => job.status === "running")) return;
    let cancelled = false;
    const targetScope = storageKey;
    const poll = async () => {
      for (const pending of jobs.filter(job => job.status === "running")) {
        try {
          const response = await fetchWithAuthRetry(`/api/art/jobs/${pending.id}?${new URLSearchParams(scope as Record<string, string>)}`);
          const payload = await response.json();
          if (cancelled || scopeRef.current !== targetScope) return;
          if (payload.job?.status === "completed" && payload.job.images?.length) completeJob({ ...pending, ...payload.job });
          else if (payload.job?.status === "failed") setJobs(current => current.map(item => item.id === pending.id ? { ...item, status: "failed", error: payload.job.error } : item));
          else if (response.ok && !payload.job && Date.now() - Date.parse(pending.createdAt) > 330000) setJobs(current => current.map(item => item.id === pending.id ? { ...item, status: "failed", error: "任务未成功提交，请确认后手动重试" } : item));
        } catch { /* A lost connection is not evidence that a paid generation failed. */ }
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 4000);
    return () => { cancelled = true; clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, storageKey, jobs.map(job => `${job.id}:${job.status}`).join("|")]);

  function addAsset() {
    if (!ready || busy) return;
    const asset = createArtAsset(selectedKind);
    const nextState = { ...state, assets: [asset, ...state.assets], selectedAssetId: asset.id, updatedAt: new Date().toISOString() };
    // 点击卡片前先同步一次，避免详情页导航快于 React 自动保存而读不到新资产。
    if (isHydrated && canPersistArtDraft({ storageReady, storageKey, hydratedStorageKey })) {
      try { localStorage.setItem(storageKey, JSON.stringify(nextState)); setState(nextState); } catch { setNotice("未能保存新资产，请检查设备空间后重试。"); }
    }
  }

  function deleteAsset(assetId: string) {
    if (!window.confirm(isZh ? "确定删除这个资产吗？" : "Delete this asset?")) return;
    patchState({ assets: state.assets.filter((item) => item.id !== assetId), selectedAssetId: state.selectedAssetId === assetId ? "" : state.selectedAssetId });
  }

  return (
    <main className={`${styles.page} ${isEmbedded ? styles.embeddedPage : "art-workbench-shell"}`}>
      <header className={styles.header}>
        <div className={styles.brand}><span>KIIKIS</span><strong>{state.title}</strong><small>美术工作台</small></div>
        <div className={styles.headerActions}>
          {/* 关联已有项目下拉：无论嵌入/独立模式都显示，让用户能切换 art 上下文到其他已有项目 */}
          {isEmbedded ? null : <label className={styles.projectSelect}><Archive size={15} /><select value={state.projectId || ""} onChange={(event) => selectProject(event.target.value)}><option value="">{isZh ? "关联已有项目" : "Link project"}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><ChevronDown size={14} /></label>}
          {/* PRD §8.1：嵌入模式（制作工作台美术 Tab）隐藏独立项目创建/草稿切换/清空能力 */}
          {isEmbedded ? null : (
            <>
              <label className={styles.projectSelect}><Archive size={15} /><select value="" onChange={(event) => { const id = event.target.value; if (id) loadArchivedDraft(id); event.target.value = ""; }}><option value="">{isZh ? "我的草稿" : "My Drafts"} ({archiveIndex.length})</option>{archiveIndex.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.assetCount} 项 · {new Date(item.archivedAt).toLocaleDateString()}</option>)}</select><ChevronDown size={14} /></label>
              <button type="button" onClick={newProject}><Plus size={15} />{isZh ? "新建项目" : "New"}</button>
              <button type="button" onClick={clearCurrentDraft} title={isZh ? "清空当前草稿（自动归档后清空）" : "Clear current draft (auto-archives first)"}><Trash2 size={15} />{isZh ? "清空" : "Clear"}</button>
            </>
          )}
          {isEmbedded && contextProjectTitle ? <span className={styles.provider}>{contextProjectTitle}</span> : null}
          <button type="button" aria-expanded={!isRepositoryCollapsed} aria-controls="art-repository" onClick={() => setIsRepositoryCollapsed(value => !value)}>{isRepositoryCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}{isRepositoryCollapsed ? "展开美术仓库" : "收起美术仓库"}</button>
        </div>
      </header>

      {notice ? <button className={styles.notice} role="alert" type="button" onClick={() => setNotice("")}>{notice}</button> : null}

      <div className={`${styles.workspace} ${collapseStyles.workspace} ${isRepositoryCollapsed ? collapseStyles.repositoryCollapsed : ""}`}>
        <section ref={chatPanel} className={styles.chatPanel}>
          <div className={`${styles.chatHead} ${collapseStyles.chatHead}`}><div><MessageSquareText size={18} /><strong>KK 美术助理</strong></div><div className={collapseStyles.chatHeadActions}><button className={collapseStyles.manageSourcesButton} type="button" disabled={!ready || !!busy} onClick={() => sourceInput.current?.click()}><FilePlus2 size={15} />管理资料</button></div></div>
          <div className={`${styles.sourceChips} ${collapseStyles.sourceChips}`}>{state.sourceFiles.slice(0, 5).map((file) => <span key={file.id}>{file.name}</span>)}{state.projectTitle ? <span>Universe · {state.projectTitle}</span> : null}{state.sourceText.trim() ? <span title={state.sourceText.slice(0, 200)}>已同步资料 · {state.sourceText.length.toLocaleString()} 字</span> : null}{!state.sourceFiles.length && !state.projectTitle && !state.sourceText.trim() ? <small>还没有资料，上传剧本或关联项目即可开始</small> : null}</div>
          <div className={`${styles.messages} ${collapseStyles.messages}`} aria-live="polite">{!ready && <p className={styles.thinking}><LoaderCircle className={styles.spin} size={16} />正在载入当前美术项目…</p>}{messages.map((item) => <article key={item.id} className={item.role === "user" ? styles.userMessage : styles.assistantMessage}><p>{item.content}</p>{item.note ? <small>{item.note}</small> : null}{item.images?.length ? <ArtChatImages images={item.images} assetHref={item.assetId ? `/art-workbench/assets/${encodeURIComponent(item.assetId)}?${new URLSearchParams({ ...scope, ...(contextSourceUnitId ? { sourceUnitId: contextSourceUnitId } : {}) } as Record<string, string>)}` : undefined} onReference={ref => { if (!busy) setPendingImages(current => current.length >= 8 || current.some(item => item.storagePath === ref.storagePath) ? current : [...current, ref]); }} onError={setNotice} /> : null}</article>)}{busy === "chat" || busy === "generate" ? <div className={styles.thinking}><LoaderCircle className={styles.spin} size={16} />{busy === "generate" ? "正在生成图片候选…" : "KK 正在整理美术要求…"}</div> : null}{jobs.filter(job => job.status !== "completed").map(job => <p key={job.id} className={styles.thinking}>{job.status === "running" ? "图片任务进行中，刷新后可继续查看结果" : `图片生成失败：${job.error || "请修改要求后重试"}`}</p>)}</div>
          <ArtChatComposer message={message} onMessage={setMessage} onSend={() => void sendMessage()} references={pendingImages} onRemove={id => setPendingImages(current => current.filter(ref => ref.id !== id))} onSource={() => sourceInput.current?.click()} onImage={() => imageInput.current?.click()} busy={busy} ready={ready} models={models} modelId={modelId} onModel={setModelId} aspectRatio={aspectRatio} onAspectRatio={setAspectRatio} count={count} onCount={setCount} />
          <input ref={sourceInput} hidden multiple type="file" accept=".txt,.md,.json,.csv,.doc,.docx,.pdf,.html,.htm,.xlsx" onChange={uploadSource} />
          <input ref={imageInput} hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadImage} />
        </section>

        <section id="art-repository" className={styles.repository} hidden={isRepositoryCollapsed}>
          <div className={styles.repoHead}><div><strong>美术仓库</strong><span>{state.assets.length} 项资产</span></div><div className={styles.repoActions}><button type="button" className={styles.extractButton} onClick={extractAssets} disabled={busy === "extract" || !state.sourceText.trim()} title={!state.sourceText.trim() ? "请先关联项目或上传资料" : "AI 自动拆解角色、场景、道具"}>{busy === "extract" ? <LoaderCircle className={styles.spin} size={16} /> : <Sparkles size={16} />}{busy === "extract" ? "拆解中..." : "自动拆解"}</button><div className={styles.search}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索资产" /></div></div></div>
          <div className={styles.tabs}>{(["character", "scene", "prop"] as ArtAssetKind[]).map((kind) => <button key={kind} type="button" className={selectedKind === kind ? styles.activeTab : ""} onClick={() => setSelectedKind(kind)}>{kind === "character" ? "角色" : kind === "scene" ? "场景" : "道具"}<span>{counts[kind]}</span></button>)}<button className={styles.addButton} type="button" disabled={!ready || !!busy} onClick={addAsset}><Plus size={15} />新增</button></div>
          <div className={`${styles.assetGrid} ${collapseStyles.assetGrid}`}>{visibleAssets.map((asset) => <AssetCard key={asset.id} asset={asset} onDelete={deleteAsset} isZh={isZh} scopeProjectId={contextProjectId} scopeSourceUnitId={contextSourceUnitId} scopeWorkId={contextWorkId} standaloneDraftId={isEmbedded ? undefined : standaloneDraftId || undefined} />)}{!visibleAssets.length ? <div className={styles.empty}><Users size={34} /><strong>{ready ? "这里还没有资产" : "正在载入当前项目"}</strong><p>让 KK 根据参考图生图，或上传资料拆解资产。</p><button type="button" disabled={!ready || !!busy} onClick={addAsset}><Plus size={15} />手动新增</button></div> : null}</div>
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

function AssetCard({ asset, onDelete, isZh, scopeProjectId, scopeSourceUnitId, scopeWorkId, standaloneDraftId }: { asset: ArtAsset; onDelete?: (id: string) => void; isZh?: boolean; scopeProjectId?: string; scopeSourceUnitId?: string; scopeWorkId?: string; standaloneDraftId?: string }) {
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
    if (scopeProjectId && scopeWorkId) {
      const params = new URLSearchParams({ projectId: scopeProjectId, sourceUnitId: scopeSourceUnitId || "", workId: scopeWorkId });
      return `${path}?${params.toString()}`;
    }
    if (standaloneDraftId) {
      const params = new URLSearchParams({ draftId: standaloneDraftId });
      return `${path}?${params.toString()}`;
    }
    return path;
  }, [asset.id, scopeProjectId, scopeSourceUnitId, scopeWorkId, standaloneDraftId]);
  const cardContent = (
    <>
      <div className={styles.assetImage}>{image ? <img src={image} alt={asset.name} /> : <ImagePlus size={28} />}</div>
      <div className={styles.assetTitle}><strong>{asset.name}</strong><span className={asset.status === "ready" ? styles.ready : ""}>{asset.status === "ready" ? "已锁定" : asset.status === "generating" ? "生成中" : asset.status === "error" ? "失败" : "草稿"}</span></div>
      <p>{asset.role || asset.description || "尚未填写设计说明"}</p>
      <small>{asset.kind === "character" ? `${asset.variants?.length || 0} 个剧中造型` : `${asset.variants?.length || 0} 个状态变体`}</small>
    </>
  );
  return (
    <div className={styles.assetCardWrapper}>
      <Link className={styles.assetCard} href={assetDetailHref}>{cardContent}</Link>
      {onDelete ? <button type="button" className={styles.assetDeleteBtn} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(asset.id); }} title={isZh ? "删除" : "Delete"}>×</button> : null}
    </div>
  );
}

async function fetchArtDraftPreviewUrls(state: ArtWorkbenchState): Promise<Record<string, string> | null> {
  const paths = collectArtStoragePaths(state);
  if (!paths.length) return null;
  try {
    const response = await fetchWithAuthRetry("/api/art/sign-assets", {
      method: "POST",
      body: JSON.stringify({ paths }),
    });
    const payload = await response.json() as { success?: boolean; urls?: Record<string, string> };
    if (!response.ok || !payload.success || !payload.urls) return null;
    return payload.urls;
  } catch {
    return null;
  }
}
