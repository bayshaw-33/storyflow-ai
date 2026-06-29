import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import { createTeamForUser, listTeamsForUser } from "@/lib/supabase/actors";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
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
    const team = await createTeamForUser(user.id, String(body.name || ""));
    return ok({ team });
  } catch (error) {
    return apiError(error, "创建团队失败。");
  }
}
