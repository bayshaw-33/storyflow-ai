"use client";

/**
 * ScreenplayStudio — Phase 3 Task 3.3 三栏剧本室主组件。
 *
 * 左：UnitNavigator（世界观/角色/大纲/分集/正文树，自由导航无门禁）
 * 中：ScreenplayEditor（当前文档编辑，保存创建 Unit Version）
 * 右：StudioRightPanel（KK / 引用 / 版本 / 连续性）
 *
 * URL 状态 ?workId=&unitId=：刷新/后退/重开恢复同一写作位置。
 * 窄屏：左右栏收为抽屉，编辑状态不丢。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  screenplayStudioApi,
  ScreenplayStudioApiError,
  type ScreenplayUnitClientDto,
  type StaleEdgeDto,
} from "@/lib/client/v2/screenplay-studio/api";
import { parseStudioUrl } from "@/lib/client/v2/screenplay-studio/types";
import { fetchScreenplayStudio } from "@/lib/client/v2/screenplay-studio/auth";
import { UnitNavigator } from "./UnitNavigator";
import { ScreenplayEditor } from "./ScreenplayEditor";
import { StudioRightPanel } from "./StudioRightPanel";
import { KkScreenplayRoom, type KkMessage, type KkCandidate } from "./KkScreenplayRoom";
import { ContinuityPanel, type ContinuityFindingDto } from "./ContinuityPanel";
import { ReferenceList, type PacketReferenceDto } from "./ReferenceList";
import styles from "./ScreenplayStudio.module.css";

const NEXT_PARENT_TYPE: Record<string, "world" | "character" | "outline" | "episode" | "scene" | null> = {
  world: null,
  character: null,
  outline: "episode",
  episode: "scene",
  scene: null,
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
  const [rightOpen, setRightOpen] = useState(false);
  const [kkMessages, setKkMessages] = useState<KkMessage[]>([]);
  const [kkCandidate, setKkCandidate] = useState<KkCandidate | null>(null);
  const [preservedInput, setPreservedInput] = useState("");
  const [findings, setFindings] = useState<ContinuityFindingDto[]>([]);
  const [references, setReferences] = useState<PacketReferenceDto[]>([]);
  const bootstrappedRef = useRef(false);

  const workId = searchParams.get("workId");
  const urlUnitId = searchParams.get("unitId");
  const conversationId = useMemo(() => `kk-${workId ?? "default"}`, [workId]);

  // Responsive: 390/768/1440/2560 no horizontal overflow; drawers on narrow.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Load units + stale edges once per workId.
  useEffect(() => {
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

  // Bootstrap active unit from URL; default to first unit.
  useEffect(() => {
    if (loading || !workId) return;
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const initial = urlUnitId && units.some((u) => u.id === urlUnitId) ? urlUnitId : units[0]?.id ?? null;
    if (initial && initial !== urlUnitId) {
      router.replace(`?workId=${encodeURIComponent(workId)}&unitId=${encodeURIComponent(initial)}`, { scroll: false });
    }
    setActiveUnitId(initial);
  }, [loading, workId, units, urlUnitId, router]);

  const activeUnit = useMemo(() => units.find((u) => u.id === activeUnitId) ?? null, [units, activeUnitId]);

  // Load content when switching units (cache preserves unsaved edits per unit).
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
      setConflict(null);
      if (workId) {
        router.push(`?workId=${encodeURIComponent(workId)}&unitId=${encodeURIComponent(unitId)}`, { scroll: false });
      }
      if (narrow) setLeftOpen(false);
    },
    [workId, router, narrow],
  );

  const createUnit = useCallback(
    async (type: "world" | "character" | "outline" | "episode" | "scene", parentId: string | null) => {
      if (!workId) return;
      try {
        // The screenplay collection POST adapts legacy; creation uses units endpoint semantics:
        // we append via saveUnitContent-free create by posting identity fields.
        const response = await fetchScreenplayStudio(`/api/v2/works/${encodeURIComponent(workId)}/screenplay/units`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, title: "", parentId, order: units.filter((u) => u.type === type).length + 1 }),
        });
        const body = (await response.json().catch(() => ({}))) as { success?: boolean; unit?: ScreenplayUnitClientDto; error?: string };
        if (!response.ok || !body.success || !body.unit) {
          throw new Error(body.error ?? `创建失败 (${response.status})`);
        }
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
    if (!workId || !activeUnit) return;
    if (!activeUnit.currentVersionId) return;
    setConfirming(true);
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

  const staleDownstreamIds = useMemo(() => new Set(staleEdges.map((e) => e.downstreamUnitId)), [staleEdges]);
  const unitTitleById = useCallback((id: string) => units.find((u) => u.id === id)?.title || "(未命名)", [units]);

  if (!workId) {
    return (
      <div className={styles.errorBar}>
        缺少 workId。请从项目列表进入，或先创建一个 Work。
      </div>
    );
  }

  if (loading) return <div className={styles.loading}>剧本室加载中…</div>;

  return (
    <div className={`${styles.studio} ${narrow ? styles.narrow : ""}`} data-testid="screenplay-studio">
      {narrow ? (
        <button
          type="button"
          className={styles.narrowToggle}
          aria-label="打开结构导航"
          onClick={() => setLeftOpen(true)}
          style={{ position: "absolute", top: 8, left: 8, zIndex: 20 }}
        >
          ☰ 结构
        </button>
      ) : null}
      <div className={`${styles.leftPanel} ${narrow && leftOpen ? styles.open : ""}`} data-testid="studio-left">
        <div className={styles.panelHeader}>
          <span>剧本结构</span>
          {narrow ? (
            <button type="button" className={styles.narrowToggle} onClick={() => setLeftOpen(false)}>
              收起
            </button>
          ) : null}
        </div>
        <UnitNavigator
          units={units}
          activeUnitId={activeUnitId}
          staleDownstreamUnitIds={staleDownstreamIds}
          onOpenUnit={openUnit}
          onCreateUnit={createUnit}
        />
      </div>
      {narrow ? (
        <button
          type="button"
          className={styles.drawerScrim}
          aria-label="关闭抽屉"
          data-open={leftOpen || rightOpen ? "show" : undefined}
          onClick={() => {
            setLeftOpen(false);
            setRightOpen(false);
          }}
        />
      ) : null}
      <main className={styles.centerPanel} data-testid="studio-center">
        <ScreenplayEditor
          unit={activeUnit}
          content={activeContent}
          saving={saving}
          confirming={confirming}
          conflict={conflict}
          onContentChange={handleContentChange}
          onTitleChange={handleTitleChange}
          onSave={saveActiveUnit}
          onConfirmUsable={confirmUsable}
        />
      </main>
      <div className={`${styles.rightPanel} ${narrow && rightOpen ? styles.open : ""}`} data-testid="studio-right">
        {narrow ? (
          <button type="button" className={styles.narrowToggle} onClick={() => setRightOpen(false)}>
            收起
          </button>
        ) : null}
        <StudioRightPanel
          staleEdges={staleEdges}
          unitTitleById={unitTitleById}
          onResolveStale={resolveStaleEdge}
          currentVersionId={activeUnit?.currentVersionId ?? null}
          finalizedVersionId={activeUnit?.finalizedVersionId ?? null}
          references={<ReferenceList references={references} onOpenSource={() => openUnit(activeUnitId ?? "")} />}
          kkRoom={
            workId ? (
              <KkScreenplayRoom
                workId={workId}
                conversationId={conversationId}
                messages={kkMessages}
                pendingCandidate={kkCandidate}
                onMessagesChange={setKkMessages}
                onCandidateChange={setKkCandidate}
                onAppliedVersion={async (versionId) => {
                  // refresh units to reflect the new work version pointer
                  try {
                    const { units: list } = await screenplayStudioApi.listUnits(workId);
                    setUnits(list);
                  } catch {
                    /* refresh best-effort; version id recorded */
                  }
                  void versionId;
                }}
                onInputPreserved={setPreservedInput}
                preservedInput={preservedInput}
              />
            ) : null
          }
          continuityPanel={
            workId ? (
              <ContinuityPanel
                workId={workId}
                findings={findings}
                unitTitleById={unitTitleById}
                onOpenUnit={openUnit}
                onFindingsChange={setFindings}
              />
            ) : null
          }
        />
      </div>
      {narrow ? (
        <button
          type="button"
          className={styles.narrowToggle}
          aria-label="打开右栏面板"
          onClick={() => setRightOpen(true)}
          style={{ position: "absolute", top: 8, right: 8, zIndex: 20 }}
        >
          KK ▸
        </button>
      ) : null}
      {loadError ? <div className={styles.errorBar} role="alert">{loadError}</div> : null}
    </div>
  );
}
