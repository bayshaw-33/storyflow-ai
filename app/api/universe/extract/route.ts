import { NextResponse } from "next/server";
import type { DramaProject } from "@/lib/projects";
import type { CreativePackage } from "@/lib/universe/creative-package";
import { extractUniverseInboxItems } from "@/lib/ai/universe";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { assertUniverseWriteAccess } from "@/lib/supabase/universe-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { universeId?: string; project?: DramaProject; creativePackage?: CreativePackage };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.universeId || (!body.project?.id && !body.creativePackage?.id)) {
    return NextResponse.json({ success: false, error: "universeId and project or creativePackage are required." }, { status: 400 });
  }

  let user;
  try {
    user = await authenticateRequest(request);
  } catch {
    return NextResponse.json({ success: false, error: "Please sign in before extracting Universe updates." }, { status: 401 });
  }

  if (!hasServiceRoleConfig()) {
    return NextResponse.json({ success: false, error: "Universe service is unavailable." }, { status: 503 });
  }
  try {
    await assertUniverseWriteAccess(user.id, body.universeId);
  } catch (accessError) {
    const forbidden = accessError instanceof Error && accessError.message.includes("UNIVERSE_FORBIDDEN");
    return NextResponse.json(
      { success: false, error: forbidden ? "You cannot edit this Universe." : "Universe access check failed." },
      { status: forbidden ? 403 : 502 },
    );
  }

  const extraction = await extractUniverseInboxItems({
    universeId: body.universeId,
    project: body.project,
    creativePackage: body.creativePackage,
    userId: user.id,
  });

  if (extraction.items.length) {
    try {
      await serviceFetch("/rest/v1/storyflow_universe_inbox_items?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(extraction.items),
      });
    } catch {
      return NextResponse.json({ success: false, error: "Extracted items could not be saved." }, { status: 502 });
    }
  }

  return NextResponse.json({
    success: true,
    items: extraction.items,
    degraded: extraction.degraded,
    source: extraction.source,
    error: extraction.error,
  });
}
