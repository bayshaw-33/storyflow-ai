/**
 * POST /api/exports/request — Export Request API
 *
 * 任务卡：KIIKIS-TR-G0-002-3
 *
 * 接收 ExportRequestInput JSON，走 ComplianceMarkingAdapter Gate 流水线，
 * 打包标记后的产物（ZIP: original + .ai-manifest.json + disclosure.txt），
 * 上传到 exports 存储桶，返回短期签名下载 URL。
 *
 * Phase 0 仅同步处理 project_json / project_markdown；
 * 其余 sourceKind 返回 422 引导到 /api/compliance/export。
 *
 * 安全边界：
 *   - jurisdictionProfile / aiOrigin / sourceKind / exportType / visibleDisclosureMode
 *     均由服务端枚举校验，客户端不可注入任意值。
 *   - contentId 由服务端基于内容 SHA-256 生成（serverContentId），客户端不可伪造。
 *   - aiGenerated / aiModified 布尔由服务端从 aiOrigin 推导，客户端不直接提交。
 */

import JSZip from "jszip";
import { NextRequest } from "next/server";

import { apiError, ok } from "@/lib/api/responses";
import { runComplianceMarking } from "@/lib/compliance/adapter";
import type { AdapterRequest } from "@/lib/compliance/adapter";
import { createSupabaseSink } from "@/lib/compliance/log-writer";
import { serverContentId } from "@/lib/compliance/manifest";
import type { JurisdictionProfile, VisibleDisclosureMode } from "@/lib/compliance/types";
import { uploadExportArtifact } from "@/lib/exports/storage";
import { recordEvidenceEvent } from "@/lib/evidence/ledger";
import { exportEvidenceEvent } from "@/lib/evidence/hooks";
import type {
  AiOrigin,
  ExportRequestInput,
  ExportRequestResponse,
  ExportSourceKind,
  ExportType,
} from "@/lib/exports/types";
import { deriveAiFlags, extensionForExportType, resolveContentKind } from "@/lib/exports/types";
import { buildExportPayload, renderExportMarkdown } from "@/lib/supabase/phase2";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PROFILES: readonly JurisdictionProfile[] = ["EU_ART50", "CN_AIGC", "EU_CN_DUAL", "INTERNAL_ONLY"];
const VALID_AI_ORIGINS: readonly AiOrigin[] = ["ai_generated", "ai_modified", "human_only", "unknown"];
const VALID_SOURCE_KINDS: readonly ExportSourceKind[] = [
  "project_json",
  "project_markdown",
  "universe_json",
  "production_script",
  "production_assembly",
  "archive_manifest",
  "viral_script",
  "video_render",
  "art_asset",
  "custom",
];
const VALID_EXPORT_TYPES: readonly ExportType[] = ["markdown", "json", "docx", "pdf", "image", "audio", "video", "archive", "compliance_package"];
const VALID_DISCLOSURE_MODES: readonly VisibleDisclosureMode[] = ["none", "ui", "watermark", "end_card", "credits"];

/** Phase 0 仅同步处理这两种 sourceKind，其余引导到 multipart 接口。 */
const PHASE0_SYNC_SOURCES: readonly ExportSourceKind[] = ["project_json", "project_markdown"];

