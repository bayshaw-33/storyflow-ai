import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest } from "@/lib/supabase/server";
import { deleteCharacter, listCharacters, upsertCharacter } from "@/lib/supabase/phase2";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const projectId = request.nextUrl.searchParams.get("projectId") || "";
    const characters = await listCharacters(user.id, projectId);
    return ok({ characters });
  } catch (error) {
    return apiError(error, "读取角色失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const characters = await upsertCharacter(user.id, body);
    return ok({ characters });
  } catch (error) {
    return apiError(error, "保存角色失败。");
  }
}

export async function PATCH(request: NextRequest) {
  return POST(request);
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const projectId = request.nextUrl.searchParams.get("projectId") || "";
    const id = request.nextUrl.searchParams.get("id") || "";
    const result = await deleteCharacter(user.id, projectId, id);
    return ok({ result });
  } catch (error) {
    return apiError(error, "删除角色失败。");
  }
}
