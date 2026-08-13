import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { submitReview, decideReview, listReviews } from "@/lib/server/v2/collab/reviews";
import { CollabServiceError } from "@/lib/server/v2/collab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v2/projects/[projectId]/reviews — 列出审阅 (CO-004)
 *   query: resourceType, resourceId, status
 *
 * POST /api/v2/projects/[projectId]/reviews — 提交审阅 (CO-004: pending → in_review)
 *   body: { resourceType, resourceId, resourceVersion?, action: "submit" | "decide", reviewId?, decision?, reason?, changeSuggestions? }
 *   reviewerId 由服务端认证填入 (RG-001)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Collab service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    await params;
    const url = new URL(request.url);
    const resourceType = url.searchParams.get("resourceType");
    const resourceId = url.searchParams.get("resourceId");
    const status = url.searchParams.get("status") ?? undefined;

    if (!resourceType || !resourceId) {
      return NextResponse.json(
        { success: false, error: "resourceType and resourceId are required.", code: "validation_failed" },
        { status: 422 },
      );
    }

    const reviews = await listReviews(serviceFetch, { resourceType, resourceId, status });
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.collab/1",
      reviews,
    });
  } catch (error) {
    return collabErrorResponse(error, "Unable to list reviews.");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Collab service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    await params;
    const body = await request.json().catch(() => ({}));

    if (body.action === "submit") {
      // CO-004: 提交审阅 (pending → in_review)
      const review = await submitReview(serviceFetch, {
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        resourceVersion: body.resourceVersion ?? null,
        reviewerId: user.id, // RG-001
        idempotencyKey: body.idempotencyKey || `review:${user.id}:${body.resourceType}:${body.resourceId}:${Date.now()}`,
      });
      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.collab/1",
        review,
      }, { status: 201 });
    }

    if (body.action === "decide") {
      // CO-005: 批准/驳回
      const review = await decideReview(serviceFetch, {
        reviewId: body.reviewId,
        decision: body.decision,
        reason: body.reason,
        changeSuggestions: body.changeSuggestions,
      });
      return NextResponse.json({
        success: true,
        contractVersion: "kiikis.collab/1",
        review,
      });
    }

    return NextResponse.json(
      { success: false, error: "action must be 'submit' or 'decide'.", code: "validation_failed" },
      { status: 422 },
    );
  } catch (error) {
    return collabErrorResponse(error, "Unable to process review.");
  }
}

function collabErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CollabServiceError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
  }
  return NextResponse.json({ success: false, error: fallback, code: "service_unavailable" }, { status: 503 });
}
