/**
 * TRAE-V2-07 Production Package 与资产清单
 * 类型定义
 *
 * 导出包结构：
 *   production-package/
 *   ├─ manifest.json           # 本文件元信息 + 所有子文件 hash
 *   ├─ universe/
 *   │  ├─ canon.json
 *   │  └─ character-graph.json
 *   ├─ characters/
 *   │  ├─ passports.json
 *   │  └─ voice-profiles.json
 *   ├─ script/
 *   │  ├─ episode.md
 *   │  └─ scenes.json
 *   ├─ director/
 *   │  ├─ shot-list.csv
 *   │  └─ prompts.json
 *   ├─ media/
 *   │  ├─ selected-takes.json
 *   │  ├─ voice-lines.json
 *   │  └─ assets.json
 *   ├─ assembly/
 *   │  └─ kiikis.timeline.json
 *   └─ evidence/
 *      └─ generation-jobs.json
 *
 * 规则：
 *   - 不写 API Key、Provider 原始错误、过期签名 URL
 *   - 缺失素材必须显式标记 missing
 *   - 失败项不伪造空文件
 */

// ============================================================
// Manifest
// ============================================================

/**
 * 单个文件的元信息
 */
export type ManifestEntry = {
  /** 包内相对路径，例如 "universe/canon.json" */
  path: string;
  /** SHA-256 hex 哈希；missing 时为空字符串 */
  hash: string;
  /** 文件字节数；missing 时为 0 */
  size: number;
  /** 文件状态 */
  status: "ok" | "missing" | "empty" | "failed";
  /** 当 status != "ok" 时的人类可读原因 */
  reason?: string;
};

/**
 * 完整 Manifest
 */
export type ProductionManifest = {
  /** 协议版本 */
  schemaVersion: "kiikis.production-package/1";
  /** 导出时间 ISO */
  exportedAt: string;
  /** 导出者 user id（脱敏后保留前 8 位） */
  exportedBy: string;
  /** 关联项目稳定 ID */
  projectId: string;
  /** 关联集数稳定 ID */
  sourceUnitId: string;
  /** 关联 Universe ID（若 project 关联） */
  universeId: string | null;
  /** 关联 Production Project ID */
  productionProjectId: string | null;
  /** 所有文件条目 */
  entries: ManifestEntry[];
  /** 整包 SHA-256（对所有 entries 的 hash 串联后再哈希） */
  packageHash: string;
  /** 整包统计 */
  summary: {
    totalFiles: number;
    okFiles: number;
    missingFiles: number;
    failedFiles: number;
  };
  /** 脱敏标记 */
  redacted: {
    apiKeys: boolean;
    providerRawErrors: boolean;
    signedUrls: boolean;
  };
};

// ============================================================
// 数据载荷类型（各子文件 JSON 结构）
// ============================================================

export type UniverseCanonPayload = {
  universeId: string;
  universeName: string;
  canonFacts: Array<{
    id: string;
    title: string;
    content: string;
    status: string;
    createdAt: string;
  }>;
};

export type CharacterGraphPayload = {
  universeId: string;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    status: string;
    label?: string;
  }>;
};

export type CharacterPassportsPayload = {
  projectId: string;
  passports: Array<{
    characterId: string;
    characterName: string;
    actorProfileId: string | null;
    actorName: string | null;
    portrayalId: string | null;
    appearanceVariantId: string | null;
    identityCorePrompt: string | null;
    visualDNA: Record<string, unknown> | null;
    forbiddenChanges: string[];
    voiceProfileId: string | null;
  }>;
};

export type VoiceProfilesPayload = {
  projectId: string;
  profiles: Array<{
    id: string;
    characterId: string;
    displayName: string;
    language: string;
    locale: string | null;
    provider: string;
    providerVoiceId: string;
    timbreTags: string[];
    speakingRate: number;
    pitch: number;
    licenseStatus: string;
    status: string;
  }>;
};

