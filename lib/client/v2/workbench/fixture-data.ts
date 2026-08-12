// 工作台外壳 fixture 数据（TS 内联）。
// 不用 dynamic import JSON，避免 Next.js webpack 不打包 tests/ 导致浏览器端加载失败。
// JSON 文件 tests/fixtures/kiikis-v2/workbench.json 作为集成校验依据，须与此处内联数据一致。
// 防漂移：tests/ui-v2/workbench-shell/workbench-shell.test.mjs 会断言两者一致。

import type { WorkbenchData } from "./types.ts";
import { CONTRACT_VERSION } from "./types.ts";

/**
 * 默认工作台 fixture：Umbral Pact EP06 短剧项目，处于美术阶段。
 * 覆盖全部步骤状态（completed/current/available/locked）、
 * 多种资产类型与状态、运行中任务（running/queued/partial_failure）、
 * AI 上下文与智能模型设置。
 */
export const workbenchFixture: WorkbenchData = {
  contractVersion: CONTRACT_VERSION,
  project: {
    id: "proj-umbral-ep06",
    title: "Umbral Pact EP06",
    workflowType: "short_drama",
    currentStage: "art",
    lastSavedAt: "2026-08-12T15:42:00+08:00",
  },
  universeBinding: {
    bound: true,
    universeId: "uni-umbral",
    universeName: "Umbral Pact 世界",
    suggestion: "bind_existing",
  },
  saveStatus: "unsaved",
  steps: [
    { id: "script", label: "剧本", status: "completed" },
    { id: "structure", label: "结构分析", status: "completed" },
    { id: "character", label: "角色", status: "completed" },
    { id: "art", label: "美术", status: "current" },
    { id: "storyboard", label: "分镜", status: "available" },
    { id: "video", label: "视频", status: "locked" },
    { id: "export", label: "导出", status: "locked" },
  ],
  assets: [
    { id: "asset-mara", name: "Mara 角色立绘", type: "character", version: 3, status: "ready", locked: false },
    { id: "asset-isadora", name: "Isadora 角色立绘", type: "character", version: 1, status: "draft", locked: false },
    { id: "asset-tide-room", name: "潮汐密室场景", type: "scene", version: 2, status: "ready", locked: true },
    { id: "asset-tide-amulet", name: "潮汐护身符", type: "prop", version: 1, status: "draft", locked: false },
    { id: "asset-storyboard-ep06", name: "EP06 分镜板", type: "storyboard", version: 0, status: "draft", locked: false },
    { id: "asset-opening-video", name: "片头视频", type: "video", version: 1, status: "published", locked: true },
  ],
  runningJobs: [
    {
      id: "job-art-portrait-002",
      name: "Isadora 角色立绘",
      type: "image",
      stage: "running",
      completed: 2,
      total: 4,
    },
    {
      id: "job-vid-ep06-001",
      name: "EP06 关键帧生成",
      type: "video",
      stage: "queued",
      completed: 0,
      total: 12,
    },
    {
      id: "job-art-batch-fail",
      name: "配角立绘批量生成",
      type: "image",
      stage: "partial_failure",
      completed: 7,
      total: 10,
      failureReason: "图像提供商超时，3 张重试后仍失败",
      resultUrl: "/projects/proj-umbral-ep06/art?batch=supporting-cast",
    },
  ],
  aiContext: {
    suggestions: [
      "Isadora 的立绘建议参考 EP05 的阴影风格，保持视觉一致。",
      "潮汐密室场景需要补充雨夜光照参考。",
      "EP06 分镜可复用 EP05 的转场节奏。",
    ],
    recentMessages: [
      { id: "msg-1", role: "user", content: "帮我生成 Isadora 第一次出场的立绘。", createdAt: "2026-08-12T15:30:00+08:00" },
      { id: "msg-2", role: "assistant", content: "已基于 EP05 阴影风格生成 4 张候选，请选择。", createdAt: "2026-08-12T15:32:00+08:00" },
      { id: "msg-3", role: "user", content: "第 2 张不错，但眼神要更冷。", createdAt: "2026-08-12T15:35:00+08:00" },
    ],
  },
  modelSettings: {
    mode: "smart",
    currentModel: "atlas-flux-pro",
    recommendationReason: "参考 EP05 视觉一致性，自动选择风格稳定的图像模型。",
  },
};
