import { authenticateRequest, serviceFetch, hasServiceRoleConfig } from "@/lib/supabase/server";

export type AdminRole = "super_admin" | "operator" | "viewer";

export const ROLE_RANK: Record<AdminRole, number> = {
  viewer: 1,
  operator: 2,
  super_admin: 3,
};

export type AdminContext = {
  id: string;
  email: string;
  token: string;
  role: AdminRole;
};

/**
 * 校验请求者登录态 + admin 角色。角色不足抛错（由 route 转 403）。
 * 调用前需 hasServiceRoleConfig() 为 true。
 */
export async function requireAdminRole(
  request: Request,
  minRole: AdminRole
): Promise<AdminContext> {
  const user = await authenticateRequest(request);

  if (!hasServiceRoleConfig()) {
    throw new AdminAuthError("MISSING_SERVICE_ROLE_CONFIG", 500);
  }

  const rows = await serviceFetch<Array<{ role: AdminRole }>>(
    `/rest/v1/storyflow_admin_roles?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`
  );

  const role = rows[0]?.role;
  if (!role) {
    throw new AdminAuthError("NO_ADMIN_ROLE", 403);
  }
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new AdminAuthError("INSUFFICIENT_ROLE", 403);
  }

  return { ...user, role };
}

export class AdminAuthError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/** 把 AdminAuthError 转成 NextResponse */
export function adminErrorResponse(err: unknown) {
  if (err instanceof AdminAuthError) {
    const status = err.status;
    if (status === 401) return Response.json({ error: "UNAUTHENTICATED" }, { status });
    return Response.json({ error: err.code }, { status });
  }
  if (err instanceof Error && err.message === "INVALID_AUTH_TOKEN") {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (err instanceof Error && err.message === "MISSING_AUTH_TOKEN") {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
