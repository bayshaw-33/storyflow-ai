"use client";

/**
 * ProductionWorkbench — 分镜制作台主壳（四区页面重构版）。
 *
 * Task card: KIIKIS-P1-TRAE-002 §3 (任务 2/6)
 *
 * 4 个 tab（取代旧的 planning/canvas/editor/assembly/casting 5 mode）：
 *   1. script  — 剧本输入
 *   2. table   — 分镜表
 *   3. assets  — 美术物料
 *   4. frames  — 分镜图与即梦提示词
 *
 * BLOCKER 3 (已完成 commit 4b92347):
 *   - 必须从 /production?projectId=&sourceUnitId= 进入
 *   - 跨项目/跨集 handoff 拒绝
 *
 * BLOCKER 1/2 (Codex migration + RPC, commit ed893f9/21a1a43):
 *   - /api/storyboard/state GET/PUT 接入
 *   - 409 REVISION_CONFLICT 不覆盖本地，弹冲突提示
 *
 * BLOCKER 4/5 (TRAE 接入 Kimi 实现, 本会话):
 *   - /api/storyboard/analyze        — 分析剧本/单场重分析
 *   - /api/storyboard/prompts        — 生成 image/jimeng 提示词
 *   - /api/storyboard/assets/generate — 资产 4 候选
 *   - /api/storyboard/shots/:id/generate-image — 单 shot 分镜图
 */

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Session } from "@supabase/supabase-js";
import { AlertTriangle, ArrowLeft, Clock, Cpu, Save, Users, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
// P95 加载优化：重阶段组件按需加载（剪辑台/剧本 Studio 不再进首屏包）
const EditorFramework = dynamic(
  () => import("@/components/editor/EditorFramework").then((m) => m.EditorFramework),
  { ssr: false, loading: () => <div style={{ padding: 48, textAlign: "center", color: "var(--ink-muted)", fontSize: 13 }}>剪辑台加载中…</div> },
);

import type {
  AnalyzeRequest,
  AnalyzeResponse,
  PromptRequest,
  PromptResponse,
  SaveRequest,
  SaveResponse,
  StoryboardAssetUsage,
  StoryboardScene,
  StoryboardShot,
} from "@/lib/storyboard/contracts";
import {
  StoryboardClient,
  StoryboardClientError,
  StoryboardRevisionConflictError,
} from "@/lib/storyboard/client";
import { readCreativeHandoff } from "@/lib/creative-handoff";
import { readStoryboardDraft, writeStoryboardDraft, type StoryboardDraftScope } from "@/lib/storyboard/draft";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createProductionId } from "@/lib/production/state";
import { isScopeActionable, isCloudActionable } from "@/lib/production/scope";

import type { ProductionSourceFile } from "@/lib/production/types";
import { VersionHistory, type VersionRecord, type VersionDiffResult } from "./VersionHistory";
import { TeamPanel } from "./TeamPanel";
import { ModelRegistryPanel } from "./ModelRegistryPanel";
import {
  ScriptInputPanel,
  ShotFramesPanel,
  StoryboardTablePanel,
  type AssetCandidate,
  type AssetCandidateMap,
  type PromptResultMap,
  type ShotFrameMap,
} from "./StoryboardPanels";
import { type VideoJobMap, type VideoJobState, type BatchVideoProgress } from "./ShotVideoPanel";
import { StoryboardExportMenu } from "./StoryboardExportMenu";
import { ProductionEmptyState, type EntryMode } from "./ProductionEmptyState";
import ArtWorkbench from "@/components/art/ArtWorkbench";
import { canJumpToCreation, buildCreationJumpUrl } from "@/lib/workflow/can-jump";
import type { ProductionProjectState } from "@/lib/production/types";
const ScreenplayStudio = dynamic(
  () => import("@/components/v2/screenplay-studio/ScreenplayStudio").then((m) => m.ScreenplayStudio),
  { ssr: false, loading: () => <div style={{ padding: 48, textAlign: "center", color: "var(--ink-muted)", fontSize: 13 }}>剧本工作台加载中…</div> },
);
import { StoryboardFrameGrid, StoryboardPromptList, UnifiedStoryboardStage, type StoryboardSubview } from "./UnifiedStoryboardStage";
import { StoryboardCanvas } from "./StoryboardCanvas";
import type { StoryboardCanvasState } from "@/lib/production/types";
import {
  buildUnifiedWorkbenchUrl,
  parseUnifiedWorkbenchQuery,
  type UnifiedProductionStage,
  type UnifiedWorkbenchContextV1,
} from "@/lib/contracts/v2/unified-workbench";
import { WORK_CONTRACT_VERSION } from "@/lib/contracts/v2/work";
import { fetchUnifiedWorkbenchContext, ensureUnifiedStage } from "@/lib/client/v2/unified-workbench/api";
import { bindWorkToUniverse } from "@/lib/client/v2/universe/api";
import type { BindWorkToUniverseInput } from "@/lib/client/v2/universe/types";
import { UniverseBindingDialog } from "@/components/v2/workbench-shell/UniverseBindingDialog";
import { UnifiedProductionHeader } from "./UnifiedProductionHeader";
import styles from "./ProductionWorkbench.module.css";

type StoryboardAssets = {
  characters: StoryboardAssetUsage[];
  locations: StoryboardAssetUsage[];
  props: StoryboardAssetUsage[];
};

const EMPTY_ASSETS: StoryboardAssets = { characters: [], locations: [], props: [] };