function validateEnum<T extends string>(
  value: unknown,
  valid: readonly T[],
  fieldName: string,
): T {
  if (typeof value !== "string" || !(valid as readonly string[]).includes(value)) {
    throw new Error(`INVALID_ENUM:${fieldName}`);
  }
  return value as T;
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return apiError(new Error("SUPABASE_SERVICE_ERROR:not_configured"), "导出服务未配置。", 503);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return apiError(new Error("INVALID_BODY"), "请求体必须是 JSON。", 400);
    }

    const input = body as Partial<ExportRequestInput>;
    if (typeof input.projectId !== "string" || !input.projectId) {
      return apiError(new Error("MISSING_PROJECT_ID"), "缺少 projectId。", 400);
    }
    if (typeof input.providerCode !== "string" || !input.providerCode) {
      return apiError(new Error("MISSING_PROVIDER_CODE"), "缺少 providerCode。", 400);
    }

    let jurisdictionProfile: JurisdictionProfile;
    let aiOrigin: AiOrigin;
    let sourceKind: ExportSourceKind;
    let exportType: ExportType;
    let visibleDisclosureMode: VisibleDisclosureMode;
    try {
      jurisdictionProfile = validateEnum(input.jurisdictionProfile, VALID_PROFILES, "jurisdictionProfile");
      aiOrigin = validateEnum(input.aiOrigin, VALID_AI_ORIGINS, "aiOrigin");
      sourceKind = validateEnum(input.sourceKind, VALID_SOURCE_KINDS, "sourceKind");
      exportType = validateEnum(input.exportType, VALID_EXPORT_TYPES, "exportType");
      visibleDisclosureMode = validateEnum(input.visibleDisclosureMode, VALID_DISCLOSURE_MODES, "visibleDisclosureMode");
    } catch (error) {
      return apiError(error, "请求参数不合法。", 422);
    }

    if (!(PHASE0_SYNC_SOURCES as readonly string[]).includes(sourceKind)) {
      return apiError(
        new Error("UNSUPPORTED_SOURCE_KIND"),
        `Phase 0 暂不支持 sourceKind=${sourceKind}，请使用 /api/compliance/export。`,
        422,
      );
    }

    const { aiGenerated, aiModified } = deriveAiFlags(aiOrigin);
    const contentKind = resolveContentKind(sourceKind);
    const extension = extensionForExportType(exportType);
    const exportId = input.idempotencyKey || crypto.randomUUID();
    const assetId = `export:${exportId}`;
    const assetVersionId = `v1:${exportId}`;
    const now = new Date().toISOString();

    // --- 构造 payload 字节 ---
    let payloadText: string;
    let contentType: string;
    if (sourceKind === "project_json") {
      const payload = await buildExportPayload(user.id, input.projectId);
      payloadText = JSON.stringify(payload, null, 2);
      contentType = "application/json";
    } else {
      const payload = await buildExportPayload(user.id, input.projectId);
      payloadText = renderExportMarkdown(payload);
      contentType = "text/markdown; charset=utf-8";
    }
    const inputBytes = new TextEncoder().encode(payloadText);

    // --- 服务端生成 content_id（基于内容 SHA-256，不可伪造） ---
    const contentId = serverContentId(inputBytes);

    // --- 插入 pending_request 记录 ---
    await serviceFetch("/rest/v1/storyflow_exports", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id: exportId,
        user_id: user.id,
        project_id: input.projectId,
        export_type: exportType,
        format: extension,
        payload_json: {},
        status: "pending_request",
        jurisdiction_profile: jurisdictionProfile,
        ai_origin: aiOrigin,
        content_id: contentId,
        provider_code: input.providerCode,
        visible_disclosure_mode: visibleDisclosureMode,
        source_kind: sourceKind,
        created_at: now,
        updated_at: now,
      }),
    });

    // --- 标记 marking ---
    await serviceFetch(`/rest/v1/storyflow_exports?id=eq.${encodeURIComponent(exportId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "marking", updated_at: new Date().toISOString() }),
    });

    // --- 走 Compliance Gate ---
    const adapterRequest: AdapterRequest = {
      assetId,
      assetVersionId,
      contentKind,
      inputPath: `export.${extension}`,
      outputPath: `export.${extension}`,
      jurisdictionProfile,
      aiGenerated,
      aiModified,
      providerCode: input.providerCode,
      contentId,
      projectId: input.projectId,
      episodeId: input.episodeId,
      visibleDisclosureMode,
      inputBytes,
      extra: {
        syntheticVoice: input.syntheticVoice,
        voiceLicenseStatus: input.voiceLicenseStatus,
        referenceRightsStatus: input.referenceRightsStatus,
      },
    };

    const result = await runComplianceMarking(adapterRequest, {
      sink: createSupabaseSink(serviceFetch),
      env: process.env,
      ownerId: user.id,
      exportId,
    });

    const { gate, marking, output } = result;
    const metadataHash = marking?.metadataHash ?? "";
    const labelRecordId = gate.labelRecordId ?? null;
    const complianceRunId = gate.runRecordId ?? null;

    // --- blocked / failed ---
    if (gate.decision === "blocked" || gate.decision === "failed") {
      await serviceFetch(`/rest/v1/storyflow_exports?id=eq.${encodeURIComponent(exportId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: gate.decision === "blocked" ? "blocked" : "failed",
          blocking_reason_code: gate.blockingCode ?? null,
          compliance_run_id: complianceRunId,
          label_record_id: labelRecordId,
          metadata_hash: metadataHash || null,
          verification_status: gate.decision === "blocked" ? "blocked" : "failed",
          updated_at: new Date().toISOString(),
        }),
      });

      const response: ExportRequestResponse = {
        exportId,
        contentId,
        status: gate.decision === "blocked" ? "blocked" : "failed",
        blockingCode: gate.blockingCode,
        complianceRunId: complianceRunId ?? undefined,
        labelRecordId: labelRecordId ?? undefined,
        metadataHash: metadataHash || undefined,
      };
      return ok(response);
    }

    // --- allowed：打包产物 ---
    if (!output) throw new Error("GATE_ALLOWED_BUT_NO_OUTPUT");

    let artifactBytes: Uint8Array;
    let artifactContentType: string;
    let artifactExtension: string;
    if (output.sidecarBytes) {
      const zip = new JSZip();
      zip.file(output.fileName, output.bytes);
      zip.file(`${output.fileName}.ai-manifest.json`, output.sidecarBytes);
      if (result.disclosure?.payload) {
        zip.file("disclosure.txt", `${result.disclosure.payload.headline}\n\n${result.disclosure.payload.body}\n`);
      }
      artifactBytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
      artifactContentType = "application/zip";
      artifactExtension = "zip";
    } else {
      artifactBytes = output.bytes;
      artifactContentType = contentType;
      artifactExtension = extension;
    }

    // --- 上传 Storage + 签名 URL ---
    const uploaded = await uploadExportArtifact({
      userId: user.id,
      exportId,
      bytes: artifactBytes,
      contentType: artifactContentType,
      extension: artifactExtension,
    });

    // --- 更新 ready ---
    await serviceFetch(`/rest/v1/storyflow_exports?id=eq.${encodeURIComponent(exportId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "ready",
        storage_path: uploaded.storagePath,
        file_url: uploaded.signedUrl,
        download_url_signed: uploaded.signedUrl,
        download_url_expires_at: uploaded.expiresAt,
        compliance_run_id: complianceRunId,
        label_record_id: labelRecordId,
        metadata_hash: metadataHash || null,
        verification_status: "verified",
        blocking_reason_code: null,
        updated_at: new Date().toISOString(),
      }),
    });

    if (input.episodeId?.trim()) {
      await recordEvidenceEvent(exportEvidenceEvent({
        ownerId: user.id,
        projectId: input.projectId,
        sourceUnitId: input.episodeId,
        exportId,
        exportType,
        contentId,
        metadataHash: metadataHash || null,
      }));
    }

    const response: ExportRequestResponse = {
      exportId,
      contentId,
      status: "ready",
      downloadUrl: uploaded.signedUrl,
      downloadUrlExpiresAt: uploaded.expiresAt,
      complianceRunId: complianceRunId ?? undefined,
      labelRecordId: labelRecordId ?? undefined,
      metadataHash: metadataHash || undefined,
    };
    return ok(response);
  } catch (error) {
    return apiError(error, "导出请求失败。");
  }
}
export {};
