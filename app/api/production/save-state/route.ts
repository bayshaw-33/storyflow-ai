import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase/server";
import { createEmptyProductionState } from "@/lib/production/state";
import { loadProductionState, saveProductionState } from "@/lib/production/api";
import type { ProductionProjectState } from "@/lib/production/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SaveStateRequest = {
  projectId?: string;
  mode?: "save" | "load";
  state?: Partial<ProductionProjectState>;
};

export async function POST(request: Request) {
  let body: SaveStateRequest;
  try {
    body = (await request.json()) as SaveStateRequest;
  } catch {
    return NextResponse.json(
      { success: false, error: "请求格式不正确，请提交 JSON。" },
      { status: 400 },
    );
  }

  const projectId = body.projectId?.trim();
  if (!projectId) {
    return NextResponse.json({ success: false, error: "缺少 projectId。" }, { status: 400 });
  }

  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch {
    return NextResponse.json({ success: false, error: "请先登录后再操作。" }, { status: 401 });
  }

  try {
    if (body.mode === "load") {
      const state = await loadProductionState(userId, projectId);
      return NextResponse.json({ success: true, state });
    }

    // Save mode
    if (!body.state) {
      return NextResponse.json({ success: false, error: "缺少 state 数据。" }, { status: 400 });
    }

    const normalizedState = createEmptyProductionState(body.state);
    normalizedState.projectId = projectId;
    normalizedState.updatedAt = new Date().toISOString();

    const productionProjectId = await saveProductionState(userId, projectId, normalizedState);

    return NextResponse.json({
      success: true,
      productionProjectId,
      state: normalizedState,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SAVE_STATE_ERROR";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
