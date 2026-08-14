/**
 * POST /api/v2/project-start
 *
 * Atomically creates a Project and its primary Work via the
 * create_project_with_primary_work RPC. Returns contract_version 2.2.0-alpha.1.
 *
 * Identity is derived from the auth token; ownerId is never trusted from the
 * request body (PRD §15.3).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  hasServiceRoleConfig,
  serviceFetch,
} from "@/lib/supabase/server";
import {
  createProjectWithPrimaryWork,
  WorksServiceError,
} from "@/lib/server/v2/works";
import { worksErrorResponse } from "@/lib/server/v2/works/http";
import {
  WORK_CONTRACT_VERSION,
  isWorkType,
  type WorkType,
} from "@/lib/contracts/v2/work";
import { resolveWorkbenchRoute } from "@/lib/client/v2/navigation/resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProjectStartRequestBody {
  workType?: unknown;
  title?: unknown;
  universeId?: unknown;
}

export async function POST(request: NextRequest) {
  let body: ProjectStartRequestBody;
  try {
    body = (await request.json()) as ProjectStartRequestBody;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid JSON body.",
        code: "validation_failed",
      },
      { status: 422 },
    );
  }

  let userId: string;
  try {
    const user = await authenticateRequest(request);
    userId = user.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("MISSING_AUTH_TOKEN") ||
      message.includes("INVALID_AUTH_TOKEN")
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication is required.",
          code: "unauthenticated",
        },
        { status: 401 },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: "Authentication service unavailable.",
        code: "service_unavailable",
      },
      { status: 503 },
    );
  }

  if (!hasServiceRoleConfig()) {
    return NextResponse.json(
      {
        success: false,
        error: "Cloud data service is not configured.",
        code: "service_unavailable",
      },
      { status: 503 },
    );
  }

  if (!isWorkType(body.workType)) {
    return NextResponse.json(
      {
        success: false,
        error: `Unsupported work type: ${String(body.workType)}`,
        code: "validation_failed",
        field: "workType",
      },
      { status: 422 },
    );
  }

  const idempotencyKey =
    request.headers.get("idempotency-key") || crypto.randomUUID();

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : undefined;
  const universeId =
    typeof body.universeId === "string" && body.universeId
      ? body.universeId
      : null;

  let outcome;
  try {
    outcome = await createProjectWithPrimaryWork(
      {
        ownerId: userId,
        workType: body.workType as WorkType,
        title,
        universeId,
        idempotencyKey,
      },
      serviceFetch,
    );
  } catch (error) {
    if (error instanceof WorksServiceError && error.code === "unauthenticated") {
      return NextResponse.json(
        { success: false, error: "Authentication is required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    return worksErrorResponse(error, "Unable to start project.");
  }

  const workbenchRoute = resolveWorkbenchRoute(outcome.workType, {
    projectId: outcome.projectId,
    workId: outcome.workId,
  });

  return NextResponse.json(
    {
      success: true,
      contractVersion: WORK_CONTRACT_VERSION,
      projectId: outcome.projectId,
      work: {
        id: outcome.workId,
        workType: outcome.workType,
        title: outcome.title,
      },
      workbenchRoute,
    },
    { status: 201 },
  );
}
