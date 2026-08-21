"use client";

/**
 * V2.2 AI-first screenplay studio · 2026-08-16 production hotfix.
 *
 * Focus mode: the global side nav collapses; the page is exactly two
 * columns — the screenplay path rail and the KK-dominant main area. Tools
 * (document editor, similarity review, localization, delivery, continuity,
 * references, versions) open contextually in the main area or a drawer; KK,
 * the current document, and version review never become a permanent third
 * column.
 *
 * Conversation history is loaded from the server on mount (refresh-safe);
 * the similarity-review state is derived from persisted messages instead of
 * React memory. Tool selection drives the KK context (current object, stage
 * goal, next step).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  screenplayStudioApi,
  ScreenplayStudioApiError,
  clientErrorMessage,
  type ScreenplayUnitClientDto,
  type StaleEdgeDto,
} from "@/lib/client/v2/screenplay-studio/api";
import { fetchScreenplayStudio } from "@/lib/client/v2/screenplay-studio/auth";
import {
  canCreateUnit,
  SCREENPLAY_STUDIO_WORKFLOW_STAGES,
  type StudioWorkflowStage,
} from "@/lib/client/v2/screenplay-studio/types";
import { buildUnifiedWorkbenchUrl, parseUnifiedWorkbenchQuery } from "@/lib/contracts/v2/unified-workbench";
import { UnitNavigator } from "./UnitNavigator";
import { ScreenplayEditor } from "./ScreenplayEditor";
import { KkScreenplayRoom, type KkCandidate, type KkMessage, type KkPresetInput } from "./KkScreenplayRoom";
import { ContinuityPanel, type ContinuityFindingDto } from "./ContinuityPanel";
import { ReferenceList, type PacketReferenceDto } from "./ReferenceList";
import styles from "./ScreenplayStudio.module.css";

type StudioTool = "draft" | "similarity" | "localization" | "delivery" | "continuity" | "references" | "versions" | null;

const TOOL_LABELS: Record<Exclude<StudioTool, null>, string> = {
  draft: "当前文档",
  similarity: "雷同审查",
  localization: "本土化",
  delivery: "定稿与留痕",
  continuity: "连续性",
  references: "引用",
  versions: "版本",
};

const UNIT_TYPE_LABELS: Record<string, string> = {
  world: "世界观",
  character: "角色圣经",
  outline: "剧情及大纲",
  episode: "分集计划",
  scene: "剧本正文",
};

/** Marker persisted inside the review prompt; used to restore review state. */
const SIMILARITY_REVIEW_PROMPT_PREFIX = "请执行剧情及大纲阶段的雷同审查";

const GATE_MESSAGES: Record<string, string> = {
  character: "新节点按顺序创建：请先在世界观上保存并「确认可用」，再新建角色圣经。（已创建的节点随时可回改）",
  outline: "新节点按顺序创建：请先确认世界观、角色圣经为可用版本，再新建剧情及大纲。（已创建的节点随时可回改）",
  episode: "新节点按顺序创建：请先完成三部曲（世界观 → 角色圣经 → 剧情及大纲）并确认可用，再新建分集计划。",
  scene: "新节点按顺序创建：请先确认分集计划为可用版本，再新建剧本正文。",
};

interface WorkMeta {
  title: string | null;
  projectTitle: string | null;
  universeName: string | null;
  currentVersionId: string | null;
}

export interface ScreenplayStudioProps {
  embedded?: boolean;
  projectId?: string;
  workId?: string;
  unitId?: string | null;
  onUnitChange?: (unitId: string) => void;
  onUnsavedChange?: (unsaved: boolean) => void;
}

type ScreenplayMainView = "conversation" | "document" | "diff";

