import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { loadProductionState, updateShotStatus } from "@/lib/production/api";
import { generateArtImages } from "@/lib/art/providers";
import { isAtlasAuthorizedUser } from "@/lib/art/providers/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GenerateShotImageRequest = {
  projectId?: string;
  shotId?: string;
  provider?: string;
  model?: string;
};

export async function POST(request: Request) {
  let body: GenerateShotImageRequest;
  try {
    body = (await request.json()) as GenerateShotImageRequest;
  } catch {
    return NextResponse.json({ success: false, error: "请求格式不正确。" }, { status: 400 });
  }

  const projectId = body.projectId?.trim();
  const shotId = body.shotId?.trim();
  if (!projectId || !shotId) {
    return NextResponse.json({ success: false, error: "缺少 projectId 或 shotId。" }, { status: 400 });
  }

  let userId: string;
  let atlasAuthorized: boolean;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
    atlasAuthorized = isAtlasAuthorizedUser(user);
  } catch {
    return NextResponse.json({ success: false, error: "请先登录。" }, { status: 401 });
  }

  try {
    const state = await loadProductionState(userId, projectId);
    if (!state) {
      return NextResponse.json({ success: false, error: "项目状态未找到。" }, { status: 404 });
    }

    const shot = state.shots.find((s) => s.id === shotId);
    if (!shot) {
      return NextResponse.json({ success: false, error: "分镜未找到。" }, { status: 404 });
    }

    // Update status to image_generating
    await updateShotStatus(userId, state.id, shotId, {
      status: "image_generating",
      error: null,
    });

    // Generate image using existing art providers
    const generated = await generateArtImages(
      {
        task: "concept",
        prompt: shot.imagePrompt,
        negativePrompt: state.visualBible.negativePrompt || "",
        referenceUrls: [],
        aspectRatio:
          state.aspectRatio === "9:16" ? "9:16" : state.aspectRatio === "1:1" ? "1:1" : "16:9",
        count: 1,
        selection: "smart",
      },
      { atlasAuthorized },
    );

    const imageUrl = generated[0]?.imageUrl || "";

    // Update shot with image URL
    await updateShotStatus(userId, state.id, shotId, {
      status: "image_ready",
      image_url: imageUrl,
      image_provider: generated[0]?.provider || "minimax",
    });

    return NextResponse.json({
      success: true,
      imageUrl,
      status: "image_ready",
      provider: generated[0]?.provider,
      model: generated[0]?.model,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IMAGE_GENERATION_ERROR";

    // Try to update shot status to error
    try {
      const state = await loadProductionState(userId, projectId);
      if (state) {
        await updateShotStatus(userId, state.id, shotId, {
          status: "error",
          error: message,
        });
      }
    } catch {
      // Ignore update error
    }

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
