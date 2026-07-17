import { NextRequest, NextResponse } from "next/server";

import { listEvidenceEvents, recordEvidenceEvent } from "@/lib/evidence/ledger";
import { createServerEvidencePackageStore, materializeEvidencePackage } from "@/lib/evidence/package";
import { isEvidenceLedgerEnabled } from "@/lib/evidence/feature-flags";
import { authenticateRequest, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validScope(value: unknown): value is { projectId: string; sourceUnitId: string } {
  return Boolean(
    value && typeof value === "object" &&
    typeof (value as { projectId?: unknown }).projectId === "string" && (value as { projectId: string }).projectId.trim() &&
    typeof (value as { sourceUnitId?: unknown }).sourceUnitId === "string" && (value as { sourceUnitId: string }).sourceUnitId.trim(),
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!hasServiceRoleConfig() || !isEvidenceLedgerEnabled()) return NextResponse.json({ success: false, error: "证据服务未启用。" }, { status: 503 });
    const body = await request.json().catch(() => null);
    if (!validScope(body)) return NextResponse.json({ success: false, error: "缺少 projectId 或 sourceUnitId。" }, { status: 400 });
    const user = await authenticateRequest(request);
    const scope = { ownerId: user.id, projectId: body.projectId, sourceUnitId: body.sourceUnitId };
    const events = await listEvidenceEvents(scope);
    const evidencePackage = await materializeEvidencePackage({ ...scope, events }, createServerEvidencePackageStore());
    await recordEvidenceEvent({
      ...scope,
      eventType: "package_generated",
      subjectType: "evidence_package",
      subjectId: evidencePackage.id,
      subjectVersionId: evidencePackage.package_sha256,
      payload: { highestSequenceNumber: evidencePackage.highest_sequence_number, manifestSha256: evidencePackage.manifest_sha256 },
      objectSha256: evidencePackage.package_sha256,
      idempotencyKey: `package:${evidencePackage.package_sha256}`,
    });
    return NextResponse.json({ success: true, packageId: evidencePackage.id, status: evidencePackage.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "EVIDENCE_PACKAGE_ERROR";
    const status = message.startsWith("EVIDENCE_") ? 422 : 500;
    return NextResponse.json({ success: false, error: "证据包生成失败。", code: message }, { status });
  }
}
