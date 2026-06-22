import { NextResponse } from "next/server";
import {
  authenticateRequest,
  hasServiceRoleConfig,
  serviceFetch,
} from "@/lib/supabase/server";

// Server-only admin endpoint. SECURITY MODEL:
//   1. The caller's Supabase access token is verified (authenticateRequest).
//   2. The verified email MUST equal ADMIN_EMAIL (server-only env, never
//      shipped to the client). Anything else gets 403.
//   3. Only after both checks do we use the service_role key to read the full
//      user list + profiles + credits. The service_role key never leaves the
//      server. The front-end email check elsewhere only toggles a nav entry's
//      visibility — it is NOT a security boundary; this route is.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminUserRow = {
  userId: string;
  email: string;
  createdAt: string | null;
  displayName: string | null;
  plan: string | null;
  balance: number | null;
  monthlyLimit: number | null;
};

type AuthUser = { id: string; email?: string | null; created_at?: string | null };
type ProfileRow = { user_id: string; display_name?: string | null; plan?: string | null };
type CreditRow = { user_id: string; balance?: number | null; monthly_limit?: number | null };

function adminEmail() {
  return (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
}

export async function GET(request: Request) {
  // (1) verify the caller's token
  let requester;
  try {
    requester = await authenticateRequest(request);
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // (2) hard admin gate — the only real authorization check
  const allowed = adminEmail();
  if (!allowed || requester.email.trim().toLowerCase() !== allowed) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (!hasServiceRoleConfig()) {
    return NextResponse.json({ error: "MISSING_SERVICE_ROLE_CONFIG" }, { status: 500 });
  }

  // (3) service_role reads — auth.users via the Admin API, profiles/credits via REST
  try {
    const [authResponse, profiles, credits] = await Promise.all([
      serviceFetch<{ users?: AuthUser[] } | AuthUser[]>("/auth/v1/admin/users?page=1&per_page=200"),
      serviceFetch<ProfileRow[]>("/rest/v1/storyflow_profiles?select=user_id,display_name,plan"),
      serviceFetch<CreditRow[]>("/rest/v1/storyflow_credits?select=user_id,balance,monthly_limit"),
    ]);

    const users = Array.isArray(authResponse) ? authResponse : authResponse.users || [];
    const profileById = new Map(profiles.map((p) => [p.user_id, p]));
    const creditById = new Map(credits.map((c) => [c.user_id, c]));

    const rows: AdminUserRow[] = users.map((user) => {
      const profile = profileById.get(user.id);
      const credit = creditById.get(user.id);
      return {
        userId: user.id,
        email: user.email || "",
        createdAt: user.created_at ?? null,
        displayName: profile?.display_name ?? null,
        plan: profile?.plan ?? null,
        balance: credit?.balance ?? null,
        monthlyLimit: credit?.monthly_limit ?? null,
      };
    });

    rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return NextResponse.json({ users: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ADMIN_FETCH_FAILED";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
