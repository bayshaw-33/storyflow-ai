import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { refreshPromptCache } from "@/lib/admin/ai-prompts-server";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const key = (await ctx.params).key;
    const body = await request.json().catch(() => ({}));
    const versionId: string = body.versionId;
    if (!versionId) return Response.json({ error: "MISSING_VERSION_ID" }, { status: 400 });

    const versions = await serviceFetch<Array<{ id: string; body: string }>>(
      `/rest/v1/storyflow_ai_prompt_versions?id=eq.${encodeURIComponent(versionId)}&select=id,body&limit=1`
    );
    const version = versions[0];
    if (!version) return Response.json({ error: "VERSION_NOT_FOUND" }, { status: 404 });

    const before = await serviceFetch<Array<{ body: string }>>(
      `/rest/v1/storyflow_ai_prompts?key=eq.${encodeURIComponent(key)}&select=body&limit=1`
    );
    const beforeBody = before[0]?.body;

    await Promise.all([
      serviceFetch(`/rest/v1/storyflow_ai_prompts?key=eq.${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ body: version.body, updated_at: new Date().toISOString(), updated_by: admin.id }),
      }),
      serviceFetch("/rest/v1/storyflow_ai_prompt_versions", {
        method: "POST",
        body: JSON.stringify({ prompt_key: key, body: version.body, updated_by: admin.id }),
      }),
    ]);

    refreshPromptCache();

    await writeAuditLog({
      adminUserId: admin.id,
      action: "ai_prompt.rollback",
      targetRef: `prompt:${key}`,
      payload: { before: beforeBody, after: version.body, rolledBackToVersion: versionId },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
