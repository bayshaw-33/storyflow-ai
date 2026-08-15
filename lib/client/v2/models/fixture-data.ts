/**
 * 多模型选择 fixture 数据（TS 内联，非 JSON 动态导入）。
 *
 * 数据基于真实 Atlas Cloud 模型配置（lib/art/providers/catalog.ts、lib/ai/providers），
 * 已抹除 provider 内部 profile/key，仅保留用户视角字段。
 * JSON 镜像同步到 tests/fixtures/kiikis-v2/models.json，由测试防漂移断言校验。
 *
 * 模型清单覆盖：
 *   - 类型：text / image / edit / video / audio
 *   - 状态：available / degraded / unavailable
 *   - 质量/速度/成本全组合
 *   - 参考图能力 有/无
 *   - 一致性 强/中/弱
 */
import type {
  ModelDescriptor,
  ModelLibraryDataset,
  ModelRecommendation,
  RoutingRecord,
} from "./types";

// 内联契约版本字面量，避免运行时值导入触发 node ESM 解析（保持与 types.ts CONTRACT_VERSION 同步，测试防漂移断言会校验）。
const CONTRACT_VERSION = "2.0.0-alpha.1";

/**
 * 模型清单（15 个，基于 Atlas Cloud 真实 catalog）。
 *
 * provider 字段对齐 lib/art/providers/catalog.ts 的 atlas/flux 标记，
 * 以及 lib/ai/providers 的 deepseek/atlas/minimax。
 */
