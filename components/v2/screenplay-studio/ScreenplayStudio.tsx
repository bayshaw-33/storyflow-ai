"use client";

/**
 * V2.2 AI-first screenplay studio.
 *
 * The left rail is the screenplay workflow. The right side is deliberately
 * dominated by the KK conversation; document editing, continuity, references
 * and delivery notes open as contextual docks inside the same two-column page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  screenplayStudioApi,
  ScreenplayStudioApiError,
  type ScreenplayUnitClientDto,
  type StaleEdgeDto,
} from "@/lib/client/v2/screenplay-studio/api";
import { fetchScreenplayStudio } from "@/lib/client/v2/screenplay-studio/auth";
import {
  canCreateUnit,
  SCREENPLAY_STUDIO_WORKFLOW_STAGES,
  type StudioWorkflowStage,
} from "@/lib/client/v2/screenplay-studio/types";
import { UnitNavigator } from "./UnitNavigator";
import { ScreenplayEditor } from "./ScreenplayEditor";
import { KkScreenplayRoom, type KkCandidate, type KkMessage } from "./KkScreenplayRoom";
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

const GATE_MESSAGES: Record<string, string> = {
  character: "请先完成并确认世界观可用版本。",
  outline: "请先完成并确认世界观、角色圣经可用版本。",
  episode: "请先完成三部曲并确认可用版本。",
  scene: "请先完成三部曲和分集计划，并确认可用版本。",
};

export function ScreenplayStudio() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
  const [kkMessages, setKkMessages] = useState<KkMessage[]>([]);
  const [kkCandidate, setKkCandidate] = useState<KkCandidate | null>(null);
  const [preservedInput, setPreservedInput] = useState("");
  const [findings, setFindings] = useState<ContinuityFindingDto[]>([]);
  const [references, setReferences] = useState<PacketReferenceDto[]>([]);
  const [similarityReviewed, setSimilarityReviewed] = useState(false);
  const [similarityBusy, setSimilarityBusy] = useState(false);
  const bootstrappedRef = useRef(false);

  const workId = searchParams.get("workId");
  const urlUnitId = searchParams.get("unitId");
  const conversationId = useMemo(() => `kk-${workId ?? "default"}`, [workId]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

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
    setSimilarityReviewed(false);
    setActiveTool(null);
    if (!workId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const [{ units: list }, { stale }] = await Promise.all([
          screenplayStudioApi.listUnits(workId),
          screenplayStudioApi.listStale(workId).catch(() => ({ stale: [] as StaleEdgeDto[] })),
        ]);
        if (cancelled) return;
        setUnits(list);
        setStaleEdges(stale);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workId]);

  useEffect(() => {
    if (loading || !workId || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const initial = urlUnitId && units.some((u) => u.id === urlUnitId) ? urlUnitId : units[0]?.id ?? null;
    if (initial && initial !== urlUnitId) {
      router.replace(`?workId=${encodeURIComponent(workId)}&unitId=${encodeURIComponent(initial)}`, { scroll: false });
    }
    setActiveUnitId(initial);
  }, [loading, workId, units, urlUnitId, router]);

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
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "内容加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [workId, activeUnitId, loadedContent]);

  const openUnit = useCallback(
    (unitId: string) => {
      setActiveUnitId(unitId);
      setActiveTool("draft");
      setConflict(null);
      if (workId) router.push(`?workId=${encodeURIComponent(workId)}&unitId=${encodeURIComponent(unitId)}`, { scroll: false });
      if (narrow) setLeftOpen(false);
    },
    [workId, router, narrow],
  );

  const createUnit = useCallback(
    async (type: "world" | "character" | "outline" | "episode" | "scene", parentId: string | null) => {
      if (!workId) return;
      if (!canCreateUnit(type, units)) {
        setLoadError(GATE_MESSAGES[type] ?? "请先完成当前工作流的前置阶段。");
        return;
      }
      try {
        const response = await fetchScreenplayStudio(`/api/v2/works/${encodeURIComponent(workId)}/screenplay/units`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, title: "", parentId, order: units.filter((u) => u.type === type).length + 1 }),
        });
        const body = (await response.json().catch(() => ({}))) as { success?: boolean; unit?: ScreenplayUnitClientDto; error?: string };
        if (!response.ok || !body.success || !body.unit) throw new Error(body.error ?? `创建失败 (${response.status})`);
        setUnits((prev) => [...prev, body.unit!]);
        openUnit(body.unit.id);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "创建失败");
      }
    },
    [workId, units, openUnit],
  );

  const handleContentChange = useCallback(
    (body: string) => {
      setActiveContent(body);
      if (activeUnitId) setLoadedContent((prev) => ({ ...prev, [activeUnitId]: body }));
    },
    [activeUnitId],
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
    } catch (error) {
      if (error instanceof ScreenplayStudioApiError && error.status === 409) {
        setConflict({ currentVersionId: error.currentVersionId ?? null });
      } else {
        setLoadError(error instanceof Error ? error.message : "保存失败");
      }
    } finally {
      setSaving(false);
    }
  }, [workId, activeUnit, activeContent]);

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
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "确认可用失败");
    } finally {
      setConfirming(false);
    }
  }, [workId, activeUnit]);

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
        setLoadError(error instanceof Error ? error.message : "处理失败");
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
    if (!workId) return;
    const outline = units.find((unit) => unit.type === "outline");
    if (!outline) {
      setLoadError("请先创建剧情及大纲，再进行雷同审查。");
      return;
    }
    setSimilarityBusy(true);
    setLoadError(null);
    try {
      const response = await fetchScreenplayStudio(`/api/v2/works/${encodeURIComponent(workId)}/screenplay/discuss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          userMessage: "请执行剧情及大纲阶段的雷同审查：对照当前世界规则、角色关系、剧情主线和关键转折，列出可能的相似风险位置、风险原因、需要保留的类型母题，以及可执行的原创化建议。只记录核验结果，不要自动改写正文，也不做法律裁定。",
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; userMessage?: KkMessage; assistantMessage?: KkMessage };
      if (!response.ok || !body.success) throw new Error(body.error ?? "雷同审查失败");
      const next = [...kkMessages];
      if (body.userMessage) next.push(body.userMessage);
      if (body.assistantMessage) next.push(body.assistantMessage);
      setKkMessages(next);
      setSimilarityReviewed(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "雷同审查失败");
    } finally {
      setSimilarityBusy(false);
    }
  }, [workId, units, conversationId, kkMessages]);

  const staleDownstreamIds = useMemo(() => new Set(staleEdges.map((e) => e.downstreamUnitId)), [staleEdges]);
  const unitTitleById = useCallback((id: string) => units.find((u) => u.id === id)?.title || "(未命名)", [units]);

  const stageState = useCallback(
    (stage: StudioWorkflowStage) => {
      if (stage.id === "similarity") return similarityReviewed ? "已查验" : "待查验";
      if (stage.id === "localization" || stage.id === "delivery") return "可开始";
      const type = stage.id === "screenplay" ? "scene" : stage.id;
      const matching = units.filter((unit) => unit.type === type);
      if (matching.some((unit) => unit.finalizedVersionId)) return "已确认可用";
      if (matching.length) return "创作中";
      return "未开始";
    },
    [units, similarityReviewed],
  );

  if (!workId) return <div className={styles.errorBar}>缺少 workId。请从项目列表进入，或先创建一个 Work。</div>;
  if (loading) return <div className={styles.loading}>剧本工作台加载中…</div>;

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
      <div className={styles.reviewStatus}>{similarityReviewed ? "已查验 · 结果已留痕在当前对话" : "尚未查验"}</div>
      <button type="button" className={styles.primaryToolBtn} onClick={() => void runSimilarityReview()} disabled={similarityBusy}>
        {similarityBusy ? "查验中…" : similarityReviewed ? "重新查验" : "开始雷同审查"}
      </button>
    </div>
  ) : activeTool === "localization" ? (
    <div className={styles.toolContent} data-testid="localization-stage">
      <div className={styles.toolEyebrow}>剧本正文之后</div>
      <h2>本土化</h2>
      <p>在保留人物动机和剧情事实的前提下，和 KK 讨论目标地区的语境、表达、表演节奏与制作可执行性；任何修改仍先生成方案，再逐块采用。</p>
      <div className={styles.toolNotice}>本土化不会改变 Universe Canon，也不会覆盖原始版本。</div>
    </div>
  ) : activeTool === "delivery" ? (
    <div className={styles.toolContent} data-testid="delivery-stage">
      <div className={styles.toolEyebrow}>贯穿工作台的最终输出</div>
      <h2>定稿与创作留痕</h2>
      <p>正式交付使用样稿格式：标题与集数信息、灰色 ESCENA 场次带、INT/EXT 场景行、角色台词与中文括注、表演备注、镜头时长、Final Hook、最后三秒和 EPxx FIN。</p>
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

  return (
    <div className={`${styles.studio} ${narrow ? styles.narrow : ""}`} data-testid="screenplay-studio">
      {narrow ? <button type="button" className={styles.narrowToggle} aria-label="打开结构导航" onClick={() => setLeftOpen(true)}>☰ 结构</button> : null}
      <aside className={`${styles.leftPanel} ${narrow && leftOpen ? styles.open : ""}`} data-testid="studio-left">
        <div className={styles.panelHeader}>
          <div><div className={styles.panelKicker}>KIIKIS V2.2</div><strong>剧本创作路径</strong></div>
          {narrow ? <button type="button" className={styles.narrowToggle} onClick={() => setLeftOpen(false)}>收起</button> : null}
        </div>
        <div className={styles.navigatorIntro}>先完成三部曲，再进入正文。每一步都可以回退修改。</div>
        <UnitNavigator
          units={units}
          activeUnitId={activeUnitId}
          staleDownstreamUnitIds={staleDownstreamIds}
          onOpenUnit={openUnit}
          onCreateUnit={createUnit}
          onOpenSimilarity={() => setActiveTool("similarity")}
          similarityReviewed={similarityReviewed}
        />
      </aside>
      {narrow && (leftOpen || activeTool) ? <button type="button" className={styles.drawerScrim} aria-label="关闭抽屉" data-open="show" onClick={() => { setLeftOpen(false); setActiveTool(null); }} /> : null}
      <main className={styles.centerPanel} data-testid="studio-center">
        <header className={styles.workspaceHeader}>
          <div className={styles.workspaceHeading}>
            <div className={styles.workspaceKicker}>AI-FIRST SCREENPLAY STUDIO</div>
            <h1>{activeUnit?.title || "从三部曲开始你的剧本"}</h1>
            <p>和 KK 对话推进创作，正文只在你审阅并采用后改变。</p>
          </div>
          <div className={styles.workspaceActions}>
            {(["draft", "similarity", "localization", "delivery", "continuity", "references", "versions"] as const).map((tool) => (
              <button key={tool} type="button" className={`${styles.toolToggle} ${activeTool === tool ? styles.active : ""}`} onClick={() => setActiveTool(activeTool === tool ? null : tool)}>{TOOL_LABELS[tool]}</button>
            ))}
          </div>
        </header>
        <div className={styles.workflowStrip} aria-label="剧本工作流">
          {SCREENPLAY_STUDIO_WORKFLOW_STAGES.map((stage, index) => (
            <div key={stage.id} className={`${styles.workflowStage} ${stage.parent ? styles.workflowSubStage : ""}`} data-stage={stage.id}>
              <span className={styles.workflowStageIndex}>{stage.parent ? "↳" : index + 1}</span><span>{stage.label}</span><small>{stageState(stage)}</small>
            </div>
          ))}
        </div>
        <section className={styles.aiPanel} data-testid="studio-ai">
          <div className={styles.aiPanelHeader}>
            <div><span className={styles.aiPanelTitle}>KK 剧本伙伴</span><span className={styles.aiPanelHint}>聊一聊只讨论；生成修改方案必须逐块审阅</span></div>
            <span className={styles.liveBadge}>对话优先</span>
          </div>
          <KkScreenplayRoom
            workId={workId}
            conversationId={conversationId}
            messages={kkMessages}
            pendingCandidate={kkCandidate}
            onMessagesChange={setKkMessages}
            onCandidateChange={setKkCandidate}
            onAppliedVersion={async () => { try { await refreshUnits(); } catch { /* best-effort refresh */ } }}
            onInputPreserved={setPreservedInput}
            preservedInput={preservedInput}
          />
        </section>
        {activeTool ? <section className={styles.toolDrawer} data-testid="studio-tool-drawer"><div className={styles.toolDrawerHeader}><strong>{TOOL_LABELS[activeTool]}</strong><button type="button" className={styles.toolClose} onClick={() => setActiveTool(null)}>收起</button></div>{toolContent}</section> : (
          <div className={styles.toolTray}><span>当前内容与辅助工具</span><button type="button" onClick={() => setActiveTool("draft")}>打开当前文档</button><button type="button" onClick={() => setActiveTool("similarity")}>在大纲阶段查验雷同</button><button type="button" onClick={() => setActiveTool("localization")}>准备本土化</button><button type="button" onClick={() => setActiveTool("delivery")}>查看定稿与留痕</button></div>
        )}
        {loadError ? <div className={styles.errorBar} role="alert">{loadError}<button type="button" className={styles.errorDismiss} onClick={() => setLoadError(null)}>关闭</button></div> : null}
      </main>
    </div>
  );
}
