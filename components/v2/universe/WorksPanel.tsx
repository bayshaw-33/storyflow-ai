"use client";

// 交付物 4：作品页
// 关联作品列表，显示继承关系和衍生关系。
// Phase 2 Task 2.5 Step 3：新增"从 Universe 创建 Work"入口——
// 选择 Work 类型和关系后跳转 project-start（带 universeId + relation 参数），
// project-start 创建 Work 时调用 Task 2.2 绑定，进入工作台时 Manifest 已存在。

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Film, GitBranch, Link2, Copy, Loader2, Plus, RefreshCw, ChevronUp } from "lucide-react";
import type {
  InheritanceDiffResultV22,
  UniverseBundleV2,
  WorkInheritanceStateV22,
  WorkLink,
  V22WorkRelation,
  V22CanonPolicy,
} from "@/lib/client/v2/universe/types";
import { V22_WORK_RELATIONS, V22_CANON_POLICIES } from "@/lib/client/v2/universe/types";
import {
  adoptInheritanceDiffs,
  fetchInheritanceDiff,
  fetchWorkInheritanceState,
  isUnauthenticatedError,
  UNIVERSE_API_ERROR_CODES,
  UniverseApiError,
  USE_FIXTURE,
} from "@/lib/client/v2/universe/api";
import styles from "./universe.module.css";
import { GuideHint } from "./shared";

const RELATIONSHIP_META: Record<WorkLink["relationship"], { label: string; icon: typeof GitBranch; color: string }> = {
  inherited: { label: "继承", icon: GitBranch, color: "#6de7df" },
  derived: { label: "衍生", icon: Copy, color: "#c792ea" },
  referenced: { label: "引用", icon: Link2, color: "#ffd166" },
};

// V22 关系选项（与 BindingDialog 一致）。
const V22_RELATION_LABELS: Record<V22WorkRelation, string> = {
  canon_continuation: "正史续作",
  prequel: "前传",
  sequel: "续作",
  spinoff: "衍生",
  adaptation: "改编",
  parallel: "平行",
};

// 可创建的 Work 类型（对齐 WorkbenchAdapter.workbenchType）。
const WORK_TYPE_OPTIONS = [
  { value: "script", label: "剧本" },
  { value: "art", label: "美术" },
  { value: "production", label: "制片" },
  { value: "video", label: "视频" },
  { value: "song", label: "音乐" },
] as const;

type InheritanceEntry = {
  status: "loading" | "bound" | "unbound" | "error" | "preview";
  state?: WorkInheritanceStateV22;
  diff?: InheritanceDiffResultV22;
  error?: string;
  busy?: boolean;
};

