import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";
import { refreshPromptCache } from "@/lib/admin/ai-prompts-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireAdminRole(request, "operator");
    refreshPromptCache();
    return Response.json({ ok: true });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
