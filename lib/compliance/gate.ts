/**
 * Export Gate.
 *
 * Executes the compliance pipeline steps IN ORDER and records every step:
 *   validate_asset → resolve_jurisdiction → resolve_disclosure_policy
 *   → apply_marking → verify_marking → write_compliance_record → allow_download
 *
 * Fail-closed policy (EU/CN formal exports): marking write failure,
 * verification failure, or compliance-record write failure all mean
 * NO download. UNMARKED_EXPORT_EXCEPTION=true downgrades only the
 * disclosure block (never voice-license / reference-rights blocks).
 */

import { composeVisibleDisclosure } from "./disclosure.ts";
import { resolveComplianceFlags } from "./feature-flags.ts";
import type { ComplianceLogSink } from "./log-writer.ts";
import { buildAiManifest } from "./manifest.ts";
import type {
  AiManifest,
  BlockingCode,
  ComplianceExtra,
  ComplianceFlag,
  ComplianceRunRow,
  GateDecision,
  GateStep,
  GateStepCode,
  JurisdictionProfile,
  LabelRecordRow,
  MarkingRequest,
} from "./types.ts";
import { JURISDICTION_PROFILES } from "./types.ts";

export const GATE_STEP_ORDER: readonly GateStepCode[] = [
  "validate_asset",
  "resolve_jurisdiction",
  "resolve_disclosure_policy",
  "apply_marking",
  "verify_marking",
  "write_compliance_record",
  "allow_download",
];

export interface PerformedMarking {
  machineReadableFormats: string[];
  metadataHash: string;
  verificationReport: Record<string, unknown>;
  verified: boolean;
  c2paManifestId?: string;
}

export interface GateInput {
  request: MarkingRequest;
  extra?: ComplianceExtra;
  /** Resolved by the adapter from the file extension; undefined = unknown format. */
  formatKey?: string;
  /** Pre-built manifest (adapter passes the one used for marking, keeping created_at stable). */
  manifest?: AiManifest;
  /** Adapter-injected writer+verifier callback invoked at the apply_marking step. */
  performMarking?: () => Promise<PerformedMarking>;
}

export interface GateDeps {
  sink: ComplianceLogSink;
  env?: NodeJS.ProcessEnv;
  ownerId?: string;
  exportId?: string;
}

export interface GateEvaluation extends GateDecision {
  resolvedFlags: Record<ComplianceFlag, boolean>;
  labelRecordId?: string;
  runRecordId?: string;
  marking?: PerformedMarking;
  markingSkipped?: boolean;
}

export interface ProfilePolicy {
  machineMarkingRequired: boolean;
  /** Flag that must be ON for marking to be permitted (undefined = always permitted). */
  markingFlag?: ComplianceFlag;
  strictExportBlock: boolean;
  visibleDisclosureRequired: boolean;
}

/** Pure policy resolution — exported for unit tests (no I/O). */
export function resolveProfilePolicy(
  profile: JurisdictionProfile,
  flags: Record<ComplianceFlag, boolean>,
): ProfilePolicy {
  if (profile === "EU_ART50") {
    return {
      machineMarkingRequired: flags.EU_ART50_MACHINE_MARKING,
      markingFlag: "EU_ART50_MACHINE_MARKING",
      strictExportBlock: flags.EU_ART50_STRICT_EXPORT_BLOCK,
      visibleDisclosureRequired: flags.EU_ART50_VISIBLE_DISCLOSURE || flags.EU_ART50_STRICT_EXPORT_BLOCK,
    };
  }
  if (profile === "CN_AIGC") {
    return {
      machineMarkingRequired: flags.CN_AIGC_MACHINE_MARKING,
      markingFlag: "CN_AIGC_MACHINE_MARKING",
      strictExportBlock: flags.CN_AIGC_STRICT_EXPORT_BLOCK,
      visibleDisclosureRequired: flags.CN_AIGC_VISIBLE_MARKING || flags.CN_AIGC_STRICT_EXPORT_BLOCK,
    };
  }
  if (profile === "EU_CN_DUAL") {
    return {
      machineMarkingRequired: flags.DUAL_JURISDICTION_MARKING,
      markingFlag: "DUAL_JURISDICTION_MARKING",
      strictExportBlock: flags.EU_ART50_STRICT_EXPORT_BLOCK || flags.CN_AIGC_STRICT_EXPORT_BLOCK,
      visibleDisclosureRequired:
        flags.EU_ART50_VISIBLE_DISCLOSURE ||
        flags.CN_AIGC_VISIBLE_MARKING ||
        flags.EU_ART50_STRICT_EXPORT_BLOCK ||
        flags.CN_AIGC_STRICT_EXPORT_BLOCK,
    };
  }
  // INTERNAL_ONLY: mark when possible, never strict-block on disclosure.
  return {
    machineMarkingRequired: true,
    markingFlag: undefined,
    strictExportBlock: false,
    visibleDisclosureRequired: false,
  };
}