export const FIXTURE_MODELS: ModelDescriptor[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    provider: "deepseek",
    type: "text",
    capabilities: {
      quality: "high",
      speed: "fast",
      cost: "low",
      referenceImage: "no",
      consistency: "medium",
    },
    status: "available",
    costEstimate: { min: 0.02, max: 0.15, unit: "千字" },
    suitableTasks: ["script_unit", "creation_doc", "storyboard_script", "localization"],
    limitations: ["不支持图像输入", "单次最大 16K tokens"],
  },
  {
    id: "atlas-gemini-2.5-pro",
    name: "Atlas Gemini 2.5 Pro",
    provider: "atlas",
    type: "text",
    capabilities: {
      quality: "high",
      speed: "medium",
      cost: "medium",
      referenceImage: "no",
      consistency: "strong",
    },
    status: "available",
    costEstimate: { min: 0.05, max: 0.4, unit: "千字" },
    suitableTasks: ["storyboard_script", "creation_doc", "quality_evaluation"],
    limitations: ["长文本成本较高", "需要 Atlas Cloud 配额"],
  },
  {
    id: "minimax-m3",
    name: "MiniMax M3 (已弃用)",
    provider: "minimax",
    type: "text",
    capabilities: {
      quality: "standard",
      speed: "fast",
      cost: "low",
      referenceImage: "no",
      consistency: "weak",
    },
    status: "unavailable",
    statusReason: "该模型已于 2026-07-22 下线，不再接入新任务",
    costEstimate: { min: 0, max: 0, unit: "千字" },
    suitableTasks: [],
    limitations: ["已下线", "新任务请使用 DeepSeek Chat"],
  },
  {
    id: "black-forest-labs/flux-dev",
    name: "FLUX Dev · 文生图",
    provider: "atlas",
    type: "image",
    capabilities: {
      quality: "standard",
      speed: "fast",
      cost: "low",
      referenceImage: "no",
      consistency: "weak",
    },
    status: "available",
    costEstimate: { min: 0.3, max: 0.6, unit: "张" },
    suitableTasks: ["concept_art", "reference_sheet", "mood_board"],
    limitations: ["不支持参考图", "一致性较弱"],
  },
  {
    id: "bytedance/seedream-v5.0-pro/text-to-image",
    name: "Seedream v5.0 Pro · 文生图",
    provider: "atlas",
    type: "image",
    capabilities: {
      quality: "high",
      speed: "medium",
      cost: "medium",
      referenceImage: "no",
      consistency: "medium",
    },
    status: "available",
    costEstimate: { min: 0.5, max: 1.2, unit: "张" },
    suitableTasks: ["concept_art", "keyframe", "poster"],
    limitations: ["不支持参考图输入", "单次生成约 8-15 秒"],
  },
  {
    id: "bytedance/seedream-v5.0-lite/text-to-image",
    name: "Seedream v5.0 Lite · 文生图",
    provider: "atlas",
    type: "image",
    capabilities: {
      quality: "standard",
      speed: "fast",
      cost: "low",
      referenceImage: "no",
      consistency: "weak",
    },
    status: "available",
    costEstimate: { min: 0.2, max: 0.5, unit: "张" },
    suitableTasks: ["concept_art", "mood_board", "iteration"],
    limitations: ["质量低于 Pro 版本", "不支持参考图"],
  },
  {
    id: "xai/grok-imagine-image-quality/text-to-image",
    name: "Grok Imagine Quality · 文生图",
    provider: "atlas",
    type: "image",
    capabilities: {
      quality: "high",
      speed: "medium",
      cost: "high",
      referenceImage: "no",
      consistency: "medium",
    },
    status: "available",
    costEstimate: { min: 1.2, max: 2.5, unit: "张" },
    suitableTasks: ["poster", "keyframe", "hero_asset"],
    limitations: ["成本较高", "不支持参考图"],
  },
  {
    id: "alibaba/wan-2.7-pro/text-to-image",
    name: "Wan 2.7 Pro · 文生图",
    provider: "atlas",
    type: "image",
    capabilities: {
      quality: "high",
      speed: "slow",
      cost: "medium",
      referenceImage: "no",
      consistency: "medium",
    },
    status: "available",
    costEstimate: { min: 0.6, max: 1.4, unit: "张" },
    suitableTasks: ["keyframe", "concept_art", "detail_asset"],
    limitations: ["速度较慢（含 thinking 模式）", "不支持参考图"],
  },
  {
    id: "openai/gpt-image-2/edit",
    name: "GPT Image 2 · 图生图",
    provider: "atlas",
    type: "edit",
    capabilities: {
      quality: "high",
      speed: "slow",
      cost: "high",
      referenceImage: "yes",
      consistency: "strong",
    },
    status: "available",
    costEstimate: { min: 1.0, max: 2.2, unit: "张" },
    suitableTasks: ["character_image", "keyframe_edit", "variant", "consistency_fix"],
    limitations: ["成本较高", "单次最多 10 张参考图", "速度较慢"],
  },
  {
    id: "google/nano-banana-2/edit",
    name: "Nano Banana 2 · 图生图",
    provider: "atlas",
    type: "edit",
    capabilities: {
      quality: "medium",
      speed: "fast",
      cost: "low",
      referenceImage: "yes",
      consistency: "medium",
    },
    status: "available",
    costEstimate: { min: 0.4, max: 0.9, unit: "张" },
    suitableTasks: ["variant", "quick_edit", "iteration"],
    limitations: ["质量中等", "单次最多 14 张参考图"],
  },
  {
    id: "qwen/qwen-image-2.0-pro/edit",
    name: "Qwen Image 2.0 Pro · 图生图",
    provider: "atlas",
    type: "edit",
    capabilities: {
      quality: "high",
      speed: "medium",
      cost: "medium",
      referenceImage: "yes",
      consistency: "strong",
    },
    status: "degraded",
    statusReason: "Atlas Cloud 当前限额不足，已临时降级到 Nano Banana 2 编辑链路",
    costEstimate: { min: 0.5, max: 1.1, unit: "张" },
    suitableTasks: ["character_image", "keyframe_edit", "consistency_fix"],
    limitations: ["当前限额不足", "单次最多 10 张参考图"],
  },
  {
    id: "google/nano-banana-pro/edit-ultra",
    name: "Nano Banana Pro Ultra · 高质量图生图",
    provider: "atlas",
    type: "edit",
    capabilities: {
      quality: "high",
      speed: "slow",
      cost: "high",
      referenceImage: "yes",
      consistency: "strong",
    },
    status: "available",
    costEstimate: { min: 1.5, max: 3.0, unit: "张" },
    suitableTasks: ["hero_asset", "character_image", "consistency_fix"],
    limitations: ["成本最高", "速度较慢", "单次最多 10 张参考图"],
  },
  {
    id: "minimax-video",
    name: "MiniMax Video (已弃用)",
    provider: "minimax",
    type: "video",
    capabilities: {
      quality: "standard",
      speed: "slow",
      cost: "high",
      referenceImage: "no",
      consistency: "weak",
    },
    status: "unavailable",
    statusReason: "MiniMax 视频接入已下线，新任务请使用 Seedance",
    costEstimate: { min: 0, max: 0, unit: "秒" },
    suitableTasks: [],
    limitations: ["已下线", "新任务请使用 Seedance"],
  },
  {
    id: "seedance-v1",
    name: "Seedance v1 · 视频生成",
    provider: "bytedance",
    type: "video",
    capabilities: {
      quality: "high",
      speed: "slow",
      cost: "high",
      referenceImage: "yes",
      consistency: "medium",
    },
    status: "available",
    costEstimate: { min: 2.5, max: 6.0, unit: "秒" },
    suitableTasks: ["video_shot", "transition", "motion_asset"],
    limitations: ["单次最长 15 秒", "速度较慢", "成本较高"],
  },
  {
    id: "atlas-tts",
    name: "Atlas TTS · 语音合成",
    provider: "atlas",
    type: "audio",
    capabilities: {
      quality: "standard",
      speed: "fast",
      cost: "low",
      referenceImage: "no",
      consistency: "weak",
    },
    status: "available",
    costEstimate: { min: 0.05, max: 0.2, unit: "秒" },
    suitableTasks: ["voiceover", "dubbing", "narration"],
    limitations: ["不支持参考音频克隆", "音色库有限"],
  },
];

