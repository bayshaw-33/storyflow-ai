/**
 * Sprint 0: dual-jurisdiction compliance export gate — shared types.
 *
 * ERASABLE SYNTAX ONLY (Node type-stripping): no enums, no namespaces,
 * no parameter properties. String unions + `as const` objects only.
 */

export type JurisdictionProfile = "EU_ART50" | "CN_AIGC" | "EU_CN_DUAL" | "INTERNAL_ONLY";
export type ContentKind = "text" | "image" | "audio" | "video" | "document";
export type VisibleDisclosureMode = "none" | "ui" | "watermark" | "end_card" | "credits";

export const JURISDICTION_PROFILES: readonly JurisdictionProfile[] = [
  "EU_ART50",
  "CN_AIGC",
  "EU_CN_DUAL",
  "INTERNAL_ONLY",
];

export interface MarkingRequest {
  assetId: string;
  assetVersionId: string;
  contentKind: ContentKind;
  inputPath: string;
  outputPath: string;
  jurisdictionProfile: JurisdictionProfile;
  aiGenerated: boolean;
  aiModified: boolean;
  providerCode: string;
  contentId: string;
  modelProvider?: string;
  modelName?: string;
  modelVersion?: string;
  projectId?: string;
  episodeId?: string;
  visibleDisclosureMode: VisibleDisclosureMode;
}

export interface MarkingResult {
  success: boolean;
  machineReadableFormats: string[];
  visibleDisclosureApplied: boolean;
  c2paManifestId?: string;
  metadataHash: string;
  verificationReport: Record<string, unknown>;
  errors: string[];
}

/** Union of the 10 compliance feature-flag names (see feature-flags.ts). */
export type ComplianceFlag =
  | "COMPLIANCE_EXPORT_GATE"
  | "EU_ART50_MACHINE_MARKING"
  | "EU_ART50_VISIBLE_DISCLOSURE"
  | "EU_ART50_STRICT_EXPORT_BLOCK"
  | "CN_AIGC_MACHINE_MARKING"
  | "CN_AIGC_VISIBLE_MARKING"
  | "CN_AIGC_STRICT_EXPORT_BLOCK"
  | "DUAL_JURISDICTION_MARKING"
  | "UNMARKED_EXPORT_EXCEPTION"
  | "GDPR_REGION_ROUTING";

export type GateStepCode =
  | "validate_asset"
  | "resolve_jurisdiction"
  | "resolve_disclosure_policy"
  | "apply_marking"
  | "verify_marking"
  | "write_compliance_record"
  | "allow_download";

export type BlockingCode =
  | "jurisdiction_missing"
  | "ai_status_unknown"
  | "machine_marking_failed"
  | "verification_failed"
  | "voice_license_missing"
  | "reference_rights_blocked"
  | "disclosure_mode_missing"
  | "unsupported_format"
  | "compliance_record_write_failed"
  | "feature_disabled";

export interface GateStep {
  step: string;
  status: "ok" | "blocked" | "failed" | "skipped";
  detail?: string;
}

export interface GateDecision {
  decision: "allowed" | "blocked" | "failed";
  blockingCode?: BlockingCode;
  steps: GateStep[];
}

/** Canonical AI manifest embedded into every exported artifact (snake_case keys). */
export interface AiManifest {
  schema_version: string;
  platform: string;
  asset_id: string;
  asset_version_id: string;
  content_kind: ContentKind;
  ai_generated: boolean;
  ai_modified: boolean;
  jurisdiction_profile: JurisdictionProfile;
  provider_code: string;
  content_id: string;
  model_provider?: string;
  model_name?: string;
  model_version?: string;
  project_id?: string;
  episode_id?: string;
  created_at: string;
  visible_disclosure_mode: VisibleDisclosureMode;
  synthetic_voice?: boolean;
  voice_profile_ref?: string;
  voice_license_status?: string;
}

/** Extra inputs that do not belong on the wire-level MarkingRequest. */
export interface ComplianceExtra {
  syntheticVoice?: boolean;
  voiceProfileRef?: string;
  voiceLicenseStatus?: string;
  referenceRightsStatus?: string;
  /** Deterministic timestamp override for tests / reproducible exports. */
  createdAt?: string;
}

/** Row shape for public.storyflow_ai_label_records (see migration 20260718000000). */
export interface LabelRecordRow {
  id?: string;
  owner_id: string;
  asset_id: string;
  asset_version_id: string;
  export_id: string;
  content_kind: ContentKind;
  ai_generated: boolean;
  ai_modified: boolean;
  jurisdiction_profile: JurisdictionProfile;
  provider_code: string;
  content_id: string;
  machine_readable_formats: string[];
  visible_disclosure_mode: VisibleDisclosureMode;
  c2pa_manifest_id: string | null;
  metadata_hash: string;
  verification_json: Record<string, unknown>;
  status: "marked" | "verified" | "failed" | "blocked";
  error_code: string | null;
  created_at?: string;
}

/** Row shape for public.storyflow_export_compliance_runs (see migration 20260718000000). */
export interface ComplianceRunRow {
  id?: string;
  owner_id: string;
  project_id: string | null;
  asset_id: string;
  asset_version_id: string;
  content_kind: ContentKind;
  jurisdiction_profile: JurisdictionProfile;
  decision: "allowed" | "blocked" | "failed";
  blocking_reason_code: string | null;
  gate_steps_json: GateStep[];
  label_record_id: string | null;
  metadata: Record<string, unknown>;
  created_at?: string;
}

/** One pinned interface implemented by every Phase-0 format writer. */
export interface FormatWriteResult {
  /** Marked file bytes (or, for sidecar formats, the original bytes unchanged). */
  outputBytes: Uint8Array;
  /** e.g. ["png-itxt","png-text"], ["id3v2.4-txxx"], ["pdf-info-dict"], ["sidecar-manifest"]. */
  machineReadableFormats: string[];
  /** Set only for sidecar formats (txt/md/srt): the .ai-manifest.json content. */
  sidecarBytes?: Uint8Array;
  extraVerification?: Record<string, unknown>;
}

export interface FormatVerifyResult {
  found: boolean;
  extractedManifest?: Record<string, unknown>;
  detail?: string;
}

/**
 * pdf-lib is async, so writers/verifiers may return a Promise. The adapter
 * always awaits. Writers THROW (fail-closed) on corrupt/unsupported input.
 */
export type FormatWriter = (
  inputBytes: Uint8Array,
  manifest: AiManifest,
  request: MarkingRequest,
) => FormatWriteResult | Promise<FormatWriteResult>;

export type FormatVerifier = (
  outputBytes: Uint8Array,
  ctx: { sidecarBytes?: Uint8Array },
) => FormatVerifyResult | Promise<FormatVerifyResult>;
