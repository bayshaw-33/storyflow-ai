import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import {
  archiveActorForUser,
  createActorForUser,
  listActorLibraryForUser,
  updateActorForUser,
} from "@/lib/supabase/actors";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const library = await listActorLibraryForUser(user.id);
    return ok(library);
  } catch (error) {
    return apiError(error, "读取演员库失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const actor = await createActorForUser(user.id, body);
    return ok({ actor });
  } catch (error) {
    return apiError(error, "创建演员失败。");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const actorId = String(body.id || "").trim();
    if (!actorId) throw new Error("ACTOR_NOT_FOUND");
    const actor = await updateActorForUser(user.id, actorId, body);
    return ok({ actor });
  } catch (error) {
    return apiError(error, "更新演员失败。");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const actorId = request.nextUrl.searchParams.get("id") || "";
    if (!actorId) throw new Error("ACTOR_NOT_FOUND");
    const actor = await archiveActorForUser(user.id, actorId);
    return ok({ actor });
  } catch (error) {
    return apiError(error, "删除演员失败。");
  }
}