/**
 * 智能推荐场景（7 个，覆盖文本/图像/编辑/视频/声音）。
 *
 * taskType 与 lib/ai/providers/prompts.ts 的 TaskType 概念对齐，
 * 此处使用用户可读场景标签。
 */
export const FIXTURE_RECOMMENDATIONS: ModelRecommendation[] = [
  {
    taskType: "character_image",
    taskParams: { referenceImage: "yes", quality: "high", consistency: "strong" },
    recommendedModelId: "google/nano-banana-pro/edit-ultra",
    reason:
      "角色立绘需要强一致性（多角度保持同一张脸），且你要求高质量。Nano Banana Pro Ultra 支持多参考图编辑且一致性等级最高，适合人物资产生产。",
    estimatedSpeed: "slow",
    costLevel: "high",
    suitableFor: "角色立绘、关键资产、需要严格一致性的图生图任务",
    limitations: "成本最高，单张约 ¥1.5-3.0；速度较慢，预计 20-40 秒/张",
  },
  {
    taskType: "storyboard_script",
    taskParams: { length: "long", type: "text" },
    recommendedModelId: "deepseek-chat",
    reason:
      "分镜脚本属于长文本结构化输出，DeepSeek 在中文剧本理解与 JSON 结构化上表现稳定，成本低、速度快，是创作文档任务的首选。",
    estimatedSpeed: "fast",
    costLevel: "low",
    suitableFor: "分镜脚本、剧本大纲、本地化翻译",
    limitations: "不支持图像输入；单次最大 16K tokens，超长剧本需按集拆分",
  },
  {
    taskType: "concept_art",
    taskParams: { referenceImage: "no", quality: "high", speed: "medium" },
    recommendedModelId: "bytedance/seedream-v5.0-pro/text-to-image",
    reason:
      "概念图无需参考图，但需要高质量画面与细节。Seedream v5.0 Pro 在画面质感与构图上属于第一梯队，成本中等，适合概念迭代。",
    estimatedSpeed: "medium",
    costLevel: "medium",
    suitableFor: "场景概念图、海报、关键帧草图",
    limitations: "不支持参考图；单张约 8-15 秒",
  },
  {
    taskType: "keyframe_edit",
    taskParams: { referenceImage: "yes", consistency: "strong", cost: "medium" },
    recommendedModelId: "openai/gpt-image-2/edit",
    reason:
      "关键帧编辑需要强一致性保留原画面要素。GPT Image 2 编辑能力在多参考图融合与风格保持上表现稳定，是关键帧修改的首选。",
    estimatedSpeed: "slow",
    costLevel: "high",
    suitableFor: "关键帧编辑、变体生成、一致性修复",
    limitations: "成本较高，单张约 ¥1.0-2.2；速度较慢",
  },
  {
    taskType: "iteration",
    taskParams: { referenceImage: "yes", speed: "fast", cost: "low" },
    recommendedModelId: "google/nano-banana-2/edit",
    reason:
      "快速迭代场景需要低成本与短延迟。Nano Banana 2 编辑版支持多参考图且速度快、成本低，适合在定稿前做大量变体探索。",
    estimatedSpeed: "fast",
    costLevel: "low",
    suitableFor: "变体探索、快速修改、初稿迭代",
    limitations: "质量中等，不适合最终交付资产",
  },
  {
    taskType: "video_shot",
    taskParams: { quality: "high", duration: "short" },
    recommendedModelId: "seedance-v1",
    reason:
      "视频镜头生成需要高质量动态画面。Seedance v1 支持参考图驱动的视频生成，画面质量与运动稳定性较好，是当前视频任务的首选。",
    estimatedSpeed: "slow",
    costLevel: "high",
    suitableFor: "短剧镜头、转场动画、动态资产",
    limitations: "单次最长 15 秒；成本较高，¥2.5-6.0/秒；生成较慢",
  },
  {
    taskType: "voiceover",
    taskParams: { type: "audio" },
    recommendedModelId: "atlas-tts",
    reason:
      "配音任务需要稳定可用的语音合成。Atlas TTS 速度快、成本低，适合旁白与对白初版生成。",
    estimatedSpeed: "fast",
    costLevel: "low",
    suitableFor: "旁白、配音初稿、narration",
    limitations: "不支持参考音频克隆；音色库有限",
  },
];

