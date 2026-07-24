import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { refreshPromptCache } from "@/lib/admin/ai-prompts-server";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const rows = await serviceFetch<Array<{
      id: string; scope: string; target: string; injection_text: string;
      position: string; enabled: boolean; updated_at: string;
    }>>("/rest/v1/storyflow_ai_prompt_overrides?select=*&order=updated_at.asc");
    return Response.json({ overrides: rows });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const body = await request.json().catch(() => ({}));
    if (!["global", "task_type"].includes(body.scope)) return Response.json({ error: "INVALID_SCOPE" }, { status: 400 });
    if (!["prepend", "append"].includes(body.position)) return Response.json({ error: "INVALID_POSITION" }, { status: 400 });
    if (typeof body.injectionText !== "string" || !body.injectionText.trim()) return Response.json({ error: "INVALID_INJECTION" }, { status: 400 });

    const row = {
      scope: body.scope,
      target: body.target || "*",
      injection_text: body.injectionText,
      position: body.position,
      enabled: body.enabled !== false,
      updated_by: admin.id,
    };
    const created = await serviceFetch<Array<{ id: string }>>("/rest/v1/storyflow_ai_prompt_overrides", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
    refreshPromptCache();
    await writeAuditLog({
      adminUserId: admin.id,
      action: "ai_prompt.override.create",
      targetRef: `override:${created[0]?.id}`,
      payload: row,
    });
    return Response.json({ ok: true, override: created[0] });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
