import { NextResponse } from "next/server";
import type { DramaProject } from "@/lib/projects";
import { extractUniverseInboxItems } from "@/lib/ai/universe";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: { universeId?: string; project?: DramaProject };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.universeId || !body.project?.id) {
    return NextResponse.json({ success: false, error: "universeId and project are required." }, { status: 400 });
  }

  let user;
  try {
    user = await authenticateRequest(request);
  } catch {
    return NextResponse.json({ success: false, error: "Please sign in before extracting Universe updates." }, { status: 401 });
  }

  const items = await extractUniverseInboxItems({
    universeId: body.universeId,
    project: body.project,
    userId: user.id,
  });

  if (hasServiceRoleConfig() && items.length) {
    await serviceFetch("/rest/v1/storyflow_universe_inbox_items?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(items),
    }).catch(() => null);
  }

  return NextResponse.json({ success: true, items });
}
