import { NextRequest, NextResponse } from "next/server";
import { getViewerFromRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { getCommunityPublicationDetail } from "@/lib/server/v2/community/discovery";
import {
  listCommunityReuseTargets,
  resolvePublicationReuseCapabilities,
} from "@/lib/server/v2/community/reuse";
import { WorkUsageError, WorkUsageService } from "@/lib/server/v2/work-usage";
import type { UsageRole } from "@/lib/contracts/v2/work-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { viewer, publicationId, detail, capability } = await loadContext(request, context);
    const targets = capability.mode === "owned" || capability.mode === "granted"
      ? await listCommunityReuseTargets(serviceFetch, viewer.id, capability.sourceWorkId)
      : [];
    return NextResponse.json({
      success: true,
      contractVersion: "kiikis.community.reuse/1",
      publicationId,
      capability,
      targets,
      marketplaceHref: capability.mode === "offer" ? `/business/marketplace/${encodeURIComponent(detail.publication.sourceId)}` : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { viewer, capability } = await loadContext(request, context);
    if ((capability.mode !== "owned" && capability.mode !== "granted") || !capability.sourceWorkId || !capability.sourceWorkVersionId) {
      throw new WorkUsageError("forbidden", "No verified Work reuse right is available.");
    }
    const body = await request.json().catch(() => ({}));
    const targetWorkId = String(body.targetWorkId ?? "");
    const targets = await listCommunityReuseTargets(serviceFetch, viewer.id, capability.sourceWorkId);
    const target = targets.find((item) => item.workId === targetWorkId);
    if (!target) throw new WorkUsageError("forbidden", "Target Work is not owned by the viewer.");
    const service = new WorkUsageService(serviceFetch);
    const link = await service.createLink({
      ownerId: viewer.id,
      sourceWorkId: capability.sourceWorkId,
      sourceWorkVersionId: capability.sourceWorkVersionId,
      targetProjectId: target.projectId,
      targetWorkId: target.workId,
      usageRole: usageRoleForTarget(target.workType),
      grantId: capability.grantId,
    });
    return NextResponse.json(
      { success: true, contractVersion: "kiikis.community.reuse/1", link },
      { status: link.idempotent ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

async function loadContext(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasServiceRoleConfig()) throw new WorkUsageError("service_unavailable", "Community reuse service is not configured.");
  const viewer = await getViewerFromRequest(request);
  if (!viewer) throw new WorkUsageError("unauthenticated", "Authentication required.");
  const { id: publicationId } = await context.params;
  const detail = await getCommunityPublicationDetail(serviceFetch, publicationId);
  if (!detail || detail.publication.status !== "active") throw new WorkUsageError("not_found", "Publication not found.");
  const row = {
    id: detail.publication.id,
    source_type: detail.publication.sourceType,
    source_id: detail.publication.sourceId,
    publisher_id: detail.publication.publisherId,
    work_id: detail.context.workId,
  };
  const capabilities = await resolvePublicationReuseCapabilities(serviceFetch, [row], viewer.id);
  return { viewer, publicationId, detail, capability: capabilities.get(publicationId)! };
}

function usageRoleForTarget(workType: string): UsageRole {
  if (workType === "art") return "art_reference";
  if (workType === "storyboard") return "storyboard_source";
  if (workType === "video") return "video_source";
  if (workType === "editing") return "editing_input";
  if (workType === "song") return "work_theme";
  if (workType === "voice") return "narration";
  return "source_script";
}

function errorResponse(error: unknown) {
  if (error instanceof WorkUsageError) {
    const status = error.code === "unauthenticated" ? 401 : error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : error.code === "conflict" ? 409 : error.code === "validation_failed" ? 422 : 503;
    return NextResponse.json({ success: false, error: error.message.replace(`${error.code}: `, ""), code: error.code }, { status });
  }
  return NextResponse.json({ success: false, error: "Community reuse service unavailable.", code: "service_unavailable" }, { status: 503 });
}
