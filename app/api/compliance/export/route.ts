import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";

import { apiError } from "@/lib/api/responses";
import { contentKindForFormat, resolveFormatKey, runComplianceMarking } from "@/lib/compliance/adapter";
import type { AdapterRequest } from "@/lib/compliance/adapter";
import { createSupabaseSink } from "@/lib/compliance/log-writer";
import { serverContentId } from "@/lib/compliance/manifest";
import type { JurisdictionProfile } from "@/lib/compliance/types";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB

function safeAsciiFileName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, "_");
  return cleaned || "export.bin";
}

function gateErrorResponse(decision: "blocked" | "failed", gate: { blockingCode?: string; steps: unknown; runRecordId?: string }) {
  const message = decision === "blocked" ? "导出被合规策略阻止。" : "合规标识写入或验证失败，已中止下载。";
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: gate.blockingCode ?? null,
      steps: gate.steps,
      runId: gate.runRecordId ?? null,
    },
    { status: decision === "blocked" ? 422 : 500 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return apiError(new Error("SUPABASE_SERVICE_ERROR:not_configured"), "合规导出服务未配置。", 503);
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ success: false, error: "请求必须是 multipart/form-data。" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "缺少上传文件字段 file。" }, { status: 400 });
    }
    const inputBytes = new Uint8Array(await file.arrayBuffer());
    if (inputBytes.byteLength === 0) {
      return NextResponse.json({ success: false, error: "上传文件为空。" }, { status: 400 });
    }
    if (inputBytes.byteLength > MAX_FILE_BYTES) {
      return NextResponse.json({ success: false, error: "文件超过 50MB 上限。" }, { status: 413 });
    }

    const fileName = file.name || "export.bin";
    const formatKey = resolveFormatKey(fileName);
    const contentKind = formatKey ? contentKindForFormat(formatKey) : "document";
    const contentId = serverContentId(inputBytes);

    const adapterRequest: AdapterRequest = {
      assetId: contentId,
      assetVersionId: contentId,
      contentKind,
      inputPath: fileName,
      outputPath: fileName,
      jurisdictionProfile: "" as JurisdictionProfile,
      aiGenerated: undefined as unknown as boolean,
      aiModified: undefined as unknown as boolean,
      providerCode: "KIIKIS",
      contentId,
      visibleDisclosureMode: "none",
      inputBytes,
      extra: {},
    };

    const result = await runComplianceMarking(adapterRequest, {
      sink: createSupabaseSink(serviceFetch),
      env: process.env,
      ownerId: user.id,
    });
    const { gate } = result;

    if (gate.decision === "blocked") return gateErrorResponse("blocked", gate);
    if (gate.decision === "failed") return gateErrorResponse("failed", gate);

    const output = result.output;
    if (!output) return gateErrorResponse("failed", gate);

    const headers = new Headers();
    headers.set("X-Compliance-Run-Id", gate.runRecordId ?? "");
    headers.set("X-Compliance-Label-Id", gate.labelRecordId ?? "");
    headers.set("X-Compliance-Metadata-Hash", result.marking?.metadataHash ?? "");
    if (result.disclosure?.payload) {
      headers.set(
        "X-Compliance-Disclosure-B64",
        Buffer.from(JSON.stringify(result.disclosure.payload), "utf8").toString("base64url"),
      );
    }

    let body: Uint8Array;
    let downloadName: string;
    if (output.sidecarBytes) {
      // Sidecar formats ship a ZIP: original file + .ai-manifest.json + disclosure.txt
      const zip = new JSZip();
      zip.file(output.fileName, output.bytes);
      zip.file(`${output.fileName}.ai-manifest.json`, output.sidecarBytes);
      if (result.disclosure?.payload) {
        zip.file("disclosure.txt", `${result.disclosure.payload.headline}\n\n${result.disclosure.payload.body}\n`);
      }
      body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
      downloadName = `${output.fileName}.zip`;
      headers.set("Content-Type", "application/zip");
    } else {
      body = output.bytes;
      downloadName = output.fileName;
      headers.set("Content-Type", file.type || "application/octet-stream");
    }
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeAsciiFileName(downloadName)}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    );

    return new NextResponse(Buffer.from(body), { status: 200, headers });
  } catch (error) {
    return apiError(error, "合规导出失败。");
  }
}
