import { NextResponse } from "next/server";
import { assertArtStoragePathBelongsToUser, signStoredArtImage } from "@/lib/supabase/art-storage";
import { authenticateRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json() as { paths?: unknown };
    const paths = Array.isArray(body.paths)
      ? Array.from(new Set(body.paths.filter((path): path is string => typeof path === "string" && Boolean(path.trim()))))
      : [];
    const urls = Object.fromEntries(await Promise.all(paths.slice(0, 100).map(async (path) => {
      assertArtStoragePathBelongsToUser(user.id, path);
      return [path, await signStoredArtImage(path, 60 * 60 * 24 * 7)];
    })));
    return NextResponse.json({ success: true, urls, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const authError = message === "MISSING_AUTH_TOKEN" || message === "INVALID_AUTH_TOKEN";
    const forbidden = message === "ART_STORAGE_PATH_FORBIDDEN";
    return NextResponse.json(
      { success: false, urls: {}, error: authError ? "请先登录。" : forbidden ? "无权读取该图片。" : "图片预览恢复失败，请刷新重试。" },
      { status: authError ? 401 : forbidden ? 403 : 502 },
    );
  }
}
