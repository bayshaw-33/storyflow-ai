import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { refreshPromptCache } from "@/lib/admin/ai-prompts-server";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const id = (await ctx.params).id;
    const body = await request.json().catch(() => ({}));
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: admin.id };
    if (typeof body.injectionText === "string") patch.injection_text = body.injectionText;
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.position) patch.position = body.position;
    if (body.target) patch.target = body.target;

    await serviceFetch(`/rest/v1/storyflow_ai_prompt_overrides?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    refreshPromptCache();
    await writeAuditLog({
      adminUserId: admin.id,
      action: "ai_prompt.override.update",
      targetRef: `override:${id}`,
      payload: patch,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const id = (await ctx.params).id;
    await serviceFetch(`/rest/v1/storyflow_ai_prompt_overrides?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    refreshPromptCache();
    await writeAuditLog({
      adminUserId: admin.id,
      action: "ai_prompt.override.delete",
      targetRef: `override:${id}`,
      payload: {},
    });
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
