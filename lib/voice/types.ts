/**
 * Voice Profile + Voice Line 类型定义（TRAE-V2-03）
 *
 * 设计文档：Kiikis-V2.0-TRAE-80%-执行PRD.md §TRAE-V2-03
 */

export type VoiceProviderName =
  | "placeholder"
  | "openai"
  | "elevenlabs"
  | "volc"
  | "azure";

export type VoiceProfileStatus = "draft" | "ready" | "archived";

export type VoiceLineStatus =
  | "draft"
  | "ready"
  | "queued"
  | "generating"
  | "result_ingesting"
  | "generated"
  | "approved"
  | "failed"
  | "provider_timeout"
  | "moderation_blocked";

// ============================================================
// DTO
// ============================================================

export type VoiceProfileDTO = {
  id: string;
  ownerId: string;
  actorProfileId: string | null;
  universeEntityId: string | null;
  voiceLabel: string;
  voiceProvider: VoiceProviderName;
  voiceProviderVoiceId: string | null;
  language: string;
  speed: number;
  pitch: number;
  stability: number;
  stylePrompt: string;
  sampleAssetUrl: string | null;
  status: VoiceProfileStatus;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

export type VoiceLineDTO = {
  id: string;
  ownerId: string;
  voiceProfileId: string;
  text: string;
  language: string;
  ssml: string | null;
  projectId: string | null;
  sceneId: string | null;
  shotId: string | null;
  latestJobId: string | null;
  assetId: string | null;
  audioUrl: string | null;
  signedUrlExpiresAt: string | null;
  status: VoiceLineStatus;
  error: string | null;
  durationSeconds: number | null;
  revision: number;
  isApproved: boolean;
  updatedAt: string;
  completedAt: string | null;
};

// ============================================================
// 输入
// ============================================================

export type CreateVoiceProfileInput = {
  actorProfileId?: string;
  universeEntityId?: string;
  voiceLabel?: string;
  voiceProvider?: VoiceProviderName;
  voiceProviderVoiceId?: string;
  language?: string;
  speed?: number;
  pitch?: number;
  stability?: number;
  stylePrompt?: string;
};

export type UpdateVoiceProfileInput = Partial<CreateVoiceProfileInput> & {
  status?: VoiceProfileStatus;
};

export type CreateVoiceLineInput = {
  voiceProfileId: string;
  text: string;
  language?: string;
  ssml?: string;
  projectId?: string;
  sceneId?: string;
  shotId?: string;
};

export type UpdateVoiceLineInput = {
  text?: string;
  language?: string;
  ssml?: string;
  projectId?: string;
  sceneId?: string;
  shotId?: string;
};
