import { NextResponse } from "next/server";
import { artCloudErrorStatus, downloadArtCloudImage } from "@/lib/art/cloud-store";
import { authenticateRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json() as { storagePath?: unknown; name?: unknown };
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("ART_REQUEST_INVALID");
    const source = await downloadArtCloudImage(user.id, body.storagePath);
    const name = (typeof body.name === "string" ? body.name : "art-image").replace(/[\u0000-\u001f\u007f"\\/]/g, "_").slice(0, 180) || "art-image";
    return new Response(await source.arrayBuffer(), {
      headers: {
        "Content-Type": source.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename="art-image"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: "原图下载失败。" }, { status: artCloudErrorStatus(error) });
  }
}
