import { NextRequest, NextResponse } from "next/server";

import { createServerEvidencePackageStore, signEvidencePackage } from "@/lib/evidence/package";
import { isEvidenceLedgerEnabled } from "@/lib/evidence/feature-flags";
import { authenticateRequest, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ packageId: string }> },
) {
  try {
    if (!hasServiceRoleConfig() || !isEvidenceLedgerEnabled()) return NextResponse.json({ success: false, error: "证据服务未启用。" }, { status: 503 });
    const user = await authenticateRequest(request);
    const { packageId } = await context.params;
    if (!packageId) return NextResponse.json({ success: false, error: "证据包不存在。" }, { status: 404 });
    const signed = await signEvidencePackage({ packageId, requesterId: user.id, store: createServerEvidencePackageStore() });
    return NextResponse.json({ success: true, downloadUrl: signed.url, expiresIn: signed.expiresIn });
  } catch {
    return NextResponse.json({ success: false, error: "证据包不存在。" }, { status: 404 });
  }
}