function isValidProfile(profile: string): profile is JurisdictionProfile {
  return (JURISDICTION_PROFILES as readonly string[]).includes(profile);
}

function buildLabelRow(params: {
  request: MarkingRequest;
  ownerId: string;
  exportId: string;
  status: LabelRecordRow["status"];
  errorCode: string | null;
  marking?: PerformedMarking;
  storedProfile: JurisdictionProfile;
}): LabelRecordRow {
  const { request } = params;
  return {
    owner_id: params.ownerId,
    asset_id: request.assetId,
    asset_version_id: request.assetVersionId,
    export_id: params.exportId,
    content_kind: request.contentKind,
    ai_generated: request.aiGenerated,
    ai_modified: request.aiModified,
    jurisdiction_profile: params.storedProfile,
    provider_code: request.providerCode,
    content_id: request.contentId,
    machine_readable_formats: params.marking?.machineReadableFormats ?? [],
    visible_disclosure_mode: request.visibleDisclosureMode,
    c2pa_manifest_id: params.marking?.c2paManifestId ?? null,
    metadata_hash: params.marking?.metadataHash ?? "",
    verification_json: params.marking?.verificationReport ?? {},
    status: params.status,
    error_code: params.errorCode,
  };
}

export async function runExportGate(input: GateInput, deps: GateDeps): Promise<GateEvaluation> {
  const flags = resolveComplianceFlags(deps.env);
  const { request, extra } = input;
  const steps: GateStep[] = GATE_STEP_ORDER.map((step) => ({ step, status: "skipped" as const }));

  const setStep = (code: GateStepCode, status: GateStep["status"], detail?: string) => {
    const entry = steps.find((item) => item.step === code);
    if (!entry) return;
    entry.status = status;
    if (detail) entry.detail = detail;
  };

  let decision: GateDecision["decision"] = "allowed";
  let blockingCode: BlockingCode | undefined;
  let skipMarking = false;
  let performed: PerformedMarking | undefined;

  const ownerId = deps.ownerId ?? "";
  const exportId = deps.exportId ?? crypto.randomUUID();
  const storedProfile: JurisdictionProfile = isValidProfile(request.jurisdictionProfile)
    ? request.jurisdictionProfile
    : "INTERNAL_ONLY";

  const persistRecords = async (labelStatus: LabelRecordRow["status"] | null, errorCode: string | null) => {
    // Compliance Log Writer — failures fail closed (no download).
    let labelRecordId: string | undefined;
    if (labelStatus) {
      const labelRow = buildLabelRow({
        request,
        ownerId,
        exportId,
        status: labelStatus,
        errorCode,
        marking: performed,
        storedProfile,
      });
      labelRecordId = (await deps.sink.writeLabelRecord(labelRow)).id;
    }
    const runRow: ComplianceRunRow = {
      owner_id: ownerId,
      project_id: request.projectId ?? null,
      asset_id: request.assetId ?? "",
      asset_version_id: request.assetVersionId ?? "",
      content_kind: request.contentKind ?? "document",
      jurisdiction_profile: storedProfile,
      decision,
      blocking_reason_code: blockingCode ?? null,
      gate_steps_json: steps,
      label_record_id: labelRecordId ?? null,
      metadata: {
        export_id: exportId,
        format_key: input.formatKey ?? null,
        raw_jurisdiction_profile: request.jurisdictionProfile,
        marking_skipped: skipMarking,
        synthetic_voice: extra?.syntheticVoice ?? null,
        voice_license_status: extra?.voiceLicenseStatus ?? null,
        reference_rights_status: extra?.referenceRightsStatus ?? null,
        resolved_flags: flags,
      },
    };
    const runRecordId = (await deps.sink.writeRunRecord(runRow)).id;
    return { labelRecordId, runRecordId };
  };

  const finish = async (labelStatus: LabelRecordRow["status"] | null): Promise<GateEvaluation> => {
    let labelRecordId: string | undefined;
    let runRecordId: string | undefined;
    try {
      const ids = await persistRecords(labelStatus, blockingCode ?? null);
      labelRecordId = ids.labelRecordId;
      runRecordId = ids.runRecordId;
      if (flags.COMPLIANCE_EXPORT_GATE) setStep("write_compliance_record", "ok");
    } catch (error) {
      // fail closed: the audit record itself could not be written
      decision = "failed";
      blockingCode = "compliance_record_write_failed";
      setStep("write_compliance_record", "failed", error instanceof Error ? error.message : String(error));
    }
    if (decision === "allowed" && flags.COMPLIANCE_EXPORT_GATE) {
      setStep("allow_download", "ok", "download_permitted");
    }
    return {
      decision,
      blockingCode,
      steps,
      resolvedFlags: flags,
      labelRecordId,
      runRecordId,
      marking: performed,
      markingSkipped: skipMarking,
    };
  };

  const block = (code: BlockingCode, step: GateStepCode, detail: string) => {
    decision = "blocked";
    blockingCode = code;
    setStep(step, "blocked", detail);
  };

  const fail = (code: BlockingCode | undefined, step: GateStepCode, detail: string) => {
    decision = "failed";
    blockingCode = code;
    setStep(step, "failed", detail);
  };

  // --- Gate master switch: disabled → allow, but still audit the run. ---
  if (!flags.COMPLIANCE_EXPORT_GATE) {
    for (const code of GATE_STEP_ORDER) setStep(code, "skipped", "gate_disabled");
    return finish(null);
  }

  // --- validate_asset ---
  if (!request.assetId || !request.assetVersionId || !request.contentKind) {
    fail(undefined, "validate_asset", "asset_fields_missing");
    return finish("failed");
  }
  if (!input.formatKey) {
    block("unsupported_format", "validate_asset", `no compliance writer for ${request.inputPath}`);
    return finish("blocked");
  }
  setStep("validate_asset", "ok", `format=${input.formatKey}`);

  // --- resolve_jurisdiction ---
  if (!isValidProfile(request.jurisdictionProfile)) {
    block("jurisdiction_missing", "resolve_jurisdiction", `unknown profile: ${String(request.jurisdictionProfile)}`);
    return finish("blocked");
  }
  if (typeof request.aiGenerated !== "boolean" || typeof request.aiModified !== "boolean") {
    block("ai_status_unknown", "resolve_jurisdiction", "ai_generated/ai_modified must be explicit booleans");
    return finish("blocked");
  }
  setStep("resolve_jurisdiction", "ok", request.jurisdictionProfile);

  // --- resolve_disclosure_policy ---
  const profile = request.jurisdictionProfile;
  const policy = resolveProfilePolicy(profile, flags);

  // The marking feature flag must be ON for EU/CN profiles: strict-block ON
  // → blocked feature_disabled; strict-block OFF → skip marking, still allow.
  if (policy.markingFlag && !flags[policy.markingFlag]) {
    if (policy.strictExportBlock) {
      block("feature_disabled", "resolve_disclosure_policy", `flag ${policy.markingFlag} disabled with strict export block on`);
      return finish("blocked");
    }
    skipMarking = true;
  }

  if (request.contentKind === "audio" && extra?.syntheticVoice === true && extra?.voiceLicenseStatus !== "licensed") {
    block("voice_license_missing", "resolve_disclosure_policy", "synthetic voice export without voice license");
    return finish("blocked");
  }

  if (extra?.referenceRightsStatus === "blocked") {
    block("reference_rights_blocked", "resolve_disclosure_policy", "reference material rights status is blocked");
    return finish("blocked");
  }

  if (policy.visibleDisclosureRequired) {
    const manifest = input.manifest ?? buildAiManifest(request, extra);
    const disclosure = composeVisibleDisclosure(manifest, request.visibleDisclosureMode, profile);
    const unsatisfied =
      request.visibleDisclosureMode === "none" || !disclosure.supported || !disclosure.applied;
    if (unsatisfied) {
      const reason =
        request.visibleDisclosureMode === "none"
          ? "strict profile requires a visible disclosure mode"
          : `disclosure mode ${request.visibleDisclosureMode} not satisfied (supported=${disclosure.supported}, applied=${disclosure.applied})`;
      if (flags.UNMARKED_EXPORT_EXCEPTION) {
        setStep("resolve_disclosure_policy", "ok", `unmarked_exception_applied: ${reason}`);
      } else {
        block("disclosure_mode_missing", "resolve_disclosure_policy", reason);
        return finish("blocked");
      }
    } else {
      setStep("resolve_disclosure_policy", "ok", `disclosure=${request.visibleDisclosureMode}`);
    }
  } else {
    setStep("resolve_disclosure_policy", "ok", skipMarking ? "marking_flag_disabled_strict_off" : "policy_resolved");
  }

  // --- apply_marking ---
  if (skipMarking) {
    setStep("apply_marking", "skipped", "marking_flag_disabled");
  } else {
    if (!input.performMarking) {
      fail("machine_marking_failed", "apply_marking", "no marking callback provided");
      return finish("failed");
    }
    try {
      performed = await input.performMarking();
      setStep("apply_marking", "ok", performed.machineReadableFormats.join("+") || "marked");
    } catch (error) {
      fail("machine_marking_failed", "apply_marking", error instanceof Error ? error.message : String(error));
      return finish("failed");
    }
  }

  // --- verify_marking ---
  if (skipMarking) {
    setStep("verify_marking", "skipped", "marking_flag_disabled");
  } else if (!performed || !performed.verified) {
    fail("verification_failed", "verify_marking", "re-read verification did not confirm the embedded manifest");
    return finish("failed");
  } else {
    setStep("verify_marking", "ok", "verification_passed");
  }

  return finish(decision === "allowed" ? (skipMarking ? "marked" : "verified") : "failed");
}