export function ScreenplayStudio({
  embedded = false,
  projectId: projectIdProp,
  workId: workIdProp,
  unitId: unitIdProp,
  onUnitChange,
  onUnsavedChange,
}: ScreenplayStudioProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = parseUnifiedWorkbenchQuery(searchParams);

  const [units, setUnits] = useState<ScreenplayUnitClientDto[]>([]);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [activeContent, setActiveContent] = useState("");
  const [loadedContent, setLoadedContent] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ currentVersionId: string | null } | null>(null);
  const [staleEdges, setStaleEdges] = useState<StaleEdgeDto[]>([]);
  const [narrow, setNarrow] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<StudioTool>(null);
  const [mainView, setMainView] = useState<ScreenplayMainView>("conversation");
  const [kkMessages, setKkMessages] = useState<KkMessage[]>([]);
  const [kkCandidate, setKkCandidate] = useState<KkCandidate | null>(null);
  const [preservedInput, setPreservedInput] = useState("");
  const [findings, setFindings] = useState<ContinuityFindingDto[]>([]);
  const [references, setReferences] = useState<PacketReferenceDto[]>([]);
  const [similarityBusy, setSimilarityBusy] = useState(false);
  const [presetInput, setPresetInput] = useState<KkPresetInput | null>(null);
  const [workMeta, setWorkMeta] = useState<WorkMeta | null>(null);
  const [exportBusy, setExportBusy] = useState<"script" | "evidence" | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const bootstrappedRef = useRef(false);

  const projectId = projectIdProp ?? query.projectId;
  const workId = workIdProp ?? query.workId;
  const urlUnitId = unitIdProp !== undefined ? unitIdProp : query.unitId;
  const conversationId = useMemo(() => workId ?? "", [workId]);

  // 独立剧本路由使用专注模式；嵌入统一制作台时保留全局导航。
  useEffect(() => {
    if (embedded || !workId) return;
    document.documentElement.dataset.screenplayFocus = "on";
    return () => {
      delete document.documentElement.dataset.screenplayFocus;
    };
  }, [embedded, workId]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // 雷同审查状态：从已持久化的会话推导（刷新后不丢）。
  const similarityReviewed = useMemo(
    () => kkMessages.some((m) => m.role === "user" && m.content.startsWith(SIMILARITY_REVIEW_PROMPT_PREFIX)),
    [kkMessages],
  );

  // 雷同审查门禁：未创建或未确认可用大纲时禁用并解释。
  const similarityGate = useMemo(() => {
    const outline = units.find((unit) => unit.type === "outline");
    if (!outline) {
      return { ready: false, reason: "尚未创建「剧情及大纲」。请先创建大纲并确认可用版本，再进行雷同审查。" };
    }
    if (!outline.finalizedVersionId) {
      return { ready: false, reason: "大纲尚未「确认可用」。请先在大纲上保存并确认可用版本，再进行雷同审查。" };
    }
    return { ready: true, reason: "" };
  }, [units]);

  useEffect(() => {
    bootstrappedRef.current = false;
    setUnits([]);
    setActiveUnitId(null);
    setActiveContent("");
    setLoadedContent({});
    setStaleEdges([]);
    setKkMessages([]);
    setKkCandidate(null);
    setPreservedInput("");
    setFindings([]);
    setReferences([]);
    setActiveTool(null);
    setWorkMeta(null);
    if (!workId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [{ units: list }, { stale }, history] = await Promise.all([
          screenplayStudioApi.listUnits(workId),
          screenplayStudioApi.listStale(workId).catch(() => ({ stale: [] as StaleEdgeDto[] })),
          screenplayStudioApi.listMessages(workId, conversationId).catch(() => [] as KkMessage[]),
        ]);
        if (cancelled) return;
        setUnits(list);
        setStaleEdges(stale);
        setKkMessages(history);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof ScreenplayStudioApiError
              ? error.userMessage
              : error instanceof Error ? error.message : "加载失败",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      // 面包屑：项目名 + Universe（best-effort，不阻断工作台）。
      try {
        const response = await fetchScreenplayStudio(`/api/v2/works/${encodeURIComponent(workId)}`);
        const body = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          work?: { title: string | null; projectTitle: string | null; universeName: string | null; currentVersionId: string | null };
        };
        if (!cancelled && body.success && body.work) {
          setWorkMeta(body.work);
        }
      } catch {
        /* 面包屑缺失不阻断 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workId, conversationId]);

  useEffect(() => {
    if (loading || !workId || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const initial = urlUnitId && units.some((u) => u.id === urlUnitId) ? urlUnitId : units[0]?.id ?? null;
    if (!embedded && initial && initial !== urlUnitId) {
      const nextUrl = projectId
        ? buildUnifiedWorkbenchUrl({ projectId, workId, tab: "script", unitId: initial })
        : (() => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("workId", workId);
            params.set("unitId", initial);
            return `?${params.toString()}`;
          })();
      router.replace(nextUrl, { scroll: false });
    }
    setActiveUnitId(initial);
  }, [embedded, loading, projectId, workId, units, urlUnitId, searchParams, router]);

  const activeUnit = useMemo(() => units.find((u) => u.id === activeUnitId) ?? null, [units, activeUnitId]);

  useEffect(() => {
    if (!workId || !activeUnitId) return;
    if (loadedContent[activeUnitId] !== undefined) {
      setActiveContent(loadedContent[activeUnitId]);
      return;
    }
    let cancelled = false;
    screenplayStudioApi
      .getUnit(workId, activeUnitId)
      .then((result) => {
        if (cancelled) return;
        const body = (result.content as { body?: string } | null)?.body ?? "";
        setLoadedContent((prev) => ({ ...prev, [activeUnitId]: body }));
        setActiveContent(body);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error instanceof ScreenplayStudioApiError ? error.userMessage : error instanceof Error ? error.message : "内容加载失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workId, activeUnitId, loadedContent]);

  const openUnit = useCallback(
    (unitId: string) => {
      setActiveUnitId(unitId);
      setActiveTool("draft");
      setMainView("conversation");
      setConflict(null);
      onUnitChange?.(unitId);
      if (!embedded && workId) {
        const nextUrl = projectId
          ? buildUnifiedWorkbenchUrl({ projectId, workId, tab: "script", unitId })
          : (() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("workId", workId);
              params.set("unitId", unitId);
              return `?${params.toString()}`;
            })();
        router.push(nextUrl, { scroll: false });
      }
      if (narrow) setLeftOpen(false);
    },
    [embedded, projectId, searchParams, workId, router, narrow, onUnitChange],
  );

  const createUnit = useCallback(
    async (type: "world" | "character" | "outline" | "episode" | "scene", parentId: string | null) => {
      if (!workId) return;
      if (!canCreateUnit(type, units)) {
        setLoadError(GATE_MESSAGES[type] ?? "新节点按顺序创建；已创建的节点随时可回改。");
        return;
      }
      try {
        const { unit } = await screenplayStudioApi.createUnit(workId, {
          type,
          title: "",
          parentId,
          order: units.filter((u) => u.type === type).length + 1,
        });
        setUnits((prev) => [...prev, unit]);
        openUnit(unit.id);
      } catch (error) {
        setLoadError(error instanceof ScreenplayStudioApiError ? error.userMessage : error instanceof Error ? error.message : "创建失败");
      }
    },
    [workId, units, openUnit],
  );

  const handleContentChange = useCallback(
    (body: string) => {
      setActiveContent(body);
      if (activeUnitId) setLoadedContent((prev) => ({ ...prev, [activeUnitId]: body }));
      onUnsavedChange?.(true);
    },
    [activeUnitId, onUnsavedChange],
  );

  const handleTitleChange = useCallback(
    (title: string) => {
      if (!activeUnit) return;
      setUnits((prev) => prev.map((u) => (u.id === activeUnit.id ? { ...u, title } : u)));
    },
    [activeUnit],
  );

  const saveActiveUnit = useCallback(async () => {
    if (!workId || !activeUnit) return;
    setSaving(true);
    setConflict(null);
    try {
      await screenplayStudioApi.saveUnitContent(workId, activeUnit.id, {
        content: { body: activeContent },
        baseVersionId: activeUnit.currentVersionId,
      });
      const { unit } = await screenplayStudioApi.getUnit(workId, activeUnit.id);
      setUnits((prev) => prev.map((u) => (u.id === unit.id ? unit : u)));
      onUnsavedChange?.(false);
    } catch (error) {
      if (error instanceof ScreenplayStudioApiError && error.status === 409) {
        setConflict({ currentVersionId: error.currentVersionId ?? null });
      } else {
        setLoadError(error instanceof ScreenplayStudioApiError ? error.userMessage : error instanceof Error ? error.message : "保存失败");
      }
    } finally {
      setSaving(false);
    }
  }, [workId, activeUnit, activeContent, onUnsavedChange]);

  const confirmUsable = useCallback(async () => {
    if (!workId || !activeUnit?.currentVersionId) {
      setLoadError("请先保存当前版本，再确认可用。");
      return;
    }
    setConfirming(true);
    setLoadError(null);
    try {
      const { unit } = await screenplayStudioApi.finalizeUnit(workId, activeUnit.id, activeUnit.currentVersionId);
      setUnits((prev) => prev.map((u) => (u.id === unit.id ? unit : u)));
      onUnsavedChange?.(false);
    } catch (error) {
      setLoadError(error instanceof ScreenplayStudioApiError ? error.userMessage : error instanceof Error ? error.message : "确认可用失败");
    } finally {
      setConfirming(false);
    }
  }, [workId, activeUnit, onUnsavedChange]);

  const resolveStaleEdge = useCallback(
    async (edge: StaleEdgeDto, resolution: string) => {
      if (!workId) return;
      try {
        await screenplayStudioApi.resolveStale(workId, {
          upstreamUnitId: edge.upstreamUnitId,
          downstreamUnitId: edge.downstreamUnitId,
          resolution,
        });
        const { stale } = await screenplayStudioApi.listStale(workId);
        setStaleEdges(stale);
      } catch (error) {
        setLoadError(error instanceof ScreenplayStudioApiError ? error.userMessage : error instanceof Error ? error.message : "处理失败");
      }
    },
    [workId],
  );

  const refreshUnits = useCallback(async () => {
    if (!workId) return;
    const { units: list } = await screenplayStudioApi.listUnits(workId);
    setUnits(list);
  }, [workId]);

  const runSimilarityReview = useCallback(async () => {
    if (!workId || !similarityGate.ready || similarityBusy) return;
    setSimilarityBusy(true);
    setLoadError(null);
    try {
      const body = await screenplayStudioApi.discuss(workId, {
        conversationId,
        purpose: "similarity_review",
        userMessage: `${SIMILARITY_REVIEW_PROMPT_PREFIX}：对照当前世界规则、角色关系、剧情主线和关键转折，列出可能的相似风险位置、风险原因、需要保留的类型母题，以及可执行的原创化建议。只记录核验结果，不要自动改写正文，也不做法律裁定。`,
        clientContext: "剧情及大纲 · 雷同审查（以当前已确认的大纲版本为准）",
      });
      const next = [...kkMessages];
      if (!next.some((m) => m.id === body.userMessage.id)) next.push(body.userMessage);
      if (!next.some((m) => m.id === body.assistantMessage.id)) next.push(body.assistantMessage);
      setKkMessages(next);
      setActiveTool(null); // 收起抽屉，让 KK 审查报告占据主视区
    } catch (error) {
      setLoadError(error instanceof ScreenplayStudioApiError ? error.userMessage : error instanceof Error ? error.message : "雷同审查失败");
    } finally {
      setSimilarityBusy(false);
    }
  }, [workId, similarityGate.ready, similarityBusy, conversationId, kkMessages]);

  /** 工具状态 → KK 上下文（当前对象、阶段目标、下一步）。 */
  const kkContext = useMemo(() => {
    if (activeTool === "similarity") {
      return {
        label: "雷同审查",
        detail: similarityGate.ready
          ? "以当前已确认的大纲版本为准；输出风险位置与原创化建议，不改写正文。"
          : similarityGate.reason,
      };
    }
    if (activeTool === "localization") {
      return { label: "本土化", detail: "讨论目标地区的语境、表达与制作可执行性；修改仍走候选审阅。" };
    }
    if (activeTool === "delivery") {
      return { label: "定稿与留痕", detail: "面向正式交付：样稿格式导出与创作证据包下载。" };
    }
    if (activeTool === "continuity") {
      return { label: "连续性", detail: "检查命名、设定与时间线冲突；处置动作会留痕。" };
    }
    if (activeUnit) {
      const label = UNIT_TYPE_LABELS[activeUnit.type] ?? activeUnit.type;
      const next =
        activeUnit.type === "world" ? "下一步：完善世界规则后保存并「确认可用」"
        : activeUnit.type === "character" ? "下一步：补全角色欲望、恐惧与关系，确认可用后进入大纲"
        : activeUnit.type === "outline" ? "下一步：定稿主线与转折，进行雷同审查后确认可用"
        : activeUnit.type === "episode" ? "下一步：拆分集级目标，确认可用后进入正文"
        : "下一步：逐场推进正文；修改先审阅后采用";
      const readiness = activeUnit.finalizedVersionId ? "已有可用版本" : activeUnit.currentVersionId ? "已有草稿版本" : "尚未保存";
      return { label: `${label} · ${activeUnit.title || "未命名"}`, detail: `${readiness}。${next}` };
    }
    return null;
  }, [activeTool, activeUnit, similarityGate]);

  // 导出定稿：真实导出当前单元（优先可用版本）内容。
  const exportScriptDraft = useCallback(() => {
    if (!activeUnit) {
      setExportNotice("请先选择要导出的单元。");
      return;
    }
    setExportBusy("script");
    try {
      const meta = [
        `KIIKIS 剧本导出`,
        workMeta?.projectTitle ? `项目：${workMeta.projectTitle}` : null,
        workMeta?.universeName ? `Universe：${workMeta.universeName}` : null,
        `单元：${UNIT_TYPE_LABELS[activeUnit.type] ?? activeUnit.type} · ${activeUnit.title || "未命名"}`,
        activeUnit.finalizedVersionId ? `版本：可用版本 ${activeUnit.finalizedVersionId}` : activeUnit.currentVersionId ? `版本：草稿 ${activeUnit.currentVersionId}` : "版本：尚未保存",
        `导出时间：${new Date().toLocaleString("zh-CN")}`,
      ].filter(Boolean).join("\n");
      const body = `${meta}\n${"=".repeat(36)}\n\n${activeContent || "（无内容）"}\n`;
      const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(activeUnit.title || activeUnit.type).replace(/[\\/:*?"<>|]/g, "_")}-kiikis.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportNotice("定稿草稿已导出为文本文件。");
    } finally {
      setExportBusy(null);
    }
  }, [activeUnit, activeContent, workMeta]);

  // 下载创作留痕：真实 evidence package（生成 → 签名下载链接）。
  const downloadEvidence = useCallback(async () => {
    if (!workId) return;
    setExportBusy("evidence");
    setExportNotice(null);
    try {
      const response = await fetchScreenplayStudio(`/api/v2/works/${encodeURIComponent(workId)}/evidence`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; packageId?: string; manifestHash?: string; error?: string; code?: string };
      if (!response.ok || !body.success || !body.packageId) {
        throw new Error(clientErrorMessage(String(body.code ?? "service_unavailable"), body.error ?? ""));
      }
      const dl = await fetchScreenplayStudio(`/api/v2/evidence/packages/${encodeURIComponent(body.packageId)}/download`);
      const dlBody = (await dl.json().catch(() => ({}))) as { success?: boolean; downloadUrl?: string; url?: string; error?: string; code?: string };
      if (!dl.ok || !dlBody.success || !(dlBody.downloadUrl ?? dlBody.url)) {
        throw new Error(clientErrorMessage(String(dlBody.code ?? "service_unavailable"), dlBody.error ?? ""));
      }
      window.open(String(dlBody.downloadUrl ?? dlBody.url), "_blank", "noopener");
      setExportNotice(body.manifestHash ? `证据包已生成（manifest ${body.manifestHash.slice(0, 12)}…），正在下载。` : "证据包已生成，正在下载。");
    } catch (error) {
      setExportNotice(error instanceof Error ? error.message : "证据包生成失败，请重试。");
    } finally {
      setExportBusy(null);
    }
  }, [workId]);

  const staleDownstreamIds = useMemo(() => new Set(staleEdges.map((e) => e.downstreamUnitId)), [staleEdges]);
  const unitTitleById = useCallback((id: string) => units.find((u) => u.id === id)?.title || "(未命名)", [units]);

  const stageState = useCallback(
    (stage: StudioWorkflowStage) => {
      if (stage.id === "similarity") {
        if (similarityReviewed) return "已查验";
        return similarityGate.ready ? "可查验" : "待大纲确认";
      }
      if (stage.id === "localization" || stage.id === "delivery") return "可开始";
      const type = stage.id === "screenplay" ? "scene" : stage.id;
      const matching = units.filter((unit) => unit.type === type);
      if (matching.some((unit) => unit.finalizedVersionId)) return "已确认可用";
      if (matching.length) return "创作中";
      return "未开始";
    },
    [units, similarityReviewed, similarityGate],
  );

  if (!workId) return <div className={styles.errorBar}>缺少 workId。请从项目列表进入，或先创建一个 Work。</div>;
  if (loading) return <div className={styles.loading}>剧本工作台加载中…</div>;

  const breadcrumb = [
    workMeta?.projectTitle ?? workMeta?.title ?? "项目",
    workMeta?.universeName ? `Universe · ${workMeta.universeName}` : null,
    activeUnit ? `${UNIT_TYPE_LABELS[activeUnit.type] ?? activeUnit.type}${activeUnit.title ? ` · ${activeUnit.title}` : ""}` : null,
  ].filter(Boolean) as string[];

  const toolContent = activeTool === "draft" ? (
    <ScreenplayEditor
      unit={activeUnit}
      content={activeContent}
      saving={saving}
      conflict={conflict}
      confirming={confirming}
      onContentChange={handleContentChange}
      onTitleChange={handleTitleChange}
      onSave={saveActiveUnit}
      onConfirmUsable={confirmUsable}
    />
  ) : activeTool === "similarity" ? (
    <div className={styles.toolContent} data-testid="similarity-review">
      <div className={styles.toolEyebrow}>剧情及大纲 · 进入正文前</div>
      <h2>雷同审查</h2>
      <p>KK 会核对世界规则、角色关系、剧情主线和关键转折，输出风险位置与原创化建议。核验结果只作为创作证据，不做法律裁定，也不会自动改写正文。</p>
      <div className={styles.reviewStatus}>
        {similarityReviewed ? "已查验 · 结果已留痕在当前对话与证据记录" : similarityGate.ready ? "尚未查验 · 大纲已确认可用，可以开始" : similarityGate.reason}
      </div>
      <button
        type="button"
        className={styles.primaryToolBtn}
        onClick={() => void runSimilarityReview()}
        disabled={similarityBusy || !similarityGate.ready}
        aria-disabled={!similarityGate.ready}
      >
        {similarityBusy ? "查验中…" : similarityReviewed ? "重新查验" : "开始雷同审查"}
      </button>
      {!similarityGate.ready ? <p className={styles.toolNotice}>{similarityGate.reason}</p> : null}
    </div>
  ) : activeTool === "localization" ? (
    <div className={styles.toolContent} data-testid="localization-stage">
      <div className={styles.toolEyebrow}>剧本正文之后</div>
      <h2>本土化</h2>
      <p>在保留人物动机和剧情事实的前提下，和 KK 讨论目标地区的语境、表达、表演节奏与制作可执行性；任何修改仍先生成方案，再逐块采用。</p>
      <button
        type="button"
        className={styles.primaryToolBtn}
        onClick={() => {
          setPresetInput({
            text: "请围绕目标地区做本土化评估：指出当前正文中语境、表达、文化引用和表演节奏上需要调整的位置，并给出可执行的修改建议（先方案，不改写）。",
            mode: "discuss",
            contextLabel: "本土化",
          });
          setActiveTool(null);
        }}
      >
        开始本土化讨论
      </button>
      <div className={styles.toolNotice}>本土化不会改变 Universe Canon，也不会覆盖原始版本。</div>
    </div>
  ) : activeTool === "delivery" ? (
    <div className={styles.toolContent} data-testid="delivery-stage">
      <div className={styles.toolEyebrow}>贯穿工作台的最终输出</div>
      <h2>定稿与创作留痕</h2>
      <p>正式交付使用样稿格式：标题与集数信息、灰色 ESCENA 场次带、INT/EXT 场景行、角色台词与中文括注、表演备注、镜头时长、Final Hook、最后三秒和 EPxx FIN。</p>
      <div className={styles.deliveryActions}>
        <button type="button" className={styles.primaryToolBtn} onClick={exportScriptDraft} disabled={exportBusy === "script"}>
          {exportBusy === "script" ? "导出中…" : "导出定稿（当前单元）"}
        </button>
        <button type="button" className={styles.primaryToolBtn} onClick={() => void downloadEvidence()} disabled={exportBusy === "evidence"}>
          {exportBusy === "evidence" ? "生成证据包…" : "下载创作留痕（证据包）"}
        </button>
      </div>
      {exportNotice ? <div className={styles.toolNotice}>{exportNotice}</div> : null}
      <div className={styles.toolNotice}>只有用户确认可用的版本会进入正式交付；历史版本、对话、候选修改和处置记录一并保留。</div>
    </div>
  ) : activeTool === "continuity" ? (
    <div className={styles.toolContent}><ContinuityPanel workId={workId} findings={findings} unitTitleById={unitTitleById} onOpenUnit={openUnit} onFindingsChange={setFindings} /></div>
  ) : activeTool === "references" ? (
    <div className={styles.toolContent}><ReferenceList references={references} onOpenSource={(reference) => openUnit(reference.id)} /></div>
  ) : activeTool === "versions" ? (
    <div className={styles.toolContent}>
      <div className={styles.toolEyebrow}>不可变版本</div>
      <h2>{TOOL_LABELS.versions}</h2>
      <p>当前版本：{activeUnit?.currentVersionId ?? "未保存"}</p>
      <p>可用版本：{activeUnit?.finalizedVersionId ?? "尚未确认"}</p>
      <div className={styles.toolNotice}>修改会创建子版本，不覆盖历史版本；上游更新只标 stale，保留下游内容。</div>
    </div>
  ) : null;

  const kkPanel = (
    <KkScreenplayRoom
      workId={workId}
      conversationId={conversationId}
      messages={kkMessages}
      pendingCandidate={kkCandidate}
      contextSummary={kkContext}
      presetInput={presetInput}
      onPresetConsumed={() => setPresetInput(null)}
      onMessagesChange={setKkMessages}
      onCandidateChange={(candidate) => {
        setKkCandidate(candidate);
        setMainView(candidate ? "diff" : "conversation");
      }}
      onAppliedVersion={async () => {
        try { await refreshUnits(); } catch { /* best-effort refresh */ }
        setMainView("conversation");
      }}
      onInputPreserved={setPreservedInput}
      preservedInput={preservedInput}
    />
  );

  return (
    <div className={`${styles.studio} ${embedded ? styles.embedded : ""} ${narrow ? styles.narrow : ""}`} data-testid="screenplay-studio">
      {narrow ? <button type="button" className={`${styles.narrowToggle} ${styles.structureToggle}`} aria-label="打开结构导航" onClick={() => setLeftOpen(true)}>☰ 结构</button> : null}
      <aside className={`${styles.leftPanel} ${narrow && leftOpen ? styles.open : ""}`} data-testid="studio-left">
        <div className={styles.panelHeader}>
          <strong>剧本流程</strong>
          {narrow ? <button type="button" className={styles.narrowToggle} onClick={() => setLeftOpen(false)}>收起</button> : null}
        </div>
        <UnitNavigator
          units={units}
          activeUnitId={activeUnitId}
          staleDownstreamUnitIds={staleDownstreamIds}
          onOpenUnit={openUnit}
          onCreateUnit={createUnit}
          onOpenSimilarity={() => setActiveTool("similarity")}
          similarityReviewed={similarityReviewed}
          similarityActive={activeTool === "similarity"}
          similarityReady={similarityGate.ready}
          similarityReason={similarityGate.reason}
        />
      </aside>
      {narrow && leftOpen ? <button type="button" className={styles.drawerScrim} aria-label="关闭抽屉" data-open="show" onClick={() => setLeftOpen(false)} /> : null}
      <main className={styles.centerPanel} data-testid="studio-center">
        <div className={styles.workspaceBar}>
          <nav className={styles.breadcrumb} aria-label="项目位置" data-testid="studio-breadcrumb">
            {breadcrumb.map((item, index) => (
              <span key={`${item}-${index}`} className={styles.breadcrumbItem}>{index > 0 ? <span className={styles.breadcrumbSep}>/</span> : null}{item}</span>
            ))}
          </nav>
          <details className={styles.workspaceTools}>
            <summary>工具</summary>
            <div className={styles.workspaceToolsMenu}>
              {(["draft", "similarity", "localization", "delivery", "continuity", "references", "versions"] as const).map((tool) => (
                <button
                  key={tool}
                  type="button"
                  className={`${styles.toolToggle} ${activeTool === tool || (tool === "draft" && mainView === "document") ? styles.active : ""}`}
                  onClick={() => {
                    if (tool === "draft") {
                      setActiveTool(null);
                      setMainView(mainView === "document" ? "conversation" : "document");
                      return;
                    }
                    setMainView("conversation");
                    setActiveTool(activeTool === tool ? null : tool);
                  }}
                >
                  {TOOL_LABELS[tool]}
                </button>
              ))}
            </div>
          </details>
        </div>
        {!embedded ? (
        <div className={styles.workflowStrip} aria-label="剧本工作流">
          {SCREENPLAY_STUDIO_WORKFLOW_STAGES.map((stage, index) => (
            <div key={stage.id} className={`${styles.workflowStage} ${stage.parent ? styles.workflowSubStage : ""}`} data-stage={stage.id}>
              <span className={styles.workflowStageIndex}>{stage.parent ? "↳" : index + 1}</span><span>{stage.label}</span><small>{stageState(stage)}</small>
            </div>
          ))}
        </div>
        ) : null}
        <section className={styles.aiPanel} data-testid="studio-ai" data-main-view={mainView}>
          {mainView === "document" ? (
            <div data-testid="main-view-document">
              <ScreenplayEditor
                unit={activeUnit}
                content={activeContent}
                saving={saving}
                conflict={conflict}
                confirming={confirming}
                onContentChange={handleContentChange}
                onTitleChange={handleTitleChange}
                onSave={saveActiveUnit}
                onConfirmUsable={confirmUsable}
              />
            </div>
          ) : mainView === "diff" ? (
            <div data-testid="main-view-diff">{kkPanel}</div>
          ) : (
            <div data-testid="main-view-conversation">{kkPanel}</div>
          )}
        </section>
        {activeTool && activeTool !== "draft" ? (
          <section className={styles.toolDrawer} data-testid="studio-tool-drawer">
            <div className={styles.toolDrawerHeader}>
              <strong>{TOOL_LABELS[activeTool]}</strong>
              <button type="button" className={styles.toolClose} onClick={() => setActiveTool(null)}>收起</button>
            </div>
            {toolContent}
          </section>
        ) : null}
        {loadError ? <div className={styles.errorBar} role="alert">{loadError}<button type="button" className={styles.errorDismiss} onClick={() => setLoadError(null)}>关闭</button></div> : null}
      </main>
    </div>
  );
}
