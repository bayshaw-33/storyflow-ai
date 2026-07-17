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
import type { Session } from "@supabase/supabase-js";
import { AlertTriangle, Clock, Cpu, Film, Save, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

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
import type { ProductionSourceFile } from "@/lib/production/types";
import { VersionHistory, type VersionRecord, type VersionDiffResult } from "./VersionHistory";
import { TeamPanel } from "./TeamPanel";
import { ModelRegistryPanel } from "./ModelRegistryPanel";
import {
  ArtAssetsPanel,
  ScriptInputPanel,
  ShotFramesPanel,
  StoryboardTablePanel,
  type AssetCandidate,
  type AssetCandidateMap,
  type PromptResultMap,
  type ShotFrameMap,
} from "./StoryboardPanels";
import { type VideoJobMap, type VideoJobState, type BatchVideoProgress } from "./ShotVideoPanel";
import { ExportMenu } from "./ExportMenu";
import { StoryboardExportMenu } from "./StoryboardExportMenu";
import type { ProductionProjectState } from "@/lib/production/types";
import styles from "./ProductionWorkbench.module.css";

type Tab = "script" | "table" | "assets" | "frames";

type StoryboardAssets = {
  characters: StoryboardAssetUsage[];
  locations: StoryboardAssetUsage[];
  props: StoryboardAssetUsage[];
};

const tabLabels: Array<{ id: Tab; label: string }> = [
  { id: "script", label: "剧本输入" },
  { id: "table", label: "分镜表" },
  { id: "assets", label: "美术物料" },
  { id: "frames", label: "分镜图与即梦提示词" },
];

const EMPTY_ASSETS: StoryboardAssets = { characters: [], locations: [], props: [] };

export function ProductionWorkbench() {
  const router = useRouter();

  // --- 顶层状态 ---
  const [activeTab, setActiveTab] = useState<Tab>("script");
  const [session, setSession] = useState<Session | null>(null);
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [sourceUnitId, setSourceUnitId] = useState<string>("");
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [manuscript, setManuscript] = useState<string>("");
  const [sourceFiles, setSourceFiles] = useState<ProductionSourceFile[]>([]);
  const [scopeError, setScopeError] = useState<string>("");
  const [notice, setNotice] = useState<string>("");

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
  const [versionList, setVersionList] = useState<VersionRecord[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionDiff, setVersionDiff] = useState<VersionDiffResult | null>(null);

  const storyboardClient = useMemo(
    () => StoryboardClient.fromSupabase(supabaseClient),
    [supabaseClient],
  );

  // --- URL 参数 + scope 校验 + handoff/draft 加载 ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlProjectId = params.get("projectId");
    const urlSourceUnitId = params.get("sourceUnitId");
    if (!urlProjectId || !urlSourceUnitId) {
      setScopeError("缺少 projectId 或 sourceUnitId 参数。请从剧本工作台「生成分镜」按钮进入。");
      return;
    }
    setProjectId(urlProjectId);
    setSourceUnitId(urlSourceUnitId);

    // 优先 handoff
    const handoff = readCreativeHandoff(urlProjectId, urlSourceUnitId);
    if (handoff) {
      setProjectTitle(handoff.title);
      setManuscript(handoff.manuscript);
      return;
    }

    // 尝试本地草稿
    const draftScope: StoryboardDraftScope = {
      userId: session?.user?.id || null,
      projectId: urlProjectId,
      sourceUnitId: urlSourceUnitId,
    };
    const draft = readStoryboardDraft(draftScope);
    if (draft) {
      setProjectTitle(draft.title || "");
      setManuscript(draft.sourceSummary || "");
      setSourceFiles(draft.sourceFiles || []);
      // 草稿中的 storyboard 字段（如果之前保存过）
      const draftScenes = (draft as ProductionProjectState & { storyboardScenes?: StoryboardScene[] }).storyboardScenes;
      if (Array.isArray(draftScenes) && draftScenes.length > 0) {
        setScenes(draftScenes);
        const draftAssets = (draft as ProductionProjectState & { storyboardAssets?: StoryboardAssets }).storyboardAssets;
        if (draftAssets) setAssets(draftAssets);
        const draftRevision = (draft as ProductionProjectState & { storyboardRevision?: number }).storyboardRevision;
        if (typeof draftRevision === "number") setRevision(draftRevision);
      }
    }
  }, [session?.user?.id]);

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

  // --- 自动写本地草稿（每次 scenes/assets/revision 变更）---
  useEffect(() => {
    if (!projectId || !sourceUnitId) return;
    const scope: StoryboardDraftScope = {
      userId: session?.user?.id || null,
      projectId,
      sourceUnitId,
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
    } as unknown as ProductionProjectState;
    writeStoryboardDraft(scope, draftPayload);
  }, [scenes, assets, revision, projectId, sourceUnitId, session, projectTitle, sourceFiles, manuscript]);

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
    };
    try {
      const response: SaveResponse = await storyboardClient.saveState(request);
      // 应用服务端返回的稳定 ID 映射
      applyServerResponse(response);
      setNotice(`已同步到云端（revision ${response.revision}）。`);
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
        setActiveTab("table");
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
    if (!projectId || !sourceUnitId || !session) {
      setNotice("未登录或缺少 projectId/sourceUnitId，无法生成视频。");
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

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  if (scopeError) {
    return (
      <main className={styles.shell}>
        <div style={{ padding: "64px 24px", textAlign: "center", color: "#ff6b6b" }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>无法进入分镜制作台</h2>
          <p style={{ fontSize: 14, marginBottom: 24 }}>{scopeError}</p>
          <button className={styles.secondaryButton} type="button" onClick={() => router.push("/creation-workbench")}>
            返回剧本工作台
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <p className={styles.eyebrow}>Kiikis Production Workbench · 四区分镜台</p>
          <input
            className={styles.titleInput}
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            aria-label="Project title"
            placeholder="项目标题"
          />
        </div>
        <nav className={styles.modeSwitch} aria-label="Storyboard zones">
          {tabLabels.map((tab) => (
            <button
              className={`${styles.modeButton} ${activeTab === tab.id ? styles.modeButtonActive : ""}`}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className={styles.actionRow}>
          <button className={styles.secondaryButton} type="button" onClick={() => setShowVersionHistory(true)}><Clock size={16} /> 版本</button>
          <button className={styles.secondaryButton} type="button" onClick={() => setShowTeamPanel(true)}><Users size={16} /> 团队</button>
          <button className={styles.secondaryButton} type="button" onClick={() => setShowModelRegistry(true)}><Cpu size={16} /> 模型</button>
          <button className={styles.secondaryButton} type="button" onClick={saveToServer} disabled={saving}>
            <Save size={16} /> {saving ? "保存中..." : "保存"}
          </button>
          <StoryboardExportMenu
            projectId={projectId}
            sourceUnitId={sourceUnitId}
            projectTitle={projectTitle}
            scenes={scenes}
            revision={revision}
            videoJobs={videoJobs}
          />
          <ExportMenu
            state={{
              id: projectId,
              projectId,
              title: projectTitle,
              workflowType: "storyboard",
              contentType: "short_drama",
              aspectRatio: "9:16",
              language: "zh",
              sourceFiles,
              sourceSummary: manuscript,
              storyBrief: { logline: "", targetPlatform: "", targetAudience: "", storySummary: "", notes: "" },
              visualBible: { visualStyle: "", colorPalette: "", cameraRules: "", characterRules: "", sceneRules: "", negativePrompt: "" },
              shots: [],
              mode: "planning",
              providers: { imageProvider: "minimax", videoProvider: "minimax" },
              chatMessages: [],
              history: [],
              casting: {},
              updatedAt: new Date().toISOString(),
            }}
          />
        </div>
      </header>

      {notice ? (
        <div role="status" style={noticeStyle}>
          {notice}
          <button type="button" onClick={() => setNotice("")} style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", marginLeft: 8 }} aria-label="关闭">
            <X size={14} />
          </button>
        </div>
      ) : null}

      {conflictRevision !== null ? (
        <div role="alert" style={conflictStyle}>
          <AlertTriangle size={14} style={{ marginRight: 6, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>数据已在别处更新</div>
            <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.9 }}>
              服务器当前 revision 为 {conflictRevision}，本地期望 {revision}。本地数据未被覆盖，请选择如何处理：
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className={styles.primaryButton}
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={loadLatestAndClearConflict}
                disabled={saving}
              >
                加载最新版本
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={saveAsSnapshot}
                disabled={saving}
              >
                {saving ? "另存中…" : "基于当前内容另存快照"}
              </button>
              <button
                type="button"
                onClick={() => setConflictRevision(null)}
                style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", padding: "4px 8px", fontSize: 12 }}
                aria-label="关闭"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className={styles.workspace}>
        {activeTab === "script" ? (
          <ScriptInputPanel
            projectId={projectId}
            sourceUnitId={sourceUnitId}
            projectTitle={projectTitle}
            manuscript={manuscript}
            sourceFiles={sourceFiles}
            analyzing={analyzing}
            analyzeError={analyzeError}
            onUploadFile={handleFileUpload}
            onAnalyze={() => analyzeScript("full")}
            onClearAnalyzeError={() => setAnalyzeError("")}
          />
        ) : null}
        {activeTab === "table" ? (
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
        ) : null}
        {activeTab === "assets" ? (
          <ArtAssetsPanel
            assets={assets}
            candidates={candidates}
            generatingAssetId={generatingAssetId}
            onGenerateCandidates={generateAssetCandidates}
            onSelectMainVersion={selectMainVersion}
            onUploadReplacement={uploadAssetReplacement}
            onAssetClick={(assetId) => setNotice(`资产 ${assetId} 关联的 Shot：${scenes.flatMap((s) => s.shots).filter((sh) => sh.characterAssetIds.includes(assetId) || sh.sceneAssetId === assetId || sh.propAssetIds.includes(assetId)).map((sh) => sh.id ?? sh.clientId).join(", ") || "无"}`)}
          />
        ) : null}
        {activeTab === "frames" ? (
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
    </main>
  );
}

const noticeStyle: React.CSSProperties = {
  margin: "12px 24px 0",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(117, 219, 198, 0.12)",
  border: "1px solid rgba(117, 219, 198, 0.35)",
  color: "#75dbc6",
  fontSize: 13,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const conflictStyle: React.CSSProperties = {
  margin: "12px 24px 0",
  padding: "12px 14px",
  borderRadius: 10,
  background: "rgba(255, 107, 107, 0.12)",
  border: "1px solid rgba(255, 107, 107, 0.35)",
  color: "#ff6b6b",
  fontSize: 13,
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};
