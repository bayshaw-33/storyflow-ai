"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkbenchShell } from "@/components/v2/workbench-shell/WorkbenchShell";
import type {
  SaveStatus,
  WorkbenchAdapter,
} from "@/lib/client/v2/workbench/types";
import type {
  ScriptCandidate,
  ShortDramaData,
  ShortDramaStageId,
  ShortDramaStages,
} from "@/lib/client/v2/short-drama/types";
import {
  loadShortDramaFixture,
} from "@/lib/client/v2/short-drama/fixtures";
import {
  advanceStage,
  buildAssetFlow,
  buildRecoveryPoint,
  canEnterStage,
  deriveShotsFromStoryboard,
  generateProposals,
  getCurrentStage,
  getStageDenialReason,
  getStageIndex,
  restoreFromRecoveryPoint,
  transferAssetsToArt,
} from "@/lib/client/v2/short-drama/flow-machine";
import {
  buildAiContext,
  buildModelSettings,
  buildRunningJobs,
  buildWorkbenchAssets,
  buildWorkbenchSteps,
} from "@/lib/client/v2/short-drama/adapter-helpers";
import { buildExportPackages } from "@/lib/client/v2/short-drama/export-manifest";
import {
  clearDraft,
  loadDraft,
  saveDraft,
} from "@/lib/client/v2/short-drama/recovery";
import { useI18n } from "@/lib/i18n/useI18n";
import { ScriptStage } from "./stages/ScriptStage";
import { ArtStage } from "./stages/ArtStage";
import { StoryboardStage } from "./stages/StoryboardStage";
import { VideoStage } from "./stages/VideoStage";
import { ExportStage } from "./stages/ExportStage";

/**
 * 短剧样板工作流主组件（K2-T-08）。
 *
 * 通过 ShortDramaFlowAdapter 实现 K2-T-02 的 WorkbenchAdapter 接口，
 * 将 剧本→美术→分镜→视频→导出 链路接入统一工作台外壳。
 *
 * - 不重写工作台内部生成逻辑，仅通过适配器连接现有能力（fixture 模拟生成结果）
 * - 已确认资产跨阶段传递（角色→美术→分镜→视频）
 * - 中断恢复：localStorage 草稿持久化当前阶段 + 已确认资产（不伪装为已同步云端）
 * - 回流是候选（Change Proposal），不自动改写 Canon
 */
