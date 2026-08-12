// 短剧流 → 工作台外壳适配器辅助函数（K2-T-08）。
//
// 将 ShortDramaData 映射为 WorkbenchAdapter 所需的 steps/assets/runningJobs/aiContext/modelSettings。
// 纯函数，便于 Node 测试直接导入。workbenchContent 与回调由组件层注入。

import type {
  AiContext,
  ModelSettings,
  WorkbenchAsset,
  WorkbenchJob,
  WorkbenchStep,
} from "../workbench/types.ts";
import type { ShortDramaData } from "./types.ts";
import { STAGE_LABELS_EN, STAGE_LABELS_ZH, getStageStatusList } from "./flow-machine.ts";

// 构建步骤导航（映射阶段状态到 WorkbenchStep）。
export function buildWorkbenchSteps(data: ShortDramaData, locale: string): WorkbenchStep[] {
  const labels = locale === "zh-CN" ? STAGE_LABELS_ZH : STAGE_LABELS_EN;
  return getStageStatusList(data.stages).map(({ id, status }) => ({
    id,
    label: labels[id],
    status,
  }));
}

// 构建资产列表（聚合美术资产 + 分镜 + 视频，供外壳左侧栏展示）。
export function buildWorkbenchAssets(data: ShortDramaData): WorkbenchAsset[] {
  const assets: WorkbenchAsset[] = [];
  // 美术资产
  for (const art of data.stages.art.assets) {
    const mainVersion = art.versions.find((v) => v.id === art.mainVersionId);
    assets.push({
      id: art.id,
      name: art.name,
      type: art.type,
      version: art.versions.length,
      status: art.mainVersionId !== null ? "ready" : "draft",
      locked: art.mainVersionId !== null && (mainVersion?.locked ?? false),
    });
  }
  // 分镜资产
  if (data.stages.storyboard.frames.length > 0) {
    assets.push({
      id: "storyboard-frames",
      name: "分镜帧",
      type: "storyboard",
      version: data.stages.storyboard.frames.length,
      status: data.stages.storyboard.frames.every((f) => f.confirmed) ? "ready" : "draft",
      locked: data.stages.storyboard.frames.every((f) => f.confirmed) && data.stages.storyboard.frames.length > 0,
    });
  }
  // 视频资产
  if (data.stages.video.shots.length > 0) {
    const allCompleted = data.stages.video.shots.every((s) => s.status === "completed");
    assets.push({
      id: "video-shots",
      name: "视频镜头",
      type: "video",
      version: 1,
      status: allCompleted ? "published" : "draft",
      locked: allCompleted,
    });
  }
  return assets;
}

// 构建运行中任务（基于视频镜头 pending/failed 状态派生）。
export function buildRunningJobs(data: ShortDramaData): WorkbenchJob[] {
  const jobs: WorkbenchJob[] = [];
  const shots = data.stages.video.shots;
  const pending = shots.filter((s) => s.status === "pending");
  const failed = shots.filter((s) => s.status === "failed");
  if (pending.length > 0) {
    jobs.push({
      id: "job-video-pending",
      name: "视频镜头生成",
      type: "video",
      stage: "running",
      completed: 0,
      total: pending.length,
    });
  }
  if (failed.length > 0) {
    jobs.push({
      id: "job-video-failed",
      name: "失败镜头重做",
      type: "video",
      stage: "partial_failure",
      completed: 0,
      total: failed.length,
      failureReason: failed[0].failureReason ?? "镜头生成失败",
    });
  }
  return jobs;
}

// 构建 AI 面板上下文（根据当前阶段给建议）。
export function buildAiContext(data: ShortDramaData): AiContext {
  const stage = data.project.currentStage;
  const suggestions: string[] = [];
  switch (stage) {
    case "script":
      suggestions.push("AI 已分析剧本，请确认角色/场景/道具候选。");
      suggestions.push("可补充候选描述以提升后续美术一致性。");
      break;
    case "art":
      suggestions.push("建议参考已锁定主版本的风格生成新母版。");
      suggestions.push("银色怀表等道具可复用角色立绘的金属质感。");
      break;
    case "storyboard":
      suggestions.push("分镜可复用美术场景资产作为构图基础。");
      suggestions.push("逐镜确认后即可进入视频阶段。");
      break;
    case "video":
      suggestions.push("失败的镜头可调整提示词后重做。");
      suggestions.push("批量生成时建议先确认关键帧再生成视频。");
      break;
    case "export":
      suggestions.push("导出包未伪造完整，缺失内容会标记 partial。");
      suggestions.push("完成后将生成 Universe Change Proposal 候选。");
      break;
  }
  return {
    suggestions,
    recentMessages: [
      {
        id: "msg-1",
        role: "user",
        content: `当前在${stage}阶段，需要什么帮助？`,
        createdAt: data.project.lastSavedAt,
      },
      {
        id: "msg-2",
        role: "assistant",
        content: "已就绪，请按阶段完成条件操作。",
        createdAt: data.project.lastSavedAt,
      },
    ],
  };
}

// 构建模型设置（智能模式）。
export function buildModelSettings(): ModelSettings {
  return {
    mode: "smart",
    currentModel: "atlas-flux-pro",
    recommendationReason: "短剧流智能选择风格稳定的图像/视频模型，保持跨阶段视觉一致。",
  };
}
