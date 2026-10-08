import { NextResponse } from "next/server";
import { ART_MODEL_CATALOG, isAtlasAuthorizedUser } from "@/lib/art/providers";
import { artCloudErrorStatus } from "@/lib/art/cloud-store";
import { authenticateRequest } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const referenceFilter = new URL(request.url).searchParams.get("hasReferences");
    const atlasConfigured = Boolean(process.env.ATLASCLOUD_API_KEY?.trim()) && isAtlasAuthorizedUser(user);
    const fluxConfigured = Boolean(process.env.BFL_API_KEY?.trim());
    const models = ART_MODEL_CATALOG.filter(model =>
      (model.provider === "atlas" ? atlasConfigured : fluxConfigured) &&
      (referenceFilter === null || model.capabilities.includes(referenceFilter === "true" ? "image-edit" : "text-to-image")),
    ).map(({ atlasProfile: _profile, ...model }) => model);
    return NextResponse.json({ success: true, models }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, models: [], error: "模型目录读取失败。" }, { status: artCloudErrorStatus(error) });
  }
}
