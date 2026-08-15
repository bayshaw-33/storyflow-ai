/**
 * GET /api/v2/project-start/resolve-work?projectId=...
 *
 * Legacy adaptation (Phase 3 Task 3.3): resolves a legacy projectId to its
 * primary Work id so /script-workbench can enter the Screenplay Studio.
 * Read-only; never creates or mutates data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { isRetiredNovelRecord } from "@/lib/v2/retired-novel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProjectMarkerRow { workflow_type?: string | null; mode?: string | null; data?: Record<string, unknown> | null }
interface WorkRow { id: string; owner_id: string; is_primary: boolean }

export async function GET(request: NextRequest) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json(
        { success: false, error: "Work service not configured.", code: "service_unavailable" },
        { status: 503 },
      );
    }
    const viewer = await getViewerFromCookies();
    if (!viewer) {
      return NextResponse.json(
        { success: false, error: "Authentication required.", code: "unauthenticated" },
        { status: 401 },
      );
    }
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId is required.", code: "validation_failed" },
        { status: 422 },
      );
    }
    const projects = await serviceFetch<ProjectMarkerRow[]>(
      `/rest/v1/storyflow_projects?id=eq.${encodeURIComponent(projectId)}&select=workflow_type,mode,data&limit=1`,
    );
    if (projects[0] && isRetiredNovelRecord(projects[0])) {
      return NextResponse.json(
        { success: false, error: "This legacy novel project has been retired.", code: "retired_novel" },
        { status: 410 },
      );
    }
    const rows = await serviceFetch<WorkRow[]>(
      `/rest/v1/storyflow_works?project_id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(viewer.id)}&select=id,owner_id,is_primary&order=created_at.asc&limit=10`,
    );
    const primary = (rows ?? []).find((r) => r.is_primary) ?? rows?.[0];
    if (!primary) {
      return NextResponse.json(
        { success: false, error: "No Work found for this project.", code: "not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, contractVersion: "2.2.0-alpha.1", workId: primary.id });
  } catch {
    return NextResponse.json(
      { success: false, error: "Work service unavailable.", code: "service_unavailable" },
      { status: 503 },
    );
  }
}
