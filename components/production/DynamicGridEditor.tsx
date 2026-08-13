"use client";

/**
 * KIIKIS 2.1 Phase 2 — 动态宫格分镜编辑器 (K21-SB-001..009)
 *
 * 显示: 场标题、NEW/CONTINUOUS、格数与理由、空间/轴线、共享摄影参数、
 *       每格图像/说明/锁定、上游差异和冲突选择。
 *
 * 不重做整个 Production Workbench, 而是作为独立 tab 内容渲染。
 */

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Unlock, History } from "lucide-react";
import type {
  DynamicGridSceneV1,
  DynamicGridFrameV1,
} from "@/lib/storyboard/dynamic-grid-contract";
import {
  DynamicGridClient,
  DynamicGridClientError,
  type UpsertConflictPayload,
  type StoryboardListItem,
  type CurrentStoryboardPayload,
} from "@/lib/storyboard/dynamic-grid-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { DynamicGridDiffDialog } from "./DynamicGridDiffDialog";
import styles from "./DynamicGridEditor.module.css";

export interface DynamicGridEditorProps {
  handoffId: string;
}

export function DynamicGridEditor({ handoffId }: DynamicGridEditorProps): ReactNode {
  const [client, setClient] = useState<DynamicGridClient | null>(null);
  const [scenes, setScenes] = useState<StoryboardListItem[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string>("");
  const [current, setCurrent] = useState<CurrentStoryboardPayload | null>(null);
  const [draft, setDraft] = useState<DynamicGridSceneV1 | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [conflict, setConflict] = useState<UpsertConflictPayload | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // 初始化 client
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    setClient(DynamicGridClient.fromSupabase(supabase));
  }, []);

  // 加载场景列表
  const loadScenes = useCallback(async () => {
    if (!client || !handoffId) return;
    setLoading(true);
    setError("");
    try {
      const result = await client.listForHandoff(handoffId);
      setScenes(result.items);
      if (result.items.length > 0 && !selectedSceneId) {
        setSelectedSceneId(result.items[0].sceneId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载场景列表失败");
    } finally {
      setLoading(false);
    }
  }, [client, handoffId, selectedSceneId]);

  useEffect(() => {
    void loadScenes();
  }, [loadScenes]);

  // 加载当前场景的当前版本
  const loadCurrent = useCallback(async () => {
    if (!client || !handoffId || !selectedSceneId) return;
    setLoading(true);
    setError("");
    try {
      const result = await client.getCurrent(handoffId, selectedSceneId);
      setCurrent(result);
      setDraft(result.storyboard);
      setNotice("");
    } catch (err) {
      if (err instanceof DynamicGridClientError && err.code === "NOT_FOUND") {
        setCurrent(null);
        setDraft(null);
        setNotice("该场景还没有动态分镜,可点击「生成」创建第一个版本。");
      } else {
        setError(err instanceof Error ? err.message : "加载分镜失败");
      }
    } finally {
      setLoading(false);
    }
  }, [client, handoffId, selectedSceneId]);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  // 切换 frame 锁定状态
  const toggleFrameLock = (frameId: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      frames: draft.frames.map((f) =>
        f.id === frameId
          ? { ...f, locked: !f.locked, userEdited: !f.locked ? true : f.userEdited }
          : f
      ),
    });
  };

  // 更新 frame 字段
  const updateFrame = (frameId: string, field: keyof DynamicGridFrameV1, value: unknown) => {
    if (!draft) return;
    setDraft({
      ...draft,
      frames: draft.frames.map((f) =>
        f.id === frameId
          ? { ...f, [field]: value, userEdited: true }
          : f
      ),
    });
  };

  // 保存 (CAS)
  const handleSave = async () => {
    if (!client || !draft) return;
    setSaving(true);
    setError("");
    setNotice("");
    setConflict(null);

    try {
      const expectedRevision = current?.revision ?? -1;
      const result = await client.upsert({
        handoffId,
        sceneId: draft.sceneId,
        continuityMode: draft.continuityMode,
        gridCount: draft.gridCount,
        gridRationale: draft.gridRationale,
        spatialPlan: draft.spatialPlan,
        sharedCinematography: draft.sharedCinematography,
        negativePrompt: draft.negativePrompt,
        frames: [...draft.frames],
        revisionSource: "user",
        expectedRevision,
      });

      if ("kind" in result) {
        // 冲突
        setConflict(result);
      } else {
        setCurrent({
          storyboard: result.storyboard,
          rowId: result.rowId,
          revision: result.revision,
          parentId: result.parentId,
          createdAt: new Date().toISOString(),
        });
        setDraft(result.storyboard);
        setNotice(
          result.status === "created"
            ? "已创建第一个版本"
            : result.status === "revision_added"
              ? `已保存为新版本 (revision ${result.revision})`
              : "内容未变化,跳过保存"
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // 冲突对话框操作
  const handleConflictKeepMine = async () => {
    if (!conflict || !draft) return;
    setConflict(null);
    // 用当前服务端 revision 重新提交
    setNotice("正在以强制 user 模式重新提交...");
    setSaving(true);
    try {
      if (!client) return;
      const result = await client.upsert({
        handoffId,
        sceneId: draft.sceneId,
        continuityMode: draft.continuityMode,
        gridCount: draft.gridCount,
        gridRationale: draft.gridRationale,
        spatialPlan: draft.spatialPlan,
        sharedCinematography: draft.sharedCinematography,
        negativePrompt: draft.negativePrompt,
        frames: [...draft.frames],
        revisionSource: "user",
        expectedRevision: conflict.currentRevision,
      });
      if ("kind" in result) {
        setConflict(result);
      } else {
        setCurrent({
          storyboard: result.storyboard,
          rowId: result.rowId,
          revision: result.revision,
          parentId: result.parentId,
          createdAt: new Date().toISOString(),
        });
        setDraft(result.storyboard);
        setNotice(`已强制保存为新版本 (revision ${result.revision})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "强制保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleConflictAcceptServer = () => {
    if (!conflict) return;
    setCurrent({
      storyboard: conflict.currentStoryboard,
      rowId: "",
      revision: conflict.currentRevision,
      parentId: null,
      createdAt: new Date().toISOString(),
    });
    setDraft(conflict.currentStoryboard);
    setConflict(null);
    setNotice("已接受服务端版本,可在此基础上继续编辑。");
  };

  const handleConflictCancel = () => {
    setConflict(null);
    setNotice("已取消保存。本地修改未提交。");
  };

  const gridClass = useMemo(() => {
    if (!draft) return styles.grid4;
    switch (draft.gridCount) {
      case 4: return styles.grid4;
      case 6: return styles.grid6;
      case 9: return styles.grid9;
      case 12: return styles.grid12;
      default: return styles.grid4;
    }
  }, [draft]);

  return (
    <div className={styles.shell}>
      {/* 场景选择栏 */}
      <div className={styles.sceneBar}>
        <select
          className={styles.sceneSelect}
          value={selectedSceneId}
          onChange={(e) => setSelectedSceneId(e.target.value)}
          aria-label="选择场景"
        >
          {scenes.length === 0 ? (
            <option value="">暂无场景</option>
          ) : (
            scenes.map((s) => (
              <option key={s.sceneId} value={s.sceneId}>
                {s.sceneId} (rev {s.revision}, {s.storyboard.gridCount}格)
              </option>
            ))
          )}
        </select>

        {draft ? (
          <>
            <span
              className={`${styles.continuityBadge} ${
                draft.continuityMode === "NEW"
                  ? styles.continuityBadgeNew
                  : styles.continuityBadgeContinuous
              }`}
            >
              {draft.continuityMode === "NEW" ? "NEW 场" : "CONTINUOUS"}
            </span>
            <span className={styles.gridCountBadge}>
              {draft.gridCount} 宫格
            </span>
            <span className={styles.gridRationale}>{draft.gridRationale}</span>
          </>
        ) : null}

        <button
          type="button"
          className={styles.historyBtn}
          onClick={() => setShowHistory(!showHistory)}
          disabled={!current}
        >
          <History size={14} /> 历史
        </button>
      </div>

      {/* 元数据面板 */}
      {draft ? (
        <div className={styles.metaPanel}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>轴线</span>
            <span className={styles.metaValue}>{draft.spatialPlan.axis}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>入口</span>
            <span className={styles.metaValue}>{draft.spatialPlan.entrances.join(", ")}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Screen Direction</span>
            <span className={styles.metaValue}>{draft.spatialPlan.screenDirections.join(", ")}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>共享摄影</span>
            <span className={styles.metaValue}>{draft.sharedCinematography}</span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Negative Prompt</span>
            <span className={styles.metaValue}>{draft.negativePrompt}</span>
          </div>
          {current ? (
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>当前版本</span>
              <span className={styles.metaValue}>revision {current.revision}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 通知/错误 */}
      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {error ? <div className={`${styles.notice} ${styles.noticeError}`}>{error}</div> : null}

      {/* 加载状态 */}
      {loading ? (
        <div className={styles.loadingState}>加载中...</div>
      ) : null}

      {/* 宫格 */}
      {!loading && draft ? (
        <div className={`${styles.grid} ${gridClass}`}>
          {draft.frames.map((frame) => (
            <FrameCard
              key={frame.id}
              frame={frame}
              onToggleLock={() => toggleFrameLock(frame.id)}
              onUpdateField={(field, value) => updateFrame(frame.id, field, value)}
            />
          ))}
        </div>
      ) : null}

      {/* 空状态 */}
      {!loading && !draft && !error ? (
        <div className={styles.emptyState}>
          <p>该场景尚无动态分镜。</p>
        </div>
      ) : null}

      {/* 操作栏 */}
      {draft ? (
        <div className={styles.actionBar}>
          <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>
            {draft.frames.filter((f) => f.locked).length} 锁定 ·{" "}
            {draft.frames.filter((f) => f.userEdited).length} 人工编辑
          </span>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "保存中..." : "保存 (CAS)"}
          </button>
        </div>
      ) : null}

      {/* 冲突对话框 */}
      {conflict ? (
        <DynamicGridDiffDialog
          conflict={conflict}
          onKeepMine={handleConflictKeepMine}
          onAcceptServer={handleConflictAcceptServer}
          onCancel={handleConflictCancel}
        />
      ) : null}
    </div>
  );
}

/** 单个 frame 卡片。 */
function FrameCard({
  frame,
  onToggleLock,
  onUpdateField,
}: {
  frame: DynamicGridFrameV1;
  onToggleLock: () => void;
  onUpdateField: (field: keyof DynamicGridFrameV1, value: unknown) => void;
}): ReactNode {
  return (
    <div
      className={`${styles.frameCard} ${
        frame.locked ? styles.frameCardLocked : ""
      } ${frame.userEdited && !frame.locked ? styles.frameCardUserEdited : ""}`}
    >
      <div className={styles.frameHeader}>
        <span className={styles.frameOrder}>#{frame.order}</span>
        <button
          type="button"
          className={`${styles.frameLockBtn} ${frame.locked ? styles.frameLockBtnActive : ""}`}
          onClick={onToggleLock}
          aria-label={frame.locked ? "解锁此格" : "锁定此格"}
          title={frame.locked ? "已锁定 - AI 不会覆盖" : "未锁定"}
        >
          {frame.locked ? <Lock size={10} /> : <Unlock size={10} />}
          {frame.locked ? " 锁定" : " 解锁"}
        </button>
      </div>

      <div
        className={styles.frameAspect}
        contentEditable={!frame.locked}
        suppressContentEditableWarning
        onBlur={(e) => {
          const text = e.currentTarget.textContent ?? "";
          if (text !== frame.visualDescription) {
            onUpdateField("visualDescription", text);
          }
        }}
      >
        <span className={styles.frameAspectText}>9:16</span>
        {frame.visualDescription}
      </div>

      <div className={styles.frameBody}>
        <span className={styles.frameShotSize}>{frame.shotSize}</span>
        <span className={styles.frameCamera}>{frame.cameraMovement}</span>
        {frame.characterIds.length > 0 ? (
          <span style={{ color: "var(--ink-muted)" }}>
            人物: {frame.characterIds.join(", ")}
          </span>
        ) : null}
        {frame.dialogue ? (
          <div className={styles.frameDialogue}>{frame.dialogue}</div>
        ) : null}
        {frame.action ? (
          <span style={{ color: "var(--ink-secondary)", fontSize: 10 }}>{frame.action}</span>
        ) : null}
      </div>
    </div>
  );
}
