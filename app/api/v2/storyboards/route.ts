import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import {
  upsertStoryboardWithCAS,
  getCurrentStoryboard,
  listStoryboardsForHandoff,
  getStoryboardHistory,
  isCasConflict,
  isUpsertSuccess,
  DynamicGridStoreError,
} from "@/lib/server/v2/dynamic-storyboards";
import { dynamicStoryboardErrorResponse } from "@/lib/server/v2/dynamic-storyboards/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/storyboards
 *
 * 查询参数:
 *   - handoffId (必填)
 *   - sceneId (可选): 提供时返回该场景的当前版本; 否则返回 handoff 下所有场景
 *   - history=true (可选): 与 sceneId 一起使用, 返回历史版本列表 (倒序)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    ensureConfig();

    const url = new URL(request.url);
    const handoffId = url.searchParams.get("handoffId");
    const sceneId = url.searchParams.get("sceneId");
    const history = url.searchParams.get("history") === "true";

    if (!handoffId) {
      return NextResponse.json(
        { success: false, error: "handoffId query parameter is required.", code: "validation_failed" },
        { status: 422 }
      );
    }

    if (sceneId) {
      if (history) {
        const result = await getStoryboardHistory({
          fetcher: serviceFetch,
          userId: user.id,
          handoffId,
          sceneId,
        });
        return NextResponse.json({
          success: true,
          contractVersion: "kiikis.dynamic-grid-storyboard/1",
          items: result.items,
        });
      }
      const result = await getCurrentStoryboard({
        fetcher: serviceFetch,
        userId: user.id,
        handoffId,
        sceneId,
      });
      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.dynamic-grid-storyboard/1",
        storyboard: result.storyboard,
        rowId: result.rowId,
        revision: result.revision,
        parentId: result.parentId,
        createdAt: result.createdAt,
      });
    }

    const result = await listStoryboardsForHandoff({
      fetcher: serviceFetch,
      userId: user.id,
      handoffId,
    });
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.dynamic-grid-storyboard/1",
      items: result.items,
    });
  } catch (error) {
    return routeError(error, "Unable to fetch dynamic storyboards.");
  }
}

/**
 * POST /api/v2/storyboards
 *
 * Body:
 *   - handoffId, sceneId (必填)
 *   - expectedRevision: -1 表示首次创建; 否则必须匹配当前 revision (CAS)
 *   - continuityMode, gridCount, gridRationale, spatialPlan,
 *     sharedCinematography, negativePrompt, frames
 *   - revisionSource: "ai" | "user" | "system"
 *
 * 成功 → 201 (created) | 200 (revision_added) | 200 (idempotent_skip)
 * CAS 冲突 → 409 + diff
 * 锁定冲突 → 409 + diff (locked_override)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    ensureConfig();

    const body = await request.json().catch(() => ({}));

    if (!body.handoffId || !body.sceneId) {
      return NextResponse.json(
        { success: false, error: "handoffId and sceneId are required.", code: "validation_failed" },
        { status: 422 }
      );
    }

    if (typeof body.expectedRevision !== "number" || body.expectedRevision < -1) {
      return NextResponse.json(
        {
          success: false,
          error: "expectedRevision must be a non-negative integer or -1 for first creation.",
          code: "validation_failed",
        },
        { status: 422 }
      );
    }

    const result = await upsertStoryboardWithCAS({
      fetcher: serviceFetch,
      userId: user.id,
      input: {
        handoffId: body.handoffId,
        sceneId: body.sceneId,
        continuityMode: body.continuityMode,
        gridCount: body.gridCount,
        gridRationale: body.gridRationale,
        spatialPlan: body.spatialPlan,
        sharedCinematography: body.sharedCinematography,
        negativePrompt: body.negativePrompt ?? "",
        frames: body.frames,
        revisionSource: body.revisionSource ?? "ai",
      },
      expectedRevision: body.expectedRevision,
    });

    if (isUpsertSuccess(result)) {
      const status =
        result.status === "created" ? 201 : result.status === "revision_added" ? 201 : 200;
      return NextResponse.json(
        {
          success: true,
          contractVersion: "kiikis.dynamic-grid-storyboard/1",
          storyboard: result.storyboard,
          rowId: result.rowId,
          revision: result.revision,
          status: result.status,
          parentId: result.parentId,
        },
        { status }
      );
    }

    if (isCasConflict(result)) {
      return NextResponse.json(
        {
          success: false,
          code: result.kind,
          error: result.message,
          currentRevision: result.currentRevision,
          currentStoryboard: result.currentStoryboard,
          attemptedStoryboard: result.attemptedStoryboard,
          diff: result.diff,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Unexpected upsert result.", code: "service_unavailable" },
      { status: 500 }
    );
  } catch (error) {
    return routeError(error, "Unable to create dynamic storyboard revision.");
  }
}

function ensureConfig() {
  if (!hasServiceRoleConfig()) {
    throw new DynamicGridStoreError("service_unavailable", "Cloud data service is not configured.");
  }
}

function routeError(error: unknown, fallback: string) {
  if (
    error instanceof Error &&
    (error.message.includes("MISSING_AUTH_TOKEN") || error.message.includes("INVALID_AUTH_TOKEN"))
  ) {
    return NextResponse.json(
      { success: false, error: "Authentication is required.", code: "unauthenticated" },
      { status: 401 }
    );
  }
  return dynamicStoryboardErrorResponse(error, fallback);
}
