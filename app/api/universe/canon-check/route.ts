import { NextResponse } from "next/server";
import type { DramaProject } from "@/lib/projects";
import type { UniverseBundle, CanonCheckReport } from "@/lib/universe";
import { runCanonCheck } from "@/lib/ai/universe";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: { bundle?: UniverseBundle; project?: DramaProject };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.bundle?.universe?.id || !body.project?.id) {
    return NextResponse.json({ success: false, error: "bundle and project are required." }, { status: 400 });
  }

  let user;
  try {
    user = await authenticateRequest(request);
  } catch {
    return NextResponse.json({ success: false, error: "Please sign in before running Canon Check." }, { status: 401 });
  }

  let checked;
  try {
    checked = await runCanonCheck({
      bundle: body.bundle,
      project: body.project,
      userId: user.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 503 }
    );
  }

  const report: CanonCheckReport = {
    ...checked,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };

  if (hasServiceRoleConfig()) {
    await serviceFetch("/rest/v1/storyflow_canon_check_reports", {
      method: "POST",
      body: JSON.stringify(report),
    }).catch(() => null);
  }

  return NextResponse.json({ success: true, report });
}
