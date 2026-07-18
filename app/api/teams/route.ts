import type { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { assertTeamRole, createTeamForUser, listTeamsForUser } from "@/lib/supabase/actors";
import type { TeamMember, TeamRole } from "@/lib/actors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEAM_ADMIN_ROLES: Set<TeamRole> = new Set(["owner", "admin"]);
// 角色白名单：邀请/改角色只允许这四种；也是“团队成员”的完整集合
const TEAM_ALL_ROLES: Set<TeamRole> = new Set(["owner", "admin", "editor", "viewer"]);
const INVALID_ROLE_MESSAGE = "role 必须是 owner|admin|editor|viewer。";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const teamId = new URL(request.url).searchParams.get("teamId");

    if (teamId) {
      // 成员列表仅该团队成员（任一 active 角色）可见，否则 403
      await assertTeamRole(user.id, teamId, TEAM_ALL_ROLES);
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
      if (!TEAM_ALL_ROLES.has(role as TeamRole)) {
        return apiError(new Error("INVALID_TEAM_ROLE"), INVALID_ROLE_MESSAGE, 422);
      }
      // 仅 owner/admin 可邀请成员，否则 403
      await assertTeamRole(user.id, teamId, TEAM_ADMIN_ROLES);

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

    const target = await getTeamMember(memberId);
    if (!target) return apiError(new Error("MEMBER_NOT_FOUND"), "未找到该成员。", 404);
    // 仅该团队 owner/admin 可改成员，否则 403
    await assertTeamRole(user.id, target.team_id, TEAM_ADMIN_ROLES);

    if (body.role && !TEAM_ALL_ROLES.has(String(body.role) as TeamRole)) {
      return apiError(new Error("INVALID_TEAM_ROLE"), INVALID_ROLE_MESSAGE, 422);
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.role) patch.role = String(body.role);
    if (body.status) patch.status = String(body.status);

    // 禁止把最后一名 active owner 降级或移出 active 状态
    const touchesOwner =
      (typeof patch.role === "string" && patch.role !== "owner") ||
      (typeof patch.status === "string" && patch.status !== "active");
    if (touchesOwner && (await isLastActiveOwner(target))) return lastOwnerError();

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
    const memberId = new URL(request.url).searchParams.get("memberId") || "";
    if (!memberId) return apiError(new Error("MISSING_MEMBER_ID"), "缺少成员 ID。");

    const target = await getTeamMember(memberId);
    if (!target) return apiError(new Error("MEMBER_NOT_FOUND"), "未找到该成员。", 404);
    // 仅该团队 owner/admin 可移除成员，否则 403
    await assertTeamRole(user.id, target.team_id, TEAM_ADMIN_ROLES);

    // 禁止移除最后一名 active owner
    if (await isLastActiveOwner(target)) return lastOwnerError();

    await serviceFetch(
      `/rest/v1/storyflow_team_members?id=eq.${encodeURIComponent(memberId)}`,
      { method: "PATCH", body: JSON.stringify({ status: "removed", updated_at: new Date().toISOString() }) },
    );
    return ok({ removed: true });
  } catch (error) {
    return apiError(error, "移除成员失败。");
  }
}

async function getTeamMember(memberId: string) {
  const rows = await serviceFetch<TeamMember[]>(
    `/rest/v1/storyflow_team_members?id=eq.${encodeURIComponent(memberId)}&select=*&limit=1`,
  );
  return rows[0] || null;
}

async function isLastActiveOwner(member: TeamMember) {
  if (member.role !== "owner" || member.status !== "active") return false;
  const owners = await serviceFetch<Array<{ id: string }>>(
    `/rest/v1/storyflow_team_members?team_id=eq.${encodeURIComponent(member.team_id)}&role=eq.owner&status=eq.active&select=id`,
  );
  return owners.filter((owner) => owner.id !== member.id).length === 0;
}

function lastOwnerError() {
  return apiError(new Error("LAST_OWNER_REQUIRED"), "团队至少需要保留一名 owner，请先指定新的 owner 再操作。", 409);
}