export type ScriptEpisodePayload = {
  projectId: string;
  sourceUnitId: string;
  title: string;
  contentMd: string;
  wordCount: number;
};

export type ScriptScenesPayload = {
  projectId: string;
  scenes: Array<{
    id: string;
    sceneNumber: number;
    location: string | null;
    timeOfDay: string | null;
    functionRole: string | null;
    characters: string[];
    conflict: string | null;
    emotion: string | null;
    durationTarget: number | null;
    directorMeta: Record<string, unknown> | null;
    locked: boolean;
  }>;
};

export type DirectorShotListPayload = {
  projectId: string;
  /** CSV 文本（UTF-8 with BOM） */
  csv: string;
  shots: Array<{
    id: string;
    sceneId: string;
    shotNumber: number;
    shotType: string | null;
    cameraAngle: string | null;
    focalLength: string | null;
    duration: number | null;
    dialogue: string | null;
    locked: boolean;
  }>;
};

export type DirectorPromptsPayload = {
  projectId: string;
  prompts: Array<{
    shotId: string;
    imagePrompt: string | null;
    videoPrompt: string | null;
    negativeRules: string[];
    providerParams: Record<string, unknown> | null;
    promptHash: string | null;
  }>;
};

export type MediaSelectedTakesPayload = {
  projectId: string;
  takes: Array<{
    id: string;
    shotId: string;
    takeLabel: string | null;
    status: string;
    assetId: string | null;
    storagePath: string | null;
    /** 不包含签名 URL；只保留稳定标识 */
    providerName: string | null;
    modelName: string | null;
    createdAt: string;
  }>;
};

export type MediaVoiceLinesPayload = {
  projectId: string;
  voiceLines: Array<{
    id: string;
    shotId: string | null;
    characterId: string | null;
    voiceProfileId: string | null;
    dialogueText: string;
    status: string;
    approvedAssetId: string | null;
    storagePath: string | null;
    locale: string | null;
  }>;
};

export type MediaAssetsPayload = {
  projectId: string;
  assets: Array<{
    id: string;
    assetType: string;
    storagePath: string;
    /** 文件大小（字节） */
    sizeBytes: number | null;
    mimeType: string | null;
    /** 不暴露原始签名 URL，只保留稳定标识 */
    sourceJobId: string | null;
    shotId: string | null;
    characterId: string | null;
    createdAt: string;
  }>;
};

export type AssemblyTimelinePayload = {
  projectId: string;
  sourceUnitId: string;
  /** kiikis.timeline/1 DTO */
  timeline: unknown;
  sequence: {
    id: string;
    status: string;
    editorStatus: string | null;
    editorEngine: string | null;
  };
};

export type EvidenceGenerationJobsPayload = {
  projectId: string;
  jobs: Array<{
    id: string;
    jobType: string;
    provider: string;
    model: string | null;
    status: string;
    /** 脱敏：只保留 error_code，不含原始正文 */
    errorCode: string | null;
    targetType: string;
    targetId: string | null;
    shotId: string | null;
    createdAt: string;
    completedAt: string | null;
    durationMs: number | null;
  }>;
};

// ============================================================
// 完整 Production Package
// ============================================================

export type ProductionPackage = {
  manifest: ProductionManifest;
  files: Array<{
    path: string;
    content: string;
    mimeType: string;
  }>;
};

// ============================================================
// 错误类型
// ============================================================

export type ExportErrorCode =
  | "UNAUTHENTICATED"
  | "SCOPE_NOT_FOUND"
  | "PROJECT_NOT_FOUND"
  | "UNIVERSE_NOT_LINKED"
  | "EXPORT_BLOCKED"
  | "VALIDATION_FAILED"
  | "INTERNAL_ERROR";

export class ExportError extends Error {
  constructor(
    public code: ExportErrorCode,
    message: string,
    public httpStatus: number = 500,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

export function isExportError(error: unknown): error is ExportError {
  return error instanceof ExportError;
}