export function ProductionWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- 顶层状态 ---
  const [activeStage, setActiveStage] = useState<UnifiedProductionStage>("script");
  const [storyboardSubview, setStoryboardSubview] = useState<StoryboardSubview>("shot_table");
  // 分镜画布：自由排布状态，随分镜草稿管线持久化
  const [canvas, setCanvas] = useState<StoryboardCanvasState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [workId, setWorkId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string>("");
  const sourceUnitId = unitId;
  const [handoffId, setHandoffId] = useState<string>("");
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [manuscript, setManuscript] = useState<string>("");
  const [sourceFiles, setSourceFiles] = useState<ProductionSourceFile[]>([]);
  const [isEmptyState, setIsEmptyState] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>("planning");
  // PRD §6.2 hydration 状态机：resolving_scope → loading_local → loading_cloud_if_archived → ready → autosave_enabled
  // ready 之前禁止把空初始 state 写入 localStorage 或云端
  const [hydrationPhase, setHydrationPhase] = useState<
    "resolving_scope" | "loading_local" | "loading_cloud_if_archived" | "ready"
  >("resolving_scope");
  const [draftPersistError, setDraftPersistError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  // PRD V1.0 验收 P0-05：制作台门禁 — 服务端 fail-closed 校验
  // P0-02：入口校验结果仅作非阻塞提示（productionGateError 为空串表示无提示）
  const [productionGateError, setProductionGateError] = useState<string>("");
  const [gateWarningDismissed, setGateWarningDismissed] = useState<boolean>(false);
  const [context, setContext] = useState<UnifiedWorkbenchContextV1 | null>(null);
  const [contextLoading, setContextLoading] = useState<boolean>(false);
  const [contextError, setContextError] = useState<string>("");
  const [unsaved, setUnsaved] = useState<boolean>(false);
  const [pendingStage, setPendingStage] = useState<UnifiedProductionStage | null>(null);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState<boolean>(false);

  // --- Storyboard 状态（contracts.ts）---
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [assets, setAssets] = useState<StoryboardAssets>(EMPTY_ASSETS);
  const [revision, setRevision] = useState<number>(0);
  const [deletedSceneIds, setDeletedSceneIds] = useState<string[]>([]);
  const [deletedShotIds, setDeletedShotIds] = useState<string[]>([]);

  // --- 异步操作状态 ---
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzingSceneId, setAnalyzingSceneId] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const [generatingAssetId, setGeneratingAssetId] = useState<string | null>(null);
  const [generatingShotId, setGeneratingShotId] = useState<string | null>(null);
  const [generatingPromptsForShots, setGeneratingPromptsForShots] = useState<string[] | null>(null);
  const [candidates, setCandidates] = useState<AssetCandidateMap>({});
  const [frames, setFrames] = useState<ShotFrameMap>({});
  const [prompts, setPrompts] = useState<PromptResultMap>({});

  // --- 视频区状态（任务 1）---
  const [videoJobs, setVideoJobs] = useState<VideoJobMap>({});
  const [submittingVideoShotId, setSubmittingVideoShotId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchVideoProgress | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  // ref 镜像 videoJobs，避免 batchSubmitVideos 循环中 stale closure（Codex MUST FIX）
  const videoJobsRef = useRef<VideoJobMap>(videoJobs);
  useEffect(() => {
    videoJobsRef.current = videoJobs;
  }, [videoJobs]);

  // --- 弹窗 ---
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showTeamPanel, setShowTeamPanel] = useState(false);
  const [showModelRegistry, setShowModelRegistry] = useState(false);
  const [showSecondaryMenu, setShowSecondaryMenu] = useState(false);
  const [bindingDialogOpen, setBindingDialogOpen] = useState(false);
  // 任务 1.4「先创作后归档」：draft 草稿保存时弹归档弹窗
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTitle, setArchiveTitle] = useState("");
  const [archiveWorkflowType, setArchiveWorkflowType] = useState<"creation" | "continuation">("creation");
  // PRD §8.2：归档弹窗支持 4 种绑定模式（existing/create/none × existing/create）
  const [archiveUniverseMode, setArchiveUniverseMode] = useState<"existing" | "create" | "none">("none");
  const [archiveUniverseId, setArchiveUniverseId] = useState<string>("");
  const [archiveUniverseName, setArchiveUniverseName] = useState<string>("");
  const [archiveProjectMode, setArchiveProjectMode] = useState<"existing" | "create">("create");
  const [archiveExistingProjectId, setArchiveExistingProjectId] = useState<string>("");
  const [archiveEpisodeLabel, setArchiveEpisodeLabel] = useState<string>("Episode 1");
  const [archiving, setArchiving] = useState(false);
  const [versionList, setVersionList] = useState<VersionRecord[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionDiff, setVersionDiff] = useState<VersionDiffResult | null>(null);

  const storyboardClient = useMemo(
    () => StoryboardClient.fromSupabase(supabaseClient),
    [supabaseClient],
  );

  // 任务 3：关联跳转 — 制作工作台 → 创作工作台（无关联时隐藏或禁用并说明）
  const backToCreation = useMemo(() => {
    if (!projectId) return { visible: false, ok: false, reason: undefined as string | undefined };
    const isDraft = projectId.startsWith("draft-");
    if (isDraft) return { visible: false, ok: false, reason: undefined as string | undefined };
    const result = canJumpToCreation({ projectId, sourceUnitId, isDraft: false });
    return { visible: true, ok: result.ok, reason: result.reason };
  }, [projectId, sourceUnitId]);

  // --- URL 参数 + scope 校验 + handoff/draft 加载 ---
  useEffect(() => {
    const query = parseUnifiedWorkbenchQuery(searchParams);
    const setup = searchParams.get("setup");
    const mode = searchParams.get("mode") || query.tab;

    if (!query.projectId || (!query.unitId && setup === "1")) {
      // 任务 1.4「先创作后归档」：带 setup=1（从需求墙来）时自动开未命名草稿，立即可用
      if (setup === "1") {
        // PRD §6.1: 用 crypto.randomUUID() 生成稳定 draft ID，立即 router.replace 写回 URL
        // 保留 mode 和已有 universeId，删除 setup=1 避免 effect 再次初始化
        const uuid = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const draftId = `draft-production-${uuid}`;
        const draftUnitId = `draft-unit-${uuid}`;
        const universeId = searchParams.get("universeId") || "";
        const draftUrl = buildUnifiedWorkbenchUrl({
          projectId: draftId,
          tab: query.tab,
          unitId: draftUnitId,
        });
        router.replace(universeId ? `${draftUrl}&universeId=${encodeURIComponent(universeId)}` : draftUrl, { scroll: false });
        setProjectId(draftId);
        setWorkId(null);
        setUnitId(draftUnitId);
        setIsEmptyState(false);
        setProjectTitle("未命名草稿");
        setActiveStage(query.tab);
        setStoryboardSubview("shot_table");
        setEntryMode(mode as EntryMode);
        setContext(null);
        setHydrationPhase("loading_local");
        return;
      }
      // 无 setup：显示需求墙（任务 1.3）
      setEntryMode(mode as EntryMode);
      setIsEmptyState(true);
      return;
    }
    setIsEmptyState(false);
    setProjectId(query.projectId);
    setWorkId(query.workId);
    setUnitId(query.unitId || "");
    setActiveStage(query.tab);
    const requestedStoryboardSubview = searchParams.get("storyboardView") || searchParams.get("view");
    if (requestedStoryboardSubview === "grid") setStoryboardSubview("grids");
    else if (requestedStoryboardSubview === "dynamic" || requestedStoryboardSubview === "motion") setStoryboardSubview("motion");
    else if (requestedStoryboardSubview === "prompts" || requestedStoryboardSubview === "video_prompt") setStoryboardSubview("prompts");
    else if (requestedStoryboardSubview === "shot_table" || requestedStoryboardSubview === "shots") setStoryboardSubview("shot_table");
    else if (requestedStoryboardSubview === "canvas" || requestedStoryboardSubview === "board") setStoryboardSubview("canvas");
    setHandoffId(searchParams.get("handoffId") || "");
    setHydrationPhase("loading_local");

    // 优先 handoff
    const handoff = readCreativeHandoff(query.projectId, query.unitId || "");
    if (handoff) {
      setProjectTitle(handoff.title);
      setManuscript(handoff.manuscript);
      setHydrationPhase("ready");
      return;
    }

    // 尝试本地草稿
    const draftScope: StoryboardDraftScope = {
      userId: session?.user?.id || null,
      projectId: query.projectId,
      workId: query.workId,
      unitId: query.unitId || "",
    };
    const draft = readStoryboardDraft(draftScope);
    if (draft) {
      setProjectTitle(draft.title || "");
      setManuscript(draft.sourceSummary || "");
      setSourceFiles(draft.sourceFiles || []);
      // 草稿中的 storyboard 字段（如果之前保存过）
      const draftScenes = (draft as ProductionProjectState & { storyboardScenes?: StoryboardScene[] }).storyboardScenes;
      const draftCanvas = (draft as ProductionProjectState & { storyboardCanvas?: StoryboardCanvasState | null }).storyboardCanvas ?? null;
      setCanvas(draftCanvas);
      if (Array.isArray(draftScenes)) setScenes(draftScenes);
      const draftAssets = (draft as ProductionProjectState & { storyboardAssets?: StoryboardAssets }).storyboardAssets;
      if (draftAssets) setAssets(draftAssets);
      const draftRevision = (draft as ProductionProjectState & { storyboardRevision?: number }).storyboardRevision;
      if (typeof draftRevision === "number") setRevision(draftRevision);
    }
    // 草稿加载完成，标记 ready（云端加载由 loadFromServer 异步进行，不阻塞 ready）
    setHydrationPhase("ready");
  }, [session?.user?.id, searchParams, router]);

  async function reloadContext() {
    if (!projectId || projectId.startsWith("draft-")) return;
    setContextLoading(true);
    setContextError("");
    try {
      const nextContext = await fetchUnifiedWorkbenchContext(projectId);
      setContext(nextContext);
      setProjectTitle((current) => current || nextContext.project.title);
    } catch (error) {
      setContextError(error instanceof Error ? error.message : "统一工作台上下文暂时不可用。");
    } finally {
      setContextLoading(false);
    }
  }

  async function handleBindUniverse(input: BindWorkToUniverseInput) {
    if (!workId) throw new Error("缺少 Work 身份，无法绑定 Universe。");
    await bindWorkToUniverse(workId, input);
    await reloadContext();
    setNotice("Universe 已绑定到当前作品。");
  }

  // 正式项目先读取只读上下文；缺失阶段只展示空状态，不在这里创建 Work。
  useEffect(() => {
    if (!projectId || projectId.startsWith("draft-")) {
      setContext(null);
      setContextLoading(false);
      return;
    }
    void reloadContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, session?.access_token]);

  // --- Supabase session ---
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setSupabaseClient(client);
    let active = true;
    void (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!active) return;
        setSession(data.session);
        // 登录后尝试从云端加载最新 storyboard state
        if (data.session && projectId && sourceUnitId) {
          void loadFromServer();
        }
      } catch {
        // ignore
      }
    })();
    const { data: sub } = client.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sourceUnitId]);

  // --- 自动 notice 消失 ---
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5_000);
    return () => clearTimeout(timer);
  }, [notice]);

  // PRD §6.2: localStorage 写入失败持续显示，不自动消失
  useEffect(() => {
    if (!draftPersistError) return;
    setNotice(draftPersistError);
  }, [draftPersistError]);

  // P0-02（PRD §2.2/§4）：入口校验降级为非阻塞上下文提示 ——
  // 未定稿/非剧本集只提醒下游可能需要重生成，不再整页阻断工作台；
  // 校验失败（网络/认证）同样不拦截进入。fetch 带认证（共享 401 刷新重试），
  // 旧实现无 Authorization 头，verify-entry 恒 401 → 伪"该集未定稿"阻断。
  useEffect(() => {
    if (!projectId || !sourceUnitId || projectId.startsWith("draft-")) {
      setProductionGateError("");
      return;
    }
    let cancelled = false;
    setProductionGateError("");
    (async () => {
      try {
        const res = await fetchWithAuthRetry("/api/production/verify-entry", {
          method: "POST",
          body: JSON.stringify({ projectId, sourceUnitId }),
        });
        const data = await res.json() as { ok?: boolean; reason?: string; projectTitle?: string };
        if (cancelled) return;
        if (data.ok === false) {
          setProductionGateError(data.reason || "该集尚未定稿；可继续制作，定稿后下游内容可能需要重新生成。");
        } else {
          setProductionGateError("");
          if (data.projectTitle && !projectTitle) setProjectTitle(data.projectTitle);
        }
      } catch {
        if (!cancelled) {
          setProductionGateError("制作入口校验暂时不可用；可继续制作，不影响保存。");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, sourceUnitId, projectTitle]);

  // --- 自动写本地草稿（每次 scenes/assets/revision 变更）---
  // PRD §6.2: hydration gate —— ready 之前禁止把空初始 state 写入 localStorage
  useEffect(() => {
    if (!projectId || !sourceUnitId) return;
    if (hydrationPhase !== "ready") return;
    const scope: StoryboardDraftScope = {
      userId: session?.user?.id || null,
      projectId,
      workId,
      unitId: sourceUnitId,
    };
    const draftPayload = {
      id: projectId,
      projectId,
      title: projectTitle,
      workflowType: "storyboard" as const,
      contentType: "short_drama" as const,
      aspectRatio: "9:16" as const,
      language: "zh" as const,
      sourceFiles,
      sourceSummary: manuscript,
      storyBrief: { logline: "", targetPlatform: "", targetAudience: "", storySummary: "", notes: "" },
      visualBible: { visualStyle: "", colorPalette: "", cameraRules: "", characterRules: "", sceneRules: "", negativePrompt: "" },
      shots: [],
      mode: "planning" as const,
      providers: { imageProvider: "minimax" as const, videoProvider: "minimax" as const },
      chatMessages: [],
      history: [],
      casting: {},
      updatedAt: new Date().toISOString(),
      storyboardScenes: scenes,
      storyboardAssets: assets,
      storyboardRevision: revision,
      storyboardCanvas: canvas,
    } as unknown as ProductionProjectState;
    try {
      writeStoryboardDraft(scope, draftPayload);
      if (draftPersistError) setDraftPersistError("");
    } catch (error) {
      // PRD §6.2: localStorage 写入失败必须在现有通知区域显示错误，不得空 catch
      const message = error instanceof Error ? error.message : "本地草稿保存失败";
      setDraftPersistError(message);
    }
  }, [scenes, assets, revision, canvas, projectId, workId, sourceUnitId, session, projectTitle, sourceFiles, manuscript, hydrationPhase, draftPersistError]);

  // -------------------------------------------------------------------
  // 服务端加载/保存
  // -------------------------------------------------------------------

  async function loadFromServer() {
    if (!projectId || !sourceUnitId) return;
    try {
      const state = await storyboardClient.loadState(projectId, sourceUnitId);
      if (state) {
        setScenes(state.scenes);
        setRevision(state.revision);
        setDeletedSceneIds([]);
        setDeletedShotIds([]);
        // 服务端目前不返回 assets 列表，保留客户端现有
      }
    } catch {
      // 静默：未登录或未保存时直接保留本地草稿
    }
    // 刷新恢复视频 job 状态（Codex MUST FIX: listVideoJobs 未被调用）
    try {
      const resp = await storyboardClient.listVideoJobs({ projectId, sourceUnitId });
      const map: VideoJobMap = {};
      for (const job of resp.jobs) {
        if (!job.target_id) continue;
        map[job.target_id] = {
          jobId: job.id,
          status: job.status as VideoJobState["status"],
          startedAt: new Date(job.created_at).getTime(),
          finishedAt: job.status === "completed" || job.status === "failed" ? Date.now() : null,
          videoUrl: job.result_url,
          error: job.error,
          costEstimate: null,
          durationSeconds: null,
          providerTaskId: null,
          aspectRatio: "16:9",
        };
      }
      setVideoJobs(map);
    } catch {
      // 静默：未登录或无 job 时忽略
    }
  }

  async function saveToServer() {
    // 任务 1.4：draft 草稿先归档为真实项目再保存
    if (projectId.startsWith("draft-")) {
      setArchiveTitle(projectTitle || "未命名草稿");
      setArchiveOpen(true);
      return;
    }
    if (!session) {
      setNotice("已保存到本地草稿（未登录，未同步云端）。");
      return;
    }
    if (!projectId || !sourceUnitId) {
      setNotice("缺少 projectId 或 sourceUnitId，无法保存到云端。");
      return;
    }
    setSaving(true);
    setConflictRevision(null);
    const request: SaveRequest = {
      projectId,
      sourceUnitId,
      expectedRevision: revision,
      scenes,
      deletedSceneIds,
      deletedShotIds,
      projectMetadata: { title: projectTitle, manuscript, sourceFiles },
    };
    try {
      const response: SaveResponse = await storyboardClient.saveState(request);
      // 应用服务端返回的稳定 ID 映射
      applyServerResponse(response);
      setNotice(response.projectMetadataSynced === false
        ? `分镜已同步（revision ${response.revision}），但剧本元数据同步失败，请重试保存。`
        : `已同步到云端（revision ${response.revision}）。`);
    } catch (err) {
      if (err instanceof StoryboardRevisionConflictError) {
        setConflictRevision(err.currentRevision);
        setNotice(`保存被拒绝：服务器 revision ${err.currentRevision}，本地 ${revision}。请刷新后重试。`);
      } else {
        const message = err instanceof Error ? err.message : "云端同步失败。";
        setNotice(`云端同步失败：${message}`);
      }
    } finally {
      setSaving(false);
    }
  }

  /**
   * PRD §8.2 TRAE-PW-P0-004：归档 draft 草稿为正式项目。
   *
   * 改为调用 POST /api/production/archive，支持 4 种绑定模式：
   *   A. 绑定已有 Universe + 已有 Project + 当前 Episode
   *   B. 绑定已有 Universe + 创建新 Project + 创建 Episode 1
   *   C. 创建新 Universe + 创建新 Project + 创建 Episode 1
   *   D. 暂不归属 Universe + 创建新 Project + 创建 Episode 1
   *
   * 服务端保证：project → link FK 顺序、link 失败不吞错、复用不重复。
   * 归档成功后客户端用返回的 projectId + sourceUnitId 原地 replace URL，再保存 storyboard state。
   */
  async function archiveDraft() {
    const title = archiveTitle.trim() || "未命名项目";
    // PRD §8.2：universeMode=existing 必须有 universeId；projectMode=existing 必须有 existingProjectId
    if (archiveUniverseMode === "existing" && !archiveUniverseId.trim()) {
      setNotice("请选择要绑定的 Universe，或改为新建 / 暂不归属。");
      return;
    }
    if (archiveProjectMode === "existing" && !archiveExistingProjectId.trim()) {
      setNotice("请选择要绑定的已有项目，或改为新建项目。");
      return;
    }
    setArchiving(true);
    try {
      // 调用归档 API（服务端处理 project/universe/link 写入 + 复用校验）
      const archiveResp = await fetch("/api/production/archive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          title,
          workflowType: archiveWorkflowType,
          universeMode: archiveUniverseMode,
          universeId: archiveUniverseId.trim() || undefined,
          universeName: archiveUniverseName.trim() || undefined,
          projectMode: archiveProjectMode,
          existingProjectId: archiveExistingProjectId.trim() || undefined,
          episodeLabel: archiveEpisodeLabel.trim() || "Episode 1",
        }),
      });
      if (!archiveResp.ok) {
        const errBody = await archiveResp.json().catch(() => ({}));
        const msg = (errBody && typeof errBody === "object" && "error" in errBody && typeof errBody.error === "string")
          ? errBody.error
          : `归档失败（HTTP ${archiveResp.status}）`;
        setNotice(msg);
        return;
      }
      const data = (await archiveResp.json()) as {
        projectId: string;
        sourceUnitId: string;
        universeId: string | null;
        linkId: string | null;
        episodeLabel: string;
        reused: { project: boolean; link: boolean };
      };
      const newProjectId = data.projectId;
      const newUnitId = data.sourceUnitId;
      setProjectId(newProjectId);
      setUnitId(newUnitId);
      setProjectTitle(title);
      // 更新 URL（原地 replace 为正式 projectId + sourceUnitId）
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.set("projectId", newProjectId);
        url.searchParams.set("sourceUnitId", newUnitId);
        url.searchParams.delete("setup");
        window.history.replaceState({}, "", url.toString());
      }
      setArchiveOpen(false);
      const reusedHint = data.reused.project ? "（复用已有项目）" : "";
      setNotice(`已归档为项目「${title}」${reusedHint}，正在同步云端…`);
      // 归档后立即保存 storyboard state 到云端（用真实 ID）
      setSaving(true);
      try {
        const request: SaveRequest = {
          projectId: newProjectId,
          sourceUnitId: newUnitId,
          expectedRevision: revision,
          scenes,
          deletedSceneIds,
          deletedShotIds,
          projectMetadata: { title, manuscript, sourceFiles },
        };
        const response: SaveResponse = await storyboardClient.saveState(request);
        applyServerResponse(response);
        setNotice(response.projectMetadataSynced === false
          ? `已归档并保存分镜（revision ${response.revision}），但剧本元数据同步失败，请重试保存。`
          : `已归档并同步云端（revision ${response.revision}）。`);
      } catch (err) {
        if (err instanceof StoryboardRevisionConflictError) {
          setConflictRevision(err.currentRevision);
          setNotice(`归档成功但同步被拒：服务器 revision ${err.currentRevision}。请重试。`);
        } else {
          const message = err instanceof Error ? err.message : "云端同步失败。";
          setNotice(`已归档到本地，云端同步失败：${message}`);
        }
      } finally {
        setSaving(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "归档失败。";
      setNotice(`归档失败：${message}`);
    } finally {
      setArchiving(false);
    }
  }

  /**
   * 409 出口 2：基于当前内容另存快照。
   *
   * P3 BLOCKER v2 契约（用户明确要求）：
   *   - 把本地未提交内容（scenes + 删除清单）原样写入 storyflow_versions.snapshot_json，
   *     作为不可变独立版本保留，绝不触碰当前工作态（不调 save_storyboard_state RPC）。
   *   - expectedRevision 传本地基线 revision（用户基于此 revision 做的修改），不是
   *     conflictRevision——快照记录的是"本地内容副本"，与 current state 完全隔离。
   *   - 不产生 CAS 绕过：createStoryboardSnapshot 不查 current state、不做 CAS 校验。
   *   - 快照完成后 loadFromServer() 拉服务端最新到本地继续工作；本地未提交修改已存为
   *     快照，未来可从版本历史恢复。
   */
  async function saveAsSnapshot() {
    if (!session) {
      setNotice("未登录，无法另存快照。");
      return;
    }
    if (!projectId || !sourceUnitId) {
      setNotice("缺少 projectId 或 sourceUnitId，无法另存快照。");
      return;
    }
    if (conflictRevision === null) {
      setNotice("无冲突 revision，无法另存快照。");
      return;
    }
    setSaving(true);
    try {
      const snapshot = await storyboardClient.createSnapshot({
        projectId,
        sourceUnitId,
        expectedRevision: revision,
        reason: "manual",
        scenes,
        deletedSceneIds,
        deletedShotIds,
      });
      setConflictRevision(null);
      await loadFromServer();
      setNotice(`已为本地当前内容创建快照（snapshotId ${snapshot.snapshotId.slice(0, 8)}，基线 revision ${snapshot.revision}），并加载服务端最新版本。本地未提交修改已存为快照，可从版本历史恢复。`);
    } catch (err) {
      // createStoryboardSnapshot 不做 CAS、不查 current state，理论上不会抛 RevisionConflictError；
      // 保留 catch 仅作防御——若未来加回 CAS 校验可复用。
      if (err instanceof StoryboardRevisionConflictError) {
        setConflictRevision(err.currentRevision);
        setNotice(`快照失败：服务端 revision 又被更新为 ${err.currentRevision}。请重新选择出口。`);
      } else {
        const message = err instanceof Error ? err.message : "另存快照失败。";
        setNotice(`另存快照失败：${message}`);
      }
    } finally {
      setSaving(false);
    }
  }

  /** 409 出口 1：加载最新版本（丢弃本地未提交修改）。 */
  async function loadLatestAndClearConflict() {
    setConflictRevision(null);
    await loadFromServer();
    setNotice("已加载服务端最新版本，本地冲突已清除。");
  }

  function applyServerResponse(response: SaveResponse) {
    setScenes((current) => {
      const next = current.map((scene) => {
        const sceneId = scene.id ?? scene.clientId ?? "";
        const mapped = response.idMap[sceneId];
        if (mapped) {
          return {
            ...scene,
            id: mapped,
            idSource: "server" as const,
            clientId: scene.clientId,
            shots: scene.shots.map((shot) => {
              const shotId = shot.id ?? shot.clientId ?? "";
              const shotMapped = response.idMap[shotId];
              return shotMapped
                ? { ...shot, id: shotMapped, idSource: "server" as const, clientId: shot.clientId, sceneId: mapped }
                : { ...shot, sceneId: mapped };
            }),
          };
        }
        return scene;
      });
      return next;
    });
    setRevision(response.revision);
    setDeletedSceneIds([]);
    setDeletedShotIds([]);
  }

  // -------------------------------------------------------------------
  // 剧本分析（任务 7）
  // -------------------------------------------------------------------

  async function analyzeScript(mode: "full" | "scene" = "full", sceneId: string | null = null) {
    if (!projectId || !sourceUnitId) {
      setAnalyzeError("缺少 projectId 或 sourceUnitId。");
      return;
    }
    if (mode === "full") setAnalyzing(true);
    else setAnalyzingSceneId(sceneId);
    setAnalyzeError("");

    const idempotencyKey = `${mode}-${projectId}-${sourceUnitId}-${Date.now()}`;
    const request: AnalyzeRequest = {
      projectId,
      sourceUnitId,
      source: manuscript,
      aspectRatio: "9:16",
      targetDurationSeconds: 90,
      visualStyle: "cinematic vertical short drama",
      outputLanguage: "zh-CN",
      mode,
      sceneId,
      expectedRevision: revision,
      idempotencyKey,
    };
    try {
      const response: AnalyzeResponse = await storyboardClient.analyze(request);
      if (mode === "scene" && sceneId) {
        // 单场重分析：替换该场景，保留 locked shots
        setScenes((current) => {
          const idx = current.findIndex((s) => (s.id ?? s.clientId) === sceneId);
          if (idx < 0 || response.scenes.length === 0) return current;
          const original = current[idx];
          const incoming = response.scenes[0];
          // 合并：保留原场景的 locked shots，新增 incoming 中未匹配的 shots
          const lockedShots = original.shots.filter((s) => s.locked);
          const mergedShots = [...lockedShots, ...incoming.shots.map((s, i) => ({ ...s, order: lockedShots.length + i + 1 }))];
          const next = [...current];
          next[idx] = { ...incoming, id: original.id, idSource: original.idSource, clientId: original.clientId, locked: original.locked, confirmed: original.confirmed, shots: mergedShots } as StoryboardScene;
          return next;
        });
        setNotice(`已完成场景 ${sceneId} 的重分析（已保留 ${scenes.find((s) => (s.id ?? s.clientId) === sceneId)?.shots.filter((s) => s.locked).length ?? 0} 个锁定分镜）。`);
      } else {
        // 全量分析：直接替换
        setScenes(response.scenes);
        setAssets(response.assets);
        setRevision(response.revision);
        setDeletedSceneIds([]);
        setDeletedShotIds([]);
        setNotice(`已分析剧本：${response.scenes.length} 场 · ${response.scenes.reduce((n, s) => n + s.shots.length, 0)} 个分镜。`);
        setActiveStage("storyboard");
        setStoryboardSubview("shot_table");
      }
    } catch (err) {
      // BLOCKER 4 contract: 不清场，保留现有 scenes
      if (err instanceof StoryboardRevisionConflictError) {
        setConflictRevision(err.currentRevision);
        setAnalyzeError(`REVISION_CONFLICT：服务器 revision ${err.currentRevision}，本地 ${revision}。请刷新后重试。`);
      } else if (err instanceof StoryboardClientError) {
        setAnalyzeError(`${err.code}: ${err.message}`);
      } else {
        setAnalyzeError(err instanceof Error ? err.message : "分析失败，请稍后重试。");
      }
    } finally {
      setAnalyzing(false);
      setAnalyzingSceneId(null);
    }
  }

  // -------------------------------------------------------------------
  // 提示词生成
  // -------------------------------------------------------------------

  async function generatePromptsForShots(shotIds: string[]) {
    if (!projectId || !sourceUnitId || shotIds.length === 0) return;
    setGeneratingPromptsForShots(shotIds);
    const request: PromptRequest = {
      projectId,
      sourceUnitId,
      analysisVersion: 1,
      shotIds,
      language: "zh",
      expectedRevision: revision,
      idempotencyKey: `prompts-${projectId}-${sourceUnitId}-${Date.now()}`,
    };
    try {
      const response: PromptResponse = await storyboardClient.generatePrompts(request);
      setPrompts((current) => {
        const next = { ...current };
        for (const result of response.prompts) {
          next[result.shotId] = {
            imagePrompt: result.imagePrompt,
            jimengVideoPrompt: result.jimengVideoPrompt,
            negativePrompt: result.negativePrompt,
            referenceVersionIds: result.referenceVersionIds,
            inputHash: result.inputHash,
          };
        }
        return next;
      });
      // 同步 prompts 回 scenes（让保存时 imagePrompt/jimengPromptZh 也持久化）
      setScenes((current) => current.map((scene) => ({
        ...scene,
        shots: scene.shots.map((shot) => {
          const id = shot.id ?? shot.clientId ?? "";
          const p = response.prompts.find((r) => r.shotId === id);
          return p ? { ...shot, imagePrompt: p.imagePrompt, jimengPromptZh: p.jimengVideoPrompt } : shot;
        }),
      })));
      setNotice(`已生成 ${response.prompts.length} 组提示词。`);
    } catch (err) {
      if (err instanceof StoryboardRevisionConflictError) {
        setConflictRevision(err.currentRevision);
        setNotice(`提示词生成被拒绝：服务器 revision ${err.currentRevision}。请刷新后重试。`);
      } else {
        setNotice(`提示词生成失败：${err instanceof Error ? err.message : "未知错误"}`);
      }
    } finally {
      setGeneratingPromptsForShots(null);
    }
  }

  // -------------------------------------------------------------------
  // 资产候选生成
  // -------------------------------------------------------------------

  async function generateAssetCandidates(assetId: string) {
    if (!projectId || !sourceUnitId) return;
    setGeneratingAssetId(assetId);
    try {
      const response = await storyboardClient.generateAssetCandidates({
        projectId,
        sourceUnitId,
        assetId,
        count: 4,
        idempotencyKey: `asset-${assetId}-${Date.now()}`,
        referenceVersionIds: [],
        expectedRevision: revision,
      });
      setCandidates((current) => ({ ...current, [assetId]: response.candidates }));
      setNotice(`已为资产生成 ${response.candidates.length} 张候选图。`);
    } catch (err) {
      if (err instanceof StoryboardRevisionConflictError) {
        setConflictRevision(err.currentRevision);
      } else {
        setNotice(`候选图生成失败：${err instanceof Error ? err.message : "未知错误"}`);
      }
    } finally {
      setGeneratingAssetId(null);
    }
  }

  function selectMainVersion(assetId: string, candidateImageUrl: string) {
    setAssets((current) => {
      const update = (list: StoryboardAssetUsage[]) => list.map((a) => a.assetId === assetId ? { ...a, selectedVersionId: candidateImageUrl } : a);
      return {
        characters: update(current.characters),
        locations: update(current.locations),
        props: update(current.props),
      };
    });
    setNotice(`已将 ${assetId} 的主参考版本切换为 ${candidateImageUrl.slice(0, 60)}...`);
  }

  function uploadAssetReplacement(assetId: string, file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setCandidates((current) => {
        const existing = current[assetId] ?? [];
        const newCandidate: AssetCandidate = {
          imageUrl: dataUrl,
          provider: "upload",
          model: file.name,
          inputHash: `upload-${Date.now()}`,
        };
        return { ...current, [assetId]: [newCandidate, ...existing] };
      });
      setNotice(`已上传 ${file.name} 作为 ${assetId} 的候选图。`);
    };
    reader.readAsDataURL(file);
  }

  // -------------------------------------------------------------------
  // Shot 分镜图生成
  // -------------------------------------------------------------------

  async function generateShotFrame(shotId: string) {
    if (!projectId || !sourceUnitId) return;
    setGeneratingShotId(shotId);
    try {
      const response = await storyboardClient.generateShotImage(shotId, {
        projectId,
        sourceUnitId,
        idempotencyKey: `frame-${shotId}-${Date.now()}`,
        referenceVersionIds: [],
        expectedRevision: revision,
      });
      setFrames((current) => ({
        ...current,
        [shotId]: { imageUrl: response.imageUrl, provider: response.provider, model: response.model, inputHash: response.inputHash },
      }));
      // 同步到 scenes 的 storyboardImageVersionId（便于持久化）
      setScenes((current) => current.map((scene) => ({
        ...scene,
        shots: scene.shots.map((shot) => {
          const id = shot.id ?? shot.clientId ?? "";
          return id === shotId ? { ...shot, storyboardImageVersionId: response.imageUrl } : shot;
        }),
      })));
      setNotice(`分镜 ${shotId} 已生成。`);
    } catch (err) {
      if (err instanceof StoryboardRevisionConflictError) {
        setConflictRevision(err.currentRevision);
      } else {
        setNotice(`分镜图生成失败：${err instanceof Error ? err.message : "未知错误"}`);
      }
    } finally {
      setGeneratingShotId(null);
    }
  }

  /**
   * 任务 1：提交单个 Shot 的视频生成。
   * 重新生成时保留旧视频直到新视频成功（不先删旧的）。
   */
  async function submitVideo(shotId: string) {
    // PRD §8.1：视频生成需正式 scope（draft 不可，需先归档）—— fail-closed
    if (!isCloudActionable(projectId, sourceUnitId) || !session) {
      setNotice("视频生成需要先归档为正式项目。");
      return;
    }
    const existing = videoJobs[shotId];
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      setNotice("该 Shot 视频正在生成中，请等待。");
      return;
    }
    setSubmittingVideoShotId(shotId);
    const idempotencyKey = `video-${shotId}-${Date.now()}`;
    try {
      const response = await storyboardClient.generateVideo(shotId, {
        projectId,
        sourceUnitId,
        idempotencyKey,
        expectedRevision: revision ?? undefined,
      });
      setVideoJobs((current) => ({
        ...current,
        [shotId]: {
          jobId: response.jobId,
          status: response.reused ? (response.status as VideoJobState["status"]) : "queued",
          startedAt: Date.now(),
          finishedAt: null,
          videoUrl: existing?.videoUrl ?? null,
          costEstimate: null,
          durationSeconds: null,
          error: null,
          providerTaskId: response.providerTaskId ?? null,
          aspectRatio: "9:16",
        },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "视频生成提交失败。";
      setVideoJobs((current) => ({
        ...current,
        [shotId]: {
          jobId: null,
          status: "failed",
          startedAt: null,
          finishedAt: Date.now(),
          videoUrl: existing?.videoUrl ?? null,
          costEstimate: null,
          durationSeconds: null,
          error: message,
          providerTaskId: null,
          aspectRatio: "9:16",
        },
      }));
      setNotice(`视频生成失败：${message}`);
    } finally {
      setSubmittingVideoShotId(null);
    }
  }

  /** 任务 1：轮询单个 Shot 的视频 job 状态（每 5s 由 ShotVideoPanel 触发）。 */
  async function pollVideoJob(shotId: string) {
    const state = videoJobs[shotId];
    if (!state?.jobId) return;
    if (state.status !== "queued" && state.status !== "running") return;
    try {
      const result = await storyboardClient.queryVideoJob(state.jobId);
      const job = result.job;
      if (job.status === "completed" && job.result_url) {
        const metadata = job.result_metadata as { durationSeconds?: number; costEstimate?: number };
        setVideoJobs((current) => ({
          ...current,
          [shotId]: {
            ...current[shotId],
            status: "completed",
            finishedAt: Date.now(),
            videoUrl: job.result_url,
            durationSeconds: metadata.durationSeconds ?? null,
            costEstimate: metadata.costEstimate ?? null,
            error: null,
          },
        }));
      } else if (job.status === "failed") {
        setVideoJobs((current) => ({
          ...current,
          [shotId]: {
            ...current[shotId],
            status: "failed",
            finishedAt: Date.now(),
            error: job.error ?? "视频生成失败。",
          },
        }));
      }
    } catch {
      // 轮询失败静默，下次再试
    }
  }

  /** 任务 2：批量提交视频生成。 */
  async function batchSubmitVideos(shotIds: string[]) {
    if (batchRunning) return;
    if (!isCloudActionable(projectId, sourceUnitId)) {
      setNotice("批量视频生成需要先归档为正式项目。");
      return;
    }
    if (shotIds.length === 0) {
      setNotice("没有可提交的 Shot。");
      return;
    }
    setBatchRunning(true);
    // 用本地 accumulator 避免 stale React state（Codex MUST FIX: batch progress reads stale state）
    let completed = 0;
    let failed = 0;
    let running = 0;
    const setProgress = (next: { completed: number; failed: number; running: number }) => {
      setBatchProgress({ total: shotIds.length, ...next });
    };
    setProgress({ completed: 0, failed: 0, running: 0 });
    for (const shotId of shotIds) {
      // 用 ref 风格读取最新 videoJobs（避免闭包 stale）
      const existing = videoJobsRef.current[shotId];
      if (existing && (existing.status === "queued" || existing.status === "running")) continue;
      if (existing?.status === "completed" && existing.videoUrl) continue;
      running += 1;
      setProgress({ completed, failed, running });
      await submitVideo(shotId);
      const newState = videoJobsRef.current[shotId];
      running = Math.max(0, running - 1);
      if (newState?.status === "failed") {
        failed += 1;
      } else {
        completed += 1;
      }
      setProgress({ completed, failed, running });
    }
    setBatchRunning(false);
    setNotice(`批量完成：${completed} 成功，${failed} 失败。`);
  }

  function batchAll() {
    const all = scenes.flatMap((s) => s.shots).map((sh) => sh.id ?? sh.clientId ?? "").filter(Boolean);
    void batchSubmitVideos(all);
  }

  function batchScene(sceneId: string) {
    const scene = scenes.find((s) => (s.id ?? s.clientId) === sceneId);
    if (!scene) return;
    const ids = scene.shots.map((sh) => sh.id ?? sh.clientId ?? "").filter(Boolean);
    void batchSubmitVideos(ids);
  }

  function batchUnfinished() {
    const all = scenes.flatMap((s) => s.shots).map((sh) => sh.id ?? sh.clientId ?? "").filter(Boolean);
    const unfinished = all.filter((id) => {
      const st = videoJobs[id];
      return !st || (st.status !== "completed" && st.status !== "queued" && st.status !== "running");
    });
    void batchSubmitVideos(unfinished);
  }

  function batchRetryFailed() {
    const all = scenes.flatMap((s) => s.shots).map((sh) => sh.id ?? sh.clientId ?? "").filter(Boolean);
    const failedIds = all.filter((id) => videoJobs[id]?.status === "failed");
    void batchSubmitVideos(failedIds);
  }

  // -------------------------------------------------------------------
  // 文件上传（剧本输入）
  // -------------------------------------------------------------------

  function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const sourceFile: ProductionSourceFile = {
        id: createProductionId("source"),
        name: file.name,
        mimeType: file.type || "text/plain",
        size: file.size,
        textPreview: text.slice(0, 500),
        extractedText: text,
        uploadedAt: new Date().toISOString(),
      };
      setSourceFiles((current) => [sourceFile, ...current]);
      setManuscript((current) => [text, current].filter(Boolean).join("\n\n"));
      setNotice(`已读取资料《${file.name}》，可点击「分析剧本」。`);
    };
    reader.readAsText(file);
  }

  // -------------------------------------------------------------------
  // Scene/Shot 编辑（任务 3）
  // -------------------------------------------------------------------

  function updateScene(sceneId: string, patch: Partial<StoryboardScene>) {
    setScenes((current) => current.map((s) => {
      const id = s.id ?? s.clientId ?? "";
      return id === sceneId ? { ...s, ...patch, userEdited: true } as StoryboardScene : s;
    }));
  }

  function updateShot(sceneId: string, shotId: string, patch: Partial<StoryboardShot>) {
    setScenes((current) => current.map((s) => {
      const sid = s.id ?? s.clientId ?? "";
      if (sid !== sceneId) return s;
      return {
        ...s,
        shots: s.shots.map((shot) => {
          const id = shot.id ?? shot.clientId ?? "";
          return id === shotId ? { ...shot, ...patch, userEdited: true } as StoryboardShot : shot;
        }),
      };
    }));
  }

  function addShot(sceneId: string) {
    setScenes((current) => current.map((s) => {
      const sid = s.id ?? s.clientId ?? "";
      if (sid !== sceneId) return s;
      const newShot: StoryboardShot = {
        id: undefined,
        clientId: `p_shot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        idSource: "client",
        sceneId,
        order: s.shots.length + 1,
        sourceText: "",
        storyBeat: "",
        visualDescription: "",
        characterAssetIds: [],
        sceneAssetId: null,
        propAssetIds: [],
        shotSize: "中景",
        cameraMovement: "固定",
        angle: "平视",
        durationSeconds: 4,
        dialogue: "",
        emotion: "",
        continuity: "",
        imagePrompt: "",
        jimengPromptZh: "",
        locked: false,
        userEdited: true,
        confirmed: false,
        revision: 0,
        analysisVersion: 0,
        sourceHash: "",
      };
      return { ...s, shots: [...s.shots, newShot] };
    }));
  }

  function deleteShot(sceneId: string, shotId: string) {
    setScenes((current) => current.map((s) => {
      const sid = s.id ?? s.clientId ?? "";
      if (sid !== sceneId) return s;
      return { ...s, shots: s.shots.filter((shot) => {
        const id = shot.id ?? shot.clientId ?? "";
        if (id === shotId) {
          if (shot.idSource === "server" && shot.id) setDeletedShotIds((cur) => [...cur, shot.id as string]);
          return false;
        }
        return true;
      }).map((shot, i) => ({ ...shot, order: i + 1 })) };
    }));
  }

  function splitShot(sceneId: string, shotId: string) {
    setScenes((current) => current.map((s) => {
      const sid = s.id ?? s.clientId ?? "";
      if (sid !== sceneId) return s;
      const idx = s.shots.findIndex((shot) => (shot.id ?? shot.clientId) === shotId);
      if (idx < 0) return s;
      const original = s.shots[idx];
      if (original.locked) return s; // 锁定不允许拆
      const first: StoryboardShot = { ...original, visualDescription: `${original.visualDescription}（上半）`, durationSeconds: Math.max(1, Math.floor(original.durationSeconds / 2)) };
      const second: StoryboardShot = {
        ...original,
        id: undefined,
        clientId: `p_shot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        idSource: "client" as const,
        order: original.order + 1,
        visualDescription: `${original.visualDescription}（下半）`,
        userEdited: true,
      };
      const newShots = [...s.shots];
      newShots.splice(idx, 1, first, second);
      return { ...s, shots: newShots.map((shot, i) => ({ ...shot, order: i + 1 })) };
    }));
  }

  function moveShot(sceneId: string, shotId: string, direction: "up" | "down") {
    setScenes((current) => current.map((s) => {
      const sid = s.id ?? s.clientId ?? "";
      if (sid !== sceneId) return s;
      const idx = s.shots.findIndex((shot) => (shot.id ?? shot.clientId) === shotId);
      if (idx < 0) return s;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= s.shots.length) return s;
      const newShots = [...s.shots];
      [newShots[idx], newShots[target]] = [newShots[target], newShots[idx]];
      return { ...s, shots: newShots.map((shot, i) => ({ ...shot, order: i + 1 })) };
    }));
  }

  function toggleShotLock(sceneId: string, shotId: string) {
    setScenes((current) => current.map((s) => {
      const sid = s.id ?? s.clientId ?? "";
      if (sid !== sceneId) return s;
      return {
        ...s,
        shots: s.shots.map((shot) => {
          const id = shot.id ?? shot.clientId ?? "";
          return id === shotId ? { ...shot, locked: !shot.locked } : shot;
        }),
      };
    }));
  }

  function toggleShotConfirm(sceneId: string, shotId: string) {
    setScenes((current) => current.map((s) => {
      const sid = s.id ?? s.clientId ?? "";
      if (sid !== sceneId) return s;
      return {
        ...s,
        shots: s.shots.map((shot) => {
          const id = shot.id ?? shot.clientId ?? "";
          return id === shotId ? { ...shot, confirmed: !shot.confirmed } : shot;
        }),
      };
    }));
  }

  function addScene() {
    const newScene: StoryboardScene = {
      id: undefined,
      clientId: `p_scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      idSource: "client",
      order: scenes.length + 1,
      heading: `新场景 ${scenes.length + 1}`,
      location: "",
      timeOfDay: "",
      summary: "",
      sourceText: "",
      characterAssetIds: [],
      propAssetIds: [],
      shots: [],
      locked: false,
      userEdited: true,
      confirmed: false,
      revision: 0,
      analysisVersion: 0,
      sourceHash: "",
    };
    setScenes((current) => [...current, newScene]);
  }

  function deleteScene(sceneId: string) {
    setScenes((current) => {
      const target = current.find((s) => (s.id ?? s.clientId) === sceneId);
      if (target?.idSource === "server" && target.id) {
        setDeletedSceneIds((cur) => [...cur, target.id as string]);
      }
      return current.filter((s) => (s.id ?? s.clientId) !== sceneId).map((s, i) => ({ ...s, order: i + 1 }));
    });
  }

  function navigateToStage(stage: UnifiedProductionStage) {
    const existingStage = context?.stages[stage] ?? null;
    const nextWorkId = existingStage?.workId ?? null;
    router.replace(buildUnifiedWorkbenchUrl({
      projectId: context?.project.id || projectId,
      workId: nextWorkId,
      tab: stage,
      unitId: unitId || null,
    }), { scroll: false });
    setWorkId(nextWorkId);
    setActiveStage(stage);
    if (stage === "storyboard") setStoryboardSubview("shot_table");
  }

  function handleStoryboardSubviewChange(subview: StoryboardSubview) {
    setStoryboardSubview(subview);
    if (!projectId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("projectId", projectId);
    params.set("tab", "storyboard");
    if (workId) params.set("workId", workId);
    params.set("view", subview);
    router.replace(`/production?${params.toString()}`, { scroll: false });
  }

  const handleStageChange = (stage: UnifiedProductionStage) => {
    if (unsaved) {
      setPendingStage(stage);
      setUnsavedDialogOpen(true);
      return;
    }
    navigateToStage(stage);
  };

  const startStage = async (stage: UnifiedProductionStage) => {
    if (!projectId) return;
    try {
      const ensured = await ensureUnifiedStage(projectId, stage);
      router.replace(buildUnifiedWorkbenchUrl({
        projectId,
        workId: ensured.workId,
        tab: stage,
        unitId: unitId || null,
      }), { scroll: false });
      setWorkId(ensured.workId);
      setActiveStage(stage);
      setUnsaved(false);
      await reloadContext();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法启动该阶段，请稍后重试。");
    }
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  const displayContext: UnifiedWorkbenchContextV1 = context ?? {
    contractVersion: WORK_CONTRACT_VERSION,
    project: { id: projectId, title: projectTitle || "未命名草稿", ownerId: session?.user?.id || "" },
    universe: null,
    stages: { script: null, art: null, storyboard: null, video: null, editing: null },
    legacy: { sourceUnitId: unitId || null, resolvedFromProjectOnly: !unitId },
  };

  if (isEmptyState) {
    return (
      <ProductionEmptyState entryMode={typeof entryMode === "string" ? entryMode : undefined} />
    );
  }

  if (projectId && !projectId.startsWith("draft-") && contextLoading && !context) {
    return (
      <main className={styles.shell}>
        <section className={styles.loadingState} aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p>正在加载制作工作台上下文…</p>
        </section>
      </main>
    );
  }

  if (contextError && !context && !projectId.startsWith("draft-")) {
    return (
      <main className={styles.shell}>
        <section className={styles.loadingState} role="alert">
          <AlertTriangle size={32} color="var(--danger)" />
          <p>{contextError}</p>
          <button type="button" className={styles.primaryButton} onClick={() => void reloadContext()}>
            重新加载
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      {productionGateError && !gateWarningDismissed ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            margin: "0 auto 12px",
            maxWidth: 1080,
            width: "100%",
            borderRadius: 10,
            border: "1px solid rgba(255, 209, 102, 0.45)",
            background: "rgba(255, 209, 102, 0.08)",
            color: "var(--ink-secondary)",
            fontSize: 13,
          }}
        >
          <AlertTriangle size={15} color="#ffd166" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{productionGateError}</span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setGateWarningDismissed(true)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-secondary)", display: "inline-flex", padding: 2 }}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
      <UnifiedProductionHeader
        context={displayContext}
        activeStage={activeStage}
        saveStatus={saving ? "saving" : unsaved ? "unsaved" : "saved"}
        onStageChange={handleStageChange}
        onCreateUniverse={() => router.push("/universes?create=1")}
        onBindUniverse={workId ? () => setBindingDialogOpen(true) : undefined}
        onOpenUniverse={displayContext.universe ? () => router.push(`/universes/${displayContext.universe?.id}`) : undefined}
        onVersionClick={() => setShowVersionHistory(true)}
        onEvidenceClick={() => setNotice("证据记录会随当前版本一并保留。")}
        onMoreClick={() => setShowSecondaryMenu((value) => !value)}
        primaryActions={(
          <>
          {backToCreation.visible ? (
            <button
              className={styles.headerIconButton}
              type="button"
              onClick={() => {
                if (!backToCreation.ok || !projectId || !sourceUnitId) return;
                router.push(buildCreationJumpUrl({ projectId, sourceUnitId }));
              }}
              disabled={!backToCreation.ok || saving}
              title={backToCreation.ok ? "返回创作工作台对应单元" : backToCreation.reason}
              aria-label="返回创作工作台"
            >
              <ArrowLeft size={15} />
            </button>
          ) : null}
          <button
            className={styles.headerActionButton}
            type="button"
            onClick={saveToServer}
            disabled={saving || !isScopeActionable(projectId, sourceUnitId)}
            title={!isScopeActionable(projectId, sourceUnitId) ? "缺少 projectId 或 sourceUnitId" : undefined}
          >
            <Save size={15} /> <span>{saving ? "保存中..." : "保存"}</span>
          </button>
          <StoryboardExportMenu
            projectId={projectId}
            sourceUnitId={sourceUnitId}
            projectTitle={projectTitle}
            scenes={scenes}
            revision={revision}
            videoJobs={videoJobs}
            accessToken={session?.access_token}
          />
          </>
        )}
      />

      {showSecondaryMenu ? (
        <div className={styles.secondaryMenuFloating} role="menu">
          <button type="button" className={styles.secondaryMenuItem} onClick={() => { setShowVersionHistory(true); setShowSecondaryMenu(false); }} role="menuitem">
            <Clock size={14} /> 版本历史
          </button>
          <button type="button" className={styles.secondaryMenuItem} onClick={() => { setShowTeamPanel(true); setShowSecondaryMenu(false); }} role="menuitem">
            <Users size={14} /> 团队
          </button>
          <button type="button" className={styles.secondaryMenuItem} onClick={() => { setShowModelRegistry(true); setShowSecondaryMenu(false); }} role="menuitem">
            <Cpu size={14} /> 模型注册表
          </button>
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className={`${styles.notice} ${notice.includes("失败") || notice.includes("拒绝") || notice.includes("错误") ? styles.noticeError : styles.noticeSuccess}`}
        >
          <span>{notice}</span>
          <button type="button" className={styles.noticeClose} onClick={() => setNotice("")} aria-label="关闭">
            <X size={14} />
          </button>
        </div>
      ) : null}

      {conflictRevision !== null ? (
        <div role="alert" className={styles.conflict}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div className={styles.conflictBody}>
            <div className={styles.conflictTitle}>数据已在别处更新</div>
            <div className={styles.conflictDesc}>
              服务器当前 revision 为 {conflictRevision}，本地期望 {revision}。本地数据未被覆盖，请选择如何处理：
            </div>
            <div className={styles.conflictActions}>
              <button
                type="button"
                className={styles.primaryButton}
                style={{ padding: "4px 12px", fontSize: 12, minHeight: 28 }}
                onClick={loadLatestAndClearConflict}
                disabled={saving}
              >
                加载最新版本
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                style={{ padding: "4px 12px", fontSize: 12, minHeight: 28 }}
                onClick={saveAsSnapshot}
                disabled={saving}
              >
                {saving ? "另存中…" : "基于当前内容另存快照"}
              </button>
              <button
                type="button"
                className={styles.noticeClose}
                onClick={() => setConflictRevision(null)}
                aria-label="关闭"
                style={{ padding: "4px 8px" }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className={styles.workspace}>
        <div className={styles.stageContent}>
            {activeStage === "script" ? (
              workId ? (
                <ScreenplayStudio
                  embedded
                  projectId={projectId || undefined}
                  workId={workId}
                  unitId={unitId || null}
                  onUnitChange={setUnitId}
                  onUnsavedChange={setUnsaved}
                />
              ) : (
                <section className={styles.stageEmpty}>
                  <h2>剧本工作流尚未启动</h2>
                  <p>先建立剧本 Work，进入后会在这里打开以 AI 对话为主导的剧本创作台。</p>
                  <button type="button" className={styles.primaryButton} onClick={() => void startStage("script")}>开始剧本创作</button>
                </section>
              )
            ) : null}
            {activeStage === "art" ? (
              workId ? (
                <ArtWorkbench contextProjectId={projectId || undefined} contextProjectTitle={projectTitle || undefined} contextSourceUnitId={sourceUnitId || undefined} contextWorkId={workId} />
              ) : (
                <section className={styles.stageEmpty}>
                  <h2>美术工作流尚未启动</h2>
                  <p>先建立美术 Work，角色、场景和道具会统一纳入当前项目的美术资产。</p>
                  <button type="button" className={styles.primaryButton} onClick={() => void startStage("art")}>开始美术</button>
                </section>
              )
            ) : null}
            {activeStage === "storyboard" ? (
              workId ? (
                <UnifiedStoryboardStage
                  projectId={projectId}
                  workId={workId}
                  unitId={unitId || null}
                  subview={storyboardSubview}
                  onSubviewChange={handleStoryboardSubviewChange}
                  handoffId={handoffId || null}
                  content={{
                    shot_table: (
                      <StoryboardTablePanel
                        scenes={scenes}
                        revision={revision}
                        analyzingSceneId={analyzingSceneId}
                        conflictRevision={conflictRevision}
                        onUpdateScene={updateScene}
                        onUpdateShot={updateShot}
                        onAddShot={addShot}
                        onDeleteShot={deleteShot}
                        onAddScene={addScene}
                        onDeleteScene={deleteScene}
                        onSplitShot={splitShot}
                        onMergeShot={() => { /* TODO: 任务 8 配套 */ }}
                        onMoveShot={moveShot}
                        onToggleShotLock={toggleShotLock}
                        onToggleShotConfirm={toggleShotConfirm}
                        onReanalyzeScene={(sceneId) => analyzeScript("scene", sceneId)}
                        onClearConflict={() => setConflictRevision(null)}
                      />
                    ),
                    grids: <StoryboardFrameGrid scenes={scenes} frames={frames} />,
                    canvas: (
                      <StoryboardCanvas
                        scenes={scenes}
                        frames={frames}
                        canvas={canvas}
                        onChange={setCanvas}
                      />
                    ),
                    prompts: <StoryboardPromptList scenes={scenes} prompts={prompts} onGenerate={() => void generatePromptsForShots(scenes.flatMap((scene) => scene.shots.map((shot) => shot.id ?? shot.clientId ?? "")))} />,
                  }}
                />
              ) : (
                <section className={styles.stageEmpty}>
                  <h2>分镜工作流尚未启动</h2>
                  <p>先建立分镜 Work，镜头表、宫格、运动预览和视频提示词会在同一页面中切换。</p>
                  <button type="button" className={styles.primaryButton} onClick={() => void startStage("storyboard")}>开始分镜</button>
                </section>
              )
            ) : null}
            {activeStage === "video" ? (
              <ShotFramesPanel
                scenes={scenes}
                assets={assets}
                frames={frames}
                prompts={prompts}
                generatingShotId={generatingShotId}
                generatingPromptsForShots={generatingPromptsForShots}
                onGenerateFrame={generateShotFrame}
                onGeneratePrompts={generatePromptsForShots}
                onToggleConfirm={(shotId) => {
                  for (const scene of scenes) {
                    const sid = scene.id ?? scene.clientId ?? "";
                    if (scene.shots.some((sh) => (sh.id ?? sh.clientId) === shotId)) {
                      toggleShotConfirm(sid, shotId);
                      return;
                    }
                  }
                }}
                onUpdateShot={updateShot}
                videoJobs={videoJobs}
                submittingVideoShotId={submittingVideoShotId}
                onGenerateVideo={submitVideo}
                onPollVideo={pollVideoJob}
                batchProgress={batchProgress}
                onBatchAll={batchAll}
                onBatchScene={batchScene}
                onBatchUnfinished={batchUnfinished}
                onBatchRetryFailed={batchRetryFailed}
                batchRunning={batchRunning}
              />
            ) : null}
            {activeStage === "editing" ? (
              <EditorFramework
                projectId={projectId}
                sourceUnitId={sourceUnitId || "legacy"}
                accessToken={session?.access_token ?? null}
              />
            ) : null}
        </div>
      </section>

      {showVersionHistory ? (
        <VersionHistory
          versions={versionList}
          loading={false}
          error={null}
          onSelect={(id) => setSelectedVersionId(id)}
          onRestore={async () => { setNotice("版本恢复请使用 /api/versions PATCH 接口（任务 8 配套）。"); }}
          onCompare={async (a, b) => { setVersionDiff(null); setNotice(`对比 ${a} ↔ ${b}：待 E2E 配套实现。`); }}
          diff={versionDiff}
          selectedVersionId={selectedVersionId}
          onClose={() => setShowVersionHistory(false)}
        />
      ) : null}
      {showTeamPanel ? <TeamPanel onClose={() => setShowTeamPanel(false)} /> : null}
      {showModelRegistry ? <ModelRegistryPanel onClose={() => setShowModelRegistry(false)} /> : null}
      <UniverseBindingDialog
        workId={workId ?? ""}
        open={bindingDialogOpen}
        onClose={() => setBindingDialogOpen(false)}
        onConfirm={handleBindUniverse}
      />

      {archiveOpen ? (
        <div role="dialog" aria-modal="true" aria-label="归档草稿" className={styles.archiveOverlay}>
          <div className={styles.archiveModal}>
            <div className={styles.archiveHeader}>
              <h2>归档草稿为项目</h2>
              <p>PRD §8.2：为这份草稿命名并选择项目与 Universe 绑定方式，归档后将自动同步到云端。</p>
            </div>
            <div className={styles.archiveBody}>
              <label className={styles.archiveField}>
                <span>项目名称</span>
                <input
                  type="text"
                  value={archiveTitle}
                  onChange={(e) => setArchiveTitle(e.target.value)}
                  placeholder="未命名项目"
                  autoFocus
                />
              </label>
              <label className={styles.archiveField}>
                <span>类型</span>
                <select
                  value={archiveWorkflowType}
                  onChange={(e) => setArchiveWorkflowType(e.target.value as "creation" | "continuation")}
                >
                  <option value="creation">原创</option>
                  <option value="continuation">续作</option>
                </select>
              </label>
              <label className={styles.archiveField}>
                <span>项目模式</span>
                <select
                  value={archiveProjectMode}
                  onChange={(e) => setArchiveProjectMode(e.target.value as "existing" | "create")}
                >
                  <option value="create">创建新项目</option>
                  <option value="existing">绑定已有项目</option>
                </select>
              </label>
              {archiveProjectMode === "existing" ? (
                <label className={styles.archiveField}>
                  <span>已有项目 ID</span>
                  <input
                    type="text"
                    value={archiveExistingProjectId}
                    onChange={(e) => setArchiveExistingProjectId(e.target.value)}
                    placeholder="粘贴已有项目 UUID"
                  />
                </label>
              ) : null}
              <label className={styles.archiveField}>
                <span>集次标签</span>
                <input
                  type="text"
                  value={archiveEpisodeLabel}
                  onChange={(e) => setArchiveEpisodeLabel(e.target.value)}
                  placeholder="Episode 1"
                />
              </label>
              <label className={styles.archiveField}>
                <span>Universe 绑定</span>
                <select
                  value={archiveUniverseMode}
                  onChange={(e) => setArchiveUniverseMode(e.target.value as "existing" | "create" | "none")}
                >
                  <option value="none">暂不归属 Universe</option>
                  <option value="existing">绑定已有 Universe</option>
                  <option value="create">创建新 Universe</option>
                </select>
              </label>
              {archiveUniverseMode === "existing" ? (
                <label className={styles.archiveField}>
                  <span>已有 Universe ID</span>
                  <input
                    type="text"
                    value={archiveUniverseId}
                    onChange={(e) => setArchiveUniverseId(e.target.value)}
                    placeholder="粘贴已有 Universe UUID"
                  />
                </label>
              ) : null}
              {archiveUniverseMode === "create" ? (
                <label className={styles.archiveField}>
                  <span>新 Universe 名称</span>
                  <input
                    type="text"
                    value={archiveUniverseName}
                    onChange={(e) => setArchiveUniverseName(e.target.value)}
                    placeholder={`${archiveTitle || "未命名"} Universe`}
                  />
                </label>
              ) : null}
            </div>
            <div className={styles.archiveActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setArchiveOpen(false)}
                disabled={archiving}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={archiveDraft}
                disabled={archiving || !archiveTitle.trim()}
              >
                {archiving ? "归档中…" : "归档并保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
