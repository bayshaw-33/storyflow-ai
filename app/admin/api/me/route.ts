import { requireAdminRole, adminErrorResponse } from "@/lib/admin/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await requireAdminRole(request, "viewer");
    return Response.json({
      userId: ctx.id,
      email: ctx.email,
      role: ctx.role,
    });
  } catch (err) {
    return adminErrorResponse(err);
  }
}
