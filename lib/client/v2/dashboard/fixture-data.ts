// Kiikis 2.0 Dashboard fixture 内联数据
// 把 tests/fixtures/kiikis-v2/*.json 的数据内联为 TS 模块，
// 保证浏览器端 webpack 一定能打包（tests/ 目录默认不进客户端 bundle）。
// JSON 文件保留作为 K2-I-01 集成时 fixture/API DTO 一致性校验依据，
// 单测会断言两者数据一致以防数据漂移。

import type { DashboardData } from "./types.ts";

// 正常 fixture：4 项目 / 3 确认 / 3 任务 / 2 Universe / 2 作品。
export const dashboardFixture: DashboardData = {
  contractVersion: "2.0.0-alpha.1",
  recentProjects: [
    {
      id: "proj-umbral-pact",
      title: "Umbral Pact EP06-EP10",
      workflowType: "creation",
      currentStage: "剧本定稿",
      lastSavedAt: "2026-08-12T15:42:00+08:00",
      universeBound: true,
      universeId: "uni-umbral",
    },
    {
      id: "proj-marriage-contract",
      title: "婚姻契约 第一季",
      workflowType: "creation",
      currentStage: "大纲确认",
      lastSavedAt: "2026-08-12T11:08:00+08:00",
      universeBound: true,
      universeId: "uni-marriage",
    },
    {
      id: "proj-viral-piano",
      title: "钢琴师短视频改编",
      workflowType: "viral",
      currentStage: "素材上传",
      lastSavedAt: "2026-08-11T22:30:00+08:00",
      universeBound: false,
    },
    {
      id: "proj-song-lullaby",
      title: "Lullaby 主题曲",
      workflowType: "song",
      currentStage: "歌词翻译",
      lastSavedAt: "2026-08-11T16:05:00+08:00",
      universeBound: true,
      universeId: "uni-umbral",
    },
  ],
  pendingConfirmations: [
    {
      id: "cp-001",
      type: "change_proposal",
      title: "EP06 反派 Isadora 首次出场设定变更",
      universeId: "uni-umbral",
      confidence: 0.82,
      createdAt: "2026-08-12T10:12:00+08:00",
    },
    {
      id: "cp-002",
      type: "canon_check",
      title: "EP05 与 EP03 中婚戒描述不一致",
      universeId: "uni-marriage",
      confidence: 0.91,
      createdAt: "2026-08-12T09:40:00+08:00",
    },
    {
      id: "cp-003",
      type: "asset_review",
      title: "Umbral 主视觉母版待审核",
      universeId: "uni-umbral",
      confidence: 0.74,
      createdAt: "2026-08-11T20:00:00+08:00",
    },
  ],
  runningJobs: [
    {
      id: "job-vid-ep06-001",
      name: "EP06 关键帧生成",
      projectName: "Umbral Pact EP06-EP10",
      projectId: "proj-umbral-ep06",
      workbenchType: "video",
      stage: "generating",
      completed: 7,
      total: 12,
      elapsedMs: 184000,
      estimatedRangeMs: { min: 220000, max: 320000, confidence: 0.68 },
    },
    {
      id: "job-art-portrait-002",
      name: "Isadora 角色立绘",
      projectName: "Umbral Pact EP06-EP10",
      projectId: "proj-umbral-ep06",
      workbenchType: "art",
      stage: "queued",
      completed: 0,
      total: 4,
      elapsedMs: 12000,
      estimatedRangeMs: { min: 90000, max: 150000, confidence: 0.55 },
    },
    {
      id: "job-vid-ep07-003",
      name: "EP07 分镜分析",
      projectName: "Umbral Pact EP06-EP10",
      projectId: "proj-umbral-ep07",
      workbenchType: "storyboard",
      stage: "result_ingesting",
      completed: 18,
      total: 20,
      elapsedMs: 95000,
      estimatedRangeMs: { min: 100000, max: 130000, confidence: 0.81 },
    },
  ],
  recentUniverses: [
    {
      id: "uni-umbral",
      name: "Umbral Pact 世界",
      updatedAt: "2026-08-12T14:00:00+08:00",
      healthSummary: {
        canonCompleteness: 0.86,
        characterCompleteness: 0.72,
        relationshipTimeline: 0.64,
        assetCoverage: 0.55,
        pendingProposals: 3,
        conflicts: 1,
      },
    },
    {
      id: "uni-marriage",
      name: "婚姻契约宇宙",
      updatedAt: "2026-08-12T09:30:00+08:00",
      healthSummary: {
        canonCompleteness: 0.93,
        characterCompleteness: 0.88,
        relationshipTimeline: 0.79,
        assetCoverage: 0.71,
        pendingProposals: 1,
        conflicts: 0,
      },
    },
  ],
  recentWorks: [
    {
      id: "work-ep01-05-v4",
      title: "Umbral Pact EP01-EP05 v4.0",
      type: "drama_pack",
      exportedAt: "2026-08-10T18:00:00+08:00",
      status: "released",
    },
    {
      id: "work-lullaby-master",
      title: "Lullaby 主曲 demo",
      type: "song",
      exportedAt: "2026-08-09T21:15:00+08:00",
      status: "draft",
    },
  ],
  nextStepHint:
    "EP06 关键帧还剩 5 张，预计 2-4 分钟完成；完成后建议先处理 Isadora 角色立绘的审核，再回到 EP07 分镜分析。",
};

// 空 fixture：所有列表为空 + 首次使用引导。
export const dashboardEmptyFixture: DashboardData = {
  contractVersion: "2.0.0-alpha.1",
  recentProjects: [],
  pendingConfirmations: [],
  runningJobs: [],
  recentUniverses: [],
  recentWorks: [],
  nextStepHint:
    "还没有项目，从右上角「快速开始」创建你的第一个作品，系统会自动建立或绑定 Universe。",
};

// error fixture：带 error 字段，加载时由 parseFixture 抛错。
export const dashboardErrorFixture = {
  contractVersion: "2.0.0-alpha.1",
  error: {
    code: "DASHBOARD_FETCH_FAILED",
    message: "无法加载首页数据，请稍后重试。若问题持续，可前往任务中心查看运行中任务。",
  },
} as const;
