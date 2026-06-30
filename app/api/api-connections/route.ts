import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import {
  disableApiConnectionForUser,
  listApiConnectionsForUser,
  upsertApiConnectionForUser,
} from "@/lib/supabase/api-connections";
import { authenticateRequest } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const connections = await listApiConnectionsForUser(user.id);
    return ok({ connections });
  } catch (error) {
    return apiError(error, "读取 API 连接失败。");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const connection = await upsertApiConnectionForUser(user.id, body);
    return ok({ connection });
  } catch (error) {
    return apiError(error, "保存 API 连接失败。");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!id) throw new Error("API_CONNECTION_NOT_FOUND");
    const connection = await disableApiConnectionForUser(user.id, id);
    return ok({ connection });
  } catch (error) {
    return apiError(error, "停用 API 连接失败。");
  }
}
