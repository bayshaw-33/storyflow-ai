import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { writeAuditLog } from "@/lib/admin/audit";
import { refreshPromptCache } from "@/lib/admin/ai-prompts-server";
import { serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    await requireAdminRole(request, "viewer");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const key = (await ctx.params).key;
    const [rows, versions] = await Promise.all([
      serviceFetch<Array<{ key: string; category: string; label: string; body: string; updated_at: string; updated_by: string | null }>>(
        `/rest/v1/storyflow_ai_prompts?key=eq.${encodeURIComponent(key)}&select=*&limit=1`
      ),
      serviceFetch<Array<{ id: string; body: string; updated_by: string | null; created_at: string }>>(
        `/rest/v1/storyflow_ai_prompt_versions?prompt_key=eq.${encodeURIComponent(key)}&select=id,body,updated_by,created_at&order=created_at.desc&limit=20`
      ),
    ]);
    const prompt = rows[0];
    if (!prompt) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    return Response.json({ prompt, versions });
  } catch (err) {
    return adminErrorResponse(err);
  }
}

export async function PATCH(request: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const admin = await requireAdminRole(request, "operator");
    if (!hasServiceRoleConfig()) {
      return Response.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
    }
    const key = (await ctx.params).key;
    const body = await request.json().catch(() => ({}));
    if (typeof body.body !== "string" || !body.body.trim()) {
      return Response.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    // 读旧值
    const before = await serviceFetch<Array<{ body: string }>>(
      `/rest/v1/storyflow_ai_prompts?key=eq.${encodeURIComponent(key)}&select=body&limit=1`
    );
    const beforeBody = before[0]?.body;

    // 更新 + 写版本
    await Promise.all([
      serviceFetch(`/rest/v1/storyflow_ai_prompts?key=eq.${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ body: body.body, updated_at: new Date().toISOString(), updated_by: admin.id }),
      }),
      serviceFetch("/rest/v1/storyflow_ai_prompt_versions", {
        method: "POST",
        body: JSON.stringify({ prompt_key: key, body: body.body, updated_by: admin.id }),
      }),
    ]);

    refreshPromptCache();

    await writeAuditLog({
      adminUserId: admin.id,
      action: "ai_prompt.update",
      targetRef: `prompt:${key}`,
      payload: { before: beforeBody, after: body.body },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