export function WorksPanel({ bundle }: { bundle: UniverseBundleV2 }) {
  const { works, universe } = bundle;
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [workType, setWorkType] = useState<string>("script");
  const [relation, setRelation] = useState<V22WorkRelation>("canon_continuation");
  const [canonPolicy, setCanonPolicy] = useState<V22CanonPolicy>("strict");
  const [inheritanceByWork, setInheritanceByWork] = useState<Record<string, InheritanceEntry>>({});

  const updateInheritance = useCallback((workId: string, patch: Partial<InheritanceEntry>) => {
    setInheritanceByWork((current) => ({
      ...current,
      [workId]: { ...(current[workId] ?? { status: "loading" }), ...patch },
    }));
  }, []);

  const loadInheritance = useCallback(async (workId: string) => {
    if (USE_FIXTURE) {
      updateInheritance(workId, { status: "preview", busy: false, error: undefined });
      return;
    }
    updateInheritance(workId, { status: "loading", busy: true, error: undefined, diff: undefined });
    try {
      const state = await fetchWorkInheritanceState(workId);
      updateInheritance(workId, { status: "bound", state, busy: false });
    } catch (error) {
      if (error instanceof UniverseApiError && error.code === UNIVERSE_API_ERROR_CODES.NOT_FOUND) {
        updateInheritance(workId, { status: "unbound", busy: false });
        return;
      }
      updateInheritance(workId, {
        status: "error",
        busy: false,
        error: isUnauthenticatedError(error)
          ? "请登录后查看继承状态。"
          : error instanceof Error
            ? error.message
            : "继承状态加载失败。",
      });
    }
  }, [updateInheritance]);

  useEffect(() => {
    setInheritanceByWork((current) => {
      const next: Record<string, InheritanceEntry> = {};
      for (const work of works) {
        next[work.id] = current[work.id] ?? { status: "loading" };
      }
      return next;
    });
    void Promise.all(works.map((work) => loadInheritance(work.id)));
  }, [works, loadInheritance]);

  const loadDiff = useCallback(async (workId: string) => {
    updateInheritance(workId, { busy: true, error: undefined });
    try {
      const diff = await fetchInheritanceDiff(workId);
      updateInheritance(workId, { diff, busy: false });
    } catch (error) {
      updateInheritance(workId, {
        busy: false,
        error: error instanceof Error ? error.message : "继承差异加载失败。",
      });
    }
  }, [updateInheritance]);

  const adoptAvailableDiffs = useCallback(async (workId: string, diff: InheritanceDiffResultV22) => {
    const diffIds = diff.diffs
      .filter((item) => item.impact !== "conflict")
      .map((item) => item.diffId);
    if (diffIds.length === 0) return;
    updateInheritance(workId, { busy: true, error: undefined });
    try {
      await adoptInheritanceDiffs(workId, { diffIds });
      await loadInheritance(workId);
    } catch (error) {
      updateInheritance(workId, {
        busy: false,
        error: error instanceof Error ? error.message : "采用变更失败。",
      });
    }
  }, [loadInheritance, updateInheritance]);

  // 从 Universe 创建 Work：跳转 project-start 并携带绑定参数。
  // project-start 创建 Work 后读取这些参数调用 Task 2.2 绑定 API，
  // 确保进入工作台时 Manifest 已存在。
  const handleCreateWork = () => {
    const params = new URLSearchParams({
      universeId: universe.id,
      relation,
      canonPolicy,
      workType,
    });
    router.push(`/project-start?${params.toString()}`);
  };

  return (
    <div>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <Film size={16} />
            关联作品
            <span className={styles.cardCount}>共 {works.length} 个</span>
          </h2>
          {/* Phase 2 Task 2.5 Step 3: 从 Universe 创建 Work 入口 */}
          <button
            type="button"
            className={styles.createWorkToggle}
            onClick={() => setShowCreate((v) => !v)}
            aria-expanded={showCreate}
          >
            {showCreate ? <ChevronUp size={14} /> : <Plus size={14} />}
            从 Universe 创建 Work
          </button>
        </div>

        {showCreate && (
          <div className={styles.createWorkForm}>
            <label className={styles.createWorkField}>
              <span>Work 类型</span>
              <select value={workType} onChange={(e) => setWorkType(e.target.value)}>
                {WORK_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.createWorkField}>
              <span>关系</span>
              <select value={relation} onChange={(e) => setRelation(e.target.value as V22WorkRelation)}>
                {V22_WORK_RELATIONS.map((r) => (
                  <option key={r} value={r}>{V22_RELATION_LABELS[r]}</option>
                ))}
              </select>
            </label>
            <label className={styles.createWorkField}>
              <span>Canon 策略</span>
              <select value={canonPolicy} onChange={(e) => setCanonPolicy(e.target.value as V22CanonPolicy)}>
                {V22_CANON_POLICIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.createWorkConfirm}
              onClick={handleCreateWork}
            >
              创建并绑定
            </button>
          </div>
        )}

        <ul className={styles.list}>
          {works.map((w) => {
            const meta = RELATIONSHIP_META[w.relationship];
            const Icon = meta.icon;
            return (
              <li key={w.id} className={styles.row}>
                <div className={styles.rowHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <p className={styles.rowTitle}>{w.title}</p>
                    <span
                      className={styles.statusBadge}
                      style={{ color: meta.color, background: `${meta.color}1a`, borderColor: meta.color }}
                    >
                      <Icon size={11} />
                      {meta.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{w.type}</span>
                </div>
                <div className={styles.rowMeta}>
                  <span>作品 ID：{w.id}</span>
                  {w.snapshotId ? <span>快照：{w.snapshotId}</span> : null}
                </div>
                <InheritanceStatus
                  work={w}
                  entry={inheritanceByWork[w.id]}
                  onRetry={() => void loadInheritance(w.id)}
                  onLoadDiff={() => void loadDiff(w.id)}
                  onAdopt={(diff) => void adoptAvailableDiffs(w.id, diff)}
                />
              </li>
            );
          })}
        </ul>

        <GuideHint>
          继承关系：作品直接使用 Universe 当前 Canon；衍生关系：作品基于某个快照衍生，可独立演化；引用关系：作品仅引用部分设定，不绑定 Canon 更新。
        </GuideHint>
      </div>
    </div>
  );
}

function InheritanceStatus({
  work,
  entry,
  onRetry,
  onLoadDiff,
  onAdopt,
}: {
  work: WorkLink;
  entry?: InheritanceEntry;
  onRetry: () => void;
  onLoadDiff: () => void;
  onAdopt: (diff: InheritanceDiffResultV22) => void;
}) {
  const state = entry?.state;
  const diff = entry?.diff;
  const availableDiffIds = diff?.diffs.filter((item) => item.impact !== "conflict").map((item) => item.diffId) ?? [];
  const conflictCount = diff?.diffs.filter((item) => item.impact === "conflict").length ?? 0;

  return (
    <div className={styles.inheritanceStatus} aria-label={`${work.title} 继承状态`}>
      <div className={styles.inheritanceHeader}>
        <span className={styles.inheritanceLabel}>
          <GitBranch size={12} />
          继承状态
        </span>
        {entry?.status === "loading" || entry?.busy ? (
          <span className={styles.inheritanceMuted}><Loader2 size={12} className="spin" />读取中…</span>
        ) : null}
        {entry?.status === "preview" ? (
          <span className={styles.inheritanceMuted}>预览模式</span>
        ) : null}
        {entry?.status === "unbound" ? (
          <span className={`${styles.statusBadge} ${styles.statusDraft}`}>未绑定</span>
        ) : null}
        {entry?.status === "bound" && state ? (
          <span className={`${styles.statusBadge} ${state.isStale ? styles.statusDraft : styles.statusCanon}`}>
            {state.isStale ? "待同步" : "已同步"}
            {state.manifest ? ` · v${state.manifest.universeVersionNo}` : ""}
          </span>
        ) : null}
        {entry?.status === "error" ? (
          <span className={`${styles.inheritanceMuted} ${styles.inheritanceError}`}>
            <AlertCircle size={12} />状态不可用
          </span>
        ) : null}
      </div>

      {entry?.status === "preview" ? (
        <p className={styles.inheritanceHint}>连接真实 Universe 后，这里会显示版本、差异和采用入口。</p>
      ) : null}
      {entry?.status === "error" ? (
        <div className={styles.inheritanceActionRow}>
          <span className={styles.inheritanceHint}>{entry.error}</span>
          <button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={onRetry}>
            <RefreshCw size={12} />重试
          </button>
        </div>
      ) : null}
      {entry?.status === "bound" && state?.isStale ? (
        <div className={styles.inheritanceActionRow}>
          <span className={styles.inheritanceHint}>
            {state.latestUniverseVersion ? `Universe v${state.latestUniverseVersion.versionNo} 有新变更` : "Universe 有新变更"}
          </span>
          <button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={onLoadDiff} disabled={entry.busy}>
            <GitBranch size={12} />{diff ? "刷新差异" : "查看变更"}
          </button>
        </div>
      ) : null}
      {entry?.status === "bound" && !state?.isStale ? (
        <span className={styles.inheritanceHint}><CheckCircle2 size={12} />当前作品已跟随已采用版本</span>
      ) : null}
      {diff ? (
        <div className={styles.inheritanceDiff}>
          <div className={styles.inheritanceDiffSummary}>
            <span>发现 {diff.diffs.length} 项变更</span>
            <span>v{diff.currentUniverseVersionId} → v{diff.latestUniverseVersionId}</span>
          </div>
          {diff.diffs.length > 0 ? (
            <ul className={styles.inheritanceDiffList}>
              {diff.diffs.slice(0, 5).map((item) => (
                <li key={item.diffId}>
                  <span className={`${styles.diffImpact} ${item.impact === "conflict" ? styles.diffImpactConflict : ""}`}>
                    {item.impact}
                  </span>
                  <span>{item.objectType}{item.fieldPath ? ` · ${item.fieldPath}` : ""}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {diff.diffs.length > 5 ? <p className={styles.inheritanceHint}>还有 {diff.diffs.length - 5} 项变更未展开。</p> : null}
          {conflictCount > 0 ? <p className={styles.inheritanceConflict}>有 {conflictCount} 项冲突未自动采用，请回到作品中人工确认。</p> : null}
          {availableDiffIds.length > 0 ? (
            <button type="button" className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonSmall}`} onClick={() => onAdopt(diff)} disabled={entry.busy}>
              <CheckCircle2 size={12} />采用 {availableDiffIds.length} 项可用变更
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
