import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/actors/portrayals/counts?ids=a,b,c
// PRD §7.1 列表页参演数：批量查询避免 N+1（原 24 个 actor 触发 24 次并行 GET）
// 返回 { counts: { [actorId]: number }, requestId }
//
// 仅统计当前用户可读的 portrayal（owner_id 匹配或 team 共享）。
// 服务端单次聚合查询替代客户端 N 次单读。
type CountRow = {
  actor_profile_id: string;
};

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const idsParam = new URL(request.url).searchParams.get("ids") || "";
    const actorIds = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100); // 上限 100，防止滥用
    if (!actorIds.length) return ok({ counts: {}, requestId });

    // 拉 team memberships
    const memberships = await serviceFetch<Array<{ team_id: string }>>(
      `/rest/v1/storyflow_team_members?user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&select=team_id`,
    ).catch(() => [] as Array<{ team_id: string }>);
    const teamIds = memberships.map((row) => row.team_id).filter(Boolean);

    // 单次聚合查询：用 or=(owner_id=eq.X,team_id=in.(...)) + actor_profile_id=in.(...) 一次拉所有可读 portrayals
    const ownerFilter = `owner_id=eq.${encodeURIComponent(user.id)}`;
    const accessFilter = teamIds.length
      ? `or=(${ownerFilter},team_id=in.(${teamIds.map(encodeURIComponent).join(",")}))`
      : ownerFilter;
    const actorFilter = `actor_profile_id=in.(${actorIds.map(encodeURIComponent).join(",")})`;

    const rows = await serviceFetch<CountRow[]>(
      `/rest/v1/storyflow_character_portrayals?${accessFilter}&${actorFilter}&select=actor_profile_id&limit=1000`,
    );

    const counts: Record<string, number> = {};
    for (const id of actorIds) counts[id] = 0;
    for (const row of rows) {
      if (row.actor_profile_id) {
        counts[row.actor_profile_id] = (counts[row.actor_profile_id] || 0) + 1;
      }
    }

    return ok({ counts, requestId });
  } catch (error) {
    const errRes = apiError(error, "读取参演数失败。");
    const body = await errRes.json().catch(() => ({ success: false, error: "读取参演数失败。" }));
    return NextResponse.json({ ...body, requestId }, { status: errRes.status });
  }
}