export function ShortDramaFlow() {
  const { locale } = useI18n();
  const [data, setData] = useState<ShortDramaData>(() => loadShortDramaFixture());
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  // 是否已尝试恢复草稿（避免首屏闪烁）
  const [restored, setRestored] = useState(false);

  // 挂载时尝试从中断点恢复
  useEffect(() => {
    const draft = loadDraft(data.project.id);
    if (draft && draft.stage !== data.project.currentStage) {
      // 恢复到草稿记录的阶段：调整 stages 状态，导航到草稿阶段
      setData((prev) => {
        const recovery = {
          stage: draft.stage,
          confirmedAssets: draft.confirmedAssets,
          lastSavedAt: draft.savedAt,
        };
        const restoredStages = restoreFromRecoveryPoint(prev.stages, recovery);
        return {
          ...prev,
          project: { ...prev.project, currentStage: draft.stage },
          stages: restoredStages,
        };
      });
    }
    setRestored(true);
  }, []); // 仅挂载时执行

  // 数据变更时持久化草稿到 localStorage（中断恢复用）
  const persistDraft = useCallback((next: ShortDramaData) => {
    const current = getCurrentStage(next.stages) ?? next.project.currentStage;
    const confirmed = {
      characterIds: next.stages.script.confirmed.characterIds,
      sceneIds: next.stages.script.confirmed.sceneIds,
      propIds: next.stages.script.confirmed.propIds,
    };
    saveDraft(next.project.id, current, confirmed);
  }, []);

  // 通用更新：应用 patch 并标记未保存
  const updateData = useCallback(
    (updater: (prev: ShortDramaData) => ShortDramaData) => {
      setData((prev) => {
        const next = updater(prev);
        persistDraft(next);
        return next;
      });
      setSaveStatus("unsaved");
    },
    [persistDraft],
  );

  // ─── 阶段导航 ───

  const handleStepChange = useCallback(
    (stepId: string) => {
      const stageId = stepId as ShortDramaStageId;
      if (!canEnterStage(data.stages, stageId)) {
        const reason = getStageDenialReason(data.stages, stageId, locale);
        if (reason) console.info(reason);
        return;
      }
      updateData((prev) => ({
        ...prev,
        project: { ...prev.project, currentStage: stageId },
      }));
    },
    [data.stages, locale, updateData],
  );

  // ─── 推进阶段 ───

  const handleAdvance = useCallback(() => {
    updateData((prev) => {
      const current = getCurrentStage(prev.stages);
      if (current === null) return prev;
      const nextStages = advanceStage(prev.stages);
      const currentIdx = getStageIndex(current);
      const nextStageId: ShortDramaStageId =
        currentIdx < 4
          ? (["script", "art", "storyboard", "video", "export"] as const)[currentIdx + 1]
          : current;
      // 推进时同步派生下游数据（资产跨阶段传递）
      const withFlow = syncCrossStageData(nextStages, prev);
      const proposals = generateProposals({ ...prev, stages: withFlow });
      const recovery = buildRecoveryPoint({ ...prev, stages: withFlow, project: { ...prev.project, currentStage: nextStageId } });
      return {
        ...prev,
        project: { ...prev.project, currentStage: nextStageId },
        stages: withFlow,
        assetFlow: buildAssetFlow({ ...prev, stages: withFlow }),
        proposals,
        recoveryPoint: recovery,
      };
    });
  }, [updateData]);

  // ─── 剧本阶段回调 ───

  const handleToggleCandidate = useCallback(
    (candidateId: string, kind: ScriptCandidate["kind"]) => {
      updateData((prev) => {
        const confirmed = { ...prev.stages.script.confirmed };
        const key = kind === "character" ? "characterIds" : kind === "scene" ? "sceneIds" : "propIds";
        const list = confirmed[key];
        if (list.includes(candidateId)) {
          confirmed[key] = list.filter((id) => id !== candidateId);
        } else {
          confirmed[key] = [...list, candidateId];
        }
        const stages = { ...prev.stages, script: { ...prev.stages.script, confirmed } };
        return { ...prev, stages };
      });
    },
    [updateData],
  );

  const handleRunAnalysis = useCallback(() => {
    // fixture 模拟：分析结果已内联，此处仅标记未保存
    setSaveStatus("unsaved");
  }, []);

  // ─── 美术阶段回调 ───

  const handleGenerateAsset = useCallback(
    (candidateId: string) => {
      updateData((prev) => {
        const candidate = [
          ...prev.stages.script.analysis.characters,
          ...prev.stages.script.analysis.scenes,
          ...prev.stages.script.analysis.props,
        ].find((c) => c.id === candidateId);
        if (!candidate) return prev;
        const newAsset = {
          id: `art-${candidateId}`,
          name: `${candidate.name} ${candidate.kind === "character" ? "角色立绘" : candidate.kind === "scene" ? "场景" : "道具"}`,
          type: candidate.kind,
          sourceCandidateId: candidateId,
          versions: [
            { id: `art-${candidateId}-v1`, url: `/assets/art/${candidateId}-v1.png`, locked: false },
          ],
          mainVersionId: null,
        };
        const art = {
          ...prev.stages.art,
          assets: [...prev.stages.art.assets, newAsset],
          pendingConfirm: prev.stages.art.pendingConfirm.filter((c) => c.id !== candidateId),
        };
        const stages = { ...prev.stages, art };
        return { ...prev, stages };
      });
    },
    [updateData],
  );

  const handleLockMainVersion = useCallback(
    (assetId: string, versionId: string) => {
      updateData((prev) => {
        const art = {
          ...prev.stages.art,
          assets: prev.stages.art.assets.map((a) =>
            a.id === assetId
              ? {
                  ...a,
                  mainVersionId: versionId,
                  versions: a.versions.map((v) => ({ ...v, locked: v.id === versionId ? true : v.locked })),
                }
              : a,
          ),
        };
        const stages = { ...prev.stages, art };
        return { ...prev, stages };
      });
    },
    [updateData],
  );

  // ─── 分镜阶段回调 ───

  const handleGenerateFrames = useCallback(() => {
    updateData((prev) => {
      const confirmedScenes = prev.stages.script.analysis.scenes.filter((s) =>
        prev.stages.script.confirmed.sceneIds.includes(s.id),
      );
      const frames = confirmedScenes.map((scene, idx) => ({
        id: `frame-${String(idx + 1).padStart(3, "0")}`,
        sceneRef: scene.id,
        shotDescription: `${scene.name} 镜头 ${idx + 1}`,
        confirmed: false,
      }));
      const stages = { ...prev.stages, storyboard: { ...prev.stages.storyboard, frames } };
      return { ...prev, stages };
    });
  }, [updateData]);

  const handleToggleFrameConfirm = useCallback(
    (frameId: string) => {
      updateData((prev) => {
        const frames = prev.stages.storyboard.frames.map((f) =>
          f.id === frameId ? { ...f, confirmed: !f.confirmed } : f,
        );
        const stages = { ...prev.stages, storyboard: { ...prev.stages.storyboard, frames } };
        return { ...prev, stages };
      });
    },
    [updateData],
  );

  // ─── 视频阶段回调 ───

  const handleBatchGenerate = useCallback(() => {
    updateData((prev) => {
      // 派生镜头（若尚未派生）
      let shots = prev.stages.video.shots;
      if (shots.length === 0) {
        shots = deriveShotsFromStoryboard(prev.stages.storyboard);
      }
      // fixture 模拟：pending → completed/failed（第一个失败的演示 partial failure）
      shots = shots.map((s, idx) =>
        s.status === "pending"
          ? idx === 1
            ? { ...s, status: "failed" as const, failureReason: "视频提供商超时，重试后仍失败" }
            : { ...s, status: "completed" as const, url: `/assets/video/${s.id}.mp4` }
          : s,
      );
      const stages = { ...prev.stages, video: { ...prev.stages.video, shots } };
      return { ...prev, stages };
    });
  }, [updateData]);

  const handleRedoShot = useCallback(
    (shotId: string) => {
      updateData((prev) => {
        // fixture 模拟：重做 → pending → completed
        const shots = prev.stages.video.shots.map((s) =>
          s.id === shotId
            ? { ...s, status: "completed" as const, url: `/assets/video/${s.id}-redo.mp4`, failureReason: undefined }
            : s,
        );
        const stages = { ...prev.stages, video: { ...prev.stages.video, shots } };
        return { ...prev, stages };
      });
    },
    [updateData],
  );

  // ─── 导出阶段回调 ───

  const handleGeneratePackages = useCallback(() => {
    updateData((prev) => {
      const packages = buildExportPackages(prev.stages);
      const stages = { ...prev.stages, export: { ...prev.stages.export, packages } };
      return { ...prev, stages };
    });
  }, [updateData]);

  const handleGenerateProposals = useCallback(() => {
    updateData((prev) => {
      const proposals = generateProposals(prev);
      return { ...prev, proposals };
    });
  }, [updateData]);

  // ─── 保存 ───

  const handleSave = useCallback(() => {
    setSaveStatus("saving");
    persistDraft(data);
    setTimeout(() => setSaveStatus("saved"), 300);
  }, [data, persistDraft]);

  // 清理草稿：全部完成时
  useEffect(() => {
    if (restored && data.stages.export.status === "completed") {
      clearDraft(data.project.id);
    }
  }, [restored, data.stages.export.status, data.project.id]);

  // ─── 构造适配器 ───

  const workbenchContent = useMemo(() => {
    switch (data.project.currentStage) {
      case "script":
        return (
          <ScriptStage
            data={data}
            onToggleCandidate={handleToggleCandidate}
            onRunAnalysis={handleRunAnalysis}
            onAdvance={handleAdvance}
          />
        );
      case "art":
        return (
          <ArtStage
            data={data}
            onGenerateAsset={handleGenerateAsset}
            onLockMainVersion={handleLockMainVersion}
            onAdvance={handleAdvance}
          />
        );
      case "storyboard":
        return (
          <StoryboardStage
            data={data}
            onGenerateFrames={handleGenerateFrames}
            onToggleFrameConfirm={handleToggleFrameConfirm}
            onAdvance={handleAdvance}
          />
        );
      case "video":
        return (
          <VideoStage
            data={data}
            onBatchGenerate={handleBatchGenerate}
            onRedoShot={handleRedoShot}
            onAdvance={handleAdvance}
          />
        );
      case "export":
        return (
          <ExportStage
            data={data}
            onGeneratePackages={handleGeneratePackages}
            onGenerateProposals={handleGenerateProposals}
          />
        );
      default:
        return null;
    }
  }, [
    data,
    handleToggleCandidate,
    handleRunAnalysis,
    handleAdvance,
    handleGenerateAsset,
    handleLockMainVersion,
    handleGenerateFrames,
    handleToggleFrameConfirm,
    handleBatchGenerate,
    handleRedoShot,
    handleGeneratePackages,
    handleGenerateProposals,
  ]);

  const adapter: WorkbenchAdapter = useMemo(
    () => ({
      workbenchType: "short_drama",
      project: {
        id: data.project.id,
        title: data.project.title,
        workflowType: data.project.workflowType,
        currentStage: data.project.currentStage,
        lastSavedAt: data.project.lastSavedAt,
      },
      universeBinding: data.universeBinding,
      saveStatus,
      steps: buildWorkbenchSteps(data, locale),
      currentStep: data.project.currentStage,
      assets: buildWorkbenchAssets(data),
      runningJobs: buildRunningJobs(data),
      aiContext: buildAiContext(data),
      modelSettings: buildModelSettings(),
      workbenchContent,
      onSave: handleSave,
      onStepChange: handleStepChange,
    }),
    [data, locale, saveStatus, workbenchContent, handleSave, handleStepChange],
  );

  return <WorkbenchShell adapter={adapter} />;
}

/**
 * 同步跨阶段数据：推进阶段时自动派生下游数据。
 * - 美术阶段进入时：将剧本确认候选传递到 pendingConfirm
 * - 视频阶段进入时：从分镜派生镜头
 */
function syncCrossStageData(stages: ShortDramaStages, prev: ShortDramaData): ShortDramaStages {
  let next = { ...stages };
  // 美术阶段若 pendingConfirm 为空但剧本有新确认候选，重新传递
  if (next.art.status === "current" && next.art.pendingConfirm.length === 0) {
    const expected = transferAssetsToArt(prev.stages.script);
    const existingIds = new Set(next.art.assets.map((a) => a.sourceCandidateId));
    const pending = expected.filter((c) => !existingIds.has(c.id));
    if (pending.length > 0) {
      next = { ...next, art: { ...next.art, pendingConfirm: pending } };
    }
  }
  // 视频阶段进入时派生镜头
  if (next.video.status === "current" && next.video.shots.length === 0) {
    const shots = deriveShotsFromStoryboard(next.storyboard);
    if (shots.length > 0) {
      next = { ...next, video: { ...next.video, shots } };
    }
  }
  return next;
}
