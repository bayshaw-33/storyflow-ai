import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
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
      key: string; category: string; label: string; body: string; updated_at: string;
    }>>("/rest/v1/storyflow_ai_prompts?select=key,category,label,body,updated_at&order=key.asc");
    return Response.json({ prompts: rows });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