/**
 * 路由记录（7 个，含降级案例）。
 *
 * 字段对齐 PRD §8.4 路由记录：
 *   用户选择 / 系统推荐 / 实际模型 / 是否降级 / 降级原因 / 估算与实际成本 / 结果状态
 */
export const FIXTURE_ROUTING_RECORDS: RoutingRecord[] = [
  {
    jobId: "job-201",
    userChoice: "deepseek-chat",
    systemRecommendation: "deepseek-chat",
    actualModel: "deepseek-chat",
    degraded: false,
    estimatedCost: 0.12,
    actualCost: 0.11,
    resultStatus: "completed",
  },
  {
    jobId: "job-202",
    userChoice: "openai/gpt-image-2/edit",
    systemRecommendation: "openai/gpt-image-2/edit",
    actualModel: "openai/gpt-image-2/edit",
    degraded: false,
    estimatedCost: 2.2,
    actualCost: 2.2,
    resultStatus: "completed",
  },
  {
    jobId: "job-203",
    userChoice: "qwen/qwen-image-2.0-pro/edit",
    systemRecommendation: "qwen/qwen-image-2.0-pro/edit",
    actualModel: "google/nano-banana-2/edit",
    degraded: true,
    downgradeReason:
      "原模型 Qwen Image 2.0 Pro 当前限额不足，已降级到 Nano Banana 2 编辑链路，质量略低但成本不变",
    estimatedCost: 1.1,
    actualCost: 0.9,
    resultStatus: "partial_failure",
  },
  {
    jobId: "job-204",
    userChoice: null,
    systemRecommendation: "bytedance/seedream-v5.0-pro/text-to-image",
    actualModel: "bytedance/seedream-v5.0-pro/text-to-image",
    degraded: false,
    estimatedCost: 1.2,
    actualCost: 1.15,
    resultStatus: "completed",
  },
  {
    jobId: "job-205",
    userChoice: "atlas-gemini-2.5-pro",
    systemRecommendation: "deepseek-chat",
    actualModel: "deepseek-chat",
    degraded: true,
    downgradeReason:
      "原模型 Atlas Gemini 2.5 Pro 请求超时，已降级到 DeepSeek Chat，质量相近但成本更低",
    estimatedCost: 0.4,
    actualCost: 0.13,
    resultStatus: "completed",
  },
  {
    jobId: "job-206",
    userChoice: null,
    systemRecommendation: "minimax-m3",
    actualModel: "deepseek-chat",
    degraded: true,
    downgradeReason:
      "原模型 MiniMax M3 已下线，自动降级到 DeepSeek Chat，质量更高且成本更低",
    estimatedCost: 0.1,
    actualCost: 0.12,
    resultStatus: "completed",
  },
  {
    jobId: "job-207",
    userChoice: "seedance-v1",
    systemRecommendation: "seedance-v1",
    actualModel: "seedance-v1",
    degraded: false,
    estimatedCost: 6.0,
    actualCost: 4.2,
    resultStatus: "failed",
  },
];

/** 计算后的统计 */
export const FIXTURE_STATS = {
  totalModels: FIXTURE_MODELS.length,
  byType: {
    text: FIXTURE_MODELS.filter((m) => m.type === "text").length,
    image: FIXTURE_MODELS.filter((m) => m.type === "image").length,
    edit: FIXTURE_MODELS.filter((m) => m.type === "edit").length,
    video: FIXTURE_MODELS.filter((m) => m.type === "video").length,
    audio: FIXTURE_MODELS.filter((m) => m.type === "audio").length,
  },
  byStatus: {
    available: FIXTURE_MODELS.filter((m) => m.status === "available").length,
    degraded: FIXTURE_MODELS.filter((m) => m.status === "degraded").length,
    unavailable: FIXTURE_MODELS.filter((m) => m.status === "unavailable").length,
  },
};

/** 完整数据集（与 tests/fixtures/kiikis-v2/models.json 镜像） */
export const FIXTURE_DATASET: ModelLibraryDataset = {
  contractVersion: CONTRACT_VERSION,
  models: FIXTURE_MODELS,
  recommendations: FIXTURE_RECOMMENDATIONS,
  routingRecords: FIXTURE_ROUTING_RECORDS,
  stats: FIXTURE_STATS,
};
