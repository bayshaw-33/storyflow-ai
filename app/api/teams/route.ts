import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { createTeamForUser, listTeamsForUser } from "@/lib/supabase/actors";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const teamId = request.nextUrl.searchParams.get("teamId");

    if (teamId) {
      // List members of a specific team
      const members = await serviceFetch<Array<Record<string, unknown>>>(
        `/rest/v1/storyflow_team_members?team_id=eq.${encodeURIComponent(teamId)}&status=neq.removed&select=*&order=created_at.asc`,
      );
      return ok({ members });
    }

    const teams = await listTeamsForUser(user.id);
    return ok({ teams });
  } catch (error) {
    return apiError(error, "读取团队失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));

    if (body.action === "invite") {
      // Invite a member by email
      const email = String(body.email || "").trim().toLowerCase();
      const teamId = String(body.teamId || "");
      const role = String(body.role || "viewer");
      if (!email || !teamId) return apiError(new Error("MISSING_PARAMS"), "缺少邮箱或团队 ID。");

      // Look up user ID by email via RPC function
      const userIdRows = await serviceFetch<Array<{ id: string }>>(
        `/rest/v1/rpc/get_user_id_by_email?user_email=${encodeURIComponent(email)}`,
      );
      const targetUserId = userIdRows?.[0]?.id;
      if (!targetUserId) return apiError(new Error("USER_NOT_FOUND"), "未找到该邮箱对应的用户。");

      // Check if already a member
      const existing = await serviceFetch<Array<{ id: string; status: string }>>(
        `/rest/v1/storyflow_team_members?team_id=eq.${encodeURIComponent(teamId)}&user_id=eq.${encodeURIComponent(targetUserId)}&select=id,status&limit=1`,
      );
      if (existing[0]?.status === "active") {
        return apiError(new Error("ALREADY_MEMBER"), "该用户已是团队成员。");
      }

      if (existing[0]) {
        // Reactivate removed member
        await serviceFetch(
          `/rest/v1/storyflow_team_members?id=eq.${encodeURIComponent(existing[0].id)}`,
          { method: "PATCH", body: JSON.stringify({ status: "active", role, updated_at: new Date().toISOString() }) },
        );
      } else {
        // Insert new member
        await serviceFetch("/rest/v1/storyflow_team_members", {
          method: "POST",
          body: JSON.stringify({
            id: crypto.randomUUID(),
            team_id: teamId,
            user_id: targetUserId,
            role,
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        });
      }
      return ok({ invited: true, email, role });
    }

    // Default: create team
    const team = await createTeamForUser(user.id, String(body.name || ""));
    return ok({ team });
  } catch (error) {
    return apiError(error, "操作失败。");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const memberId = String(body.memberId || "");
    if (!memberId) return apiError(new Error("MISSING_MEMBER_ID"), "缺少成员 ID。");

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.role) patch.role = String(body.role);
    if (body.status) patch.status = String(body.status);

    await serviceFetch(
      `/rest/v1/storyflow_team_members?id=eq.${encodeURIComponent(memberId)}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    return ok({ updated: true });
  } catch (error) {
    return apiError(error, "更新成员失败。");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const memberId = request.nextUrl.searchParams.get("memberId") || "";
    if (!memberId) return apiError(new Error("MISSING_MEMBER_ID"), "缺少成员 ID。");

    await serviceFetch(
      `/rest/v1/storyflow_team_members?id=eq.${encodeURIComponent(memberId)}`,
      { method: "PATCH", body: JSON.stringify({ status: "removed", updated_at: new Date().toISOString() }) },
    );
    return ok({ removed: true });
  } catch (error) {
    return apiError(error, "移除成员失败。");
  }
}
