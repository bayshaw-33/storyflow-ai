/**
 * GET /api/v2/source-works/[sourceWorkId]/versions — list read-only source
 * versions (view/download only; no edit/overwrite surface by design).
 * Phase 4 Task 4.5
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SourceWorkRow {
  work_id: string;
  owner_id: string;
  title: string;
  rights_state: string;
}

interface SourceVersionRow {
  id: string;
  source_work_id: string;
  version_no: number;
  file_hashes: string[];
  rights_declaration: Record<string, unknown>;
  manifest: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sourceWorkId: string }> },
) {
  try {
    if (!hasServiceRoleConfig()) {
      return NextResponse.json({ success: false, error: "Import service not configured.", code: "service_unavailable" }, { status: 503 });
    }
    const viewer = await getViewerFromCookies();
    if (!viewer) {
      return NextResponse.json({ success: false, error: "Authentication required.", code: "unauthenticated" }, { status: 401 });
    }
    const { sourceWorkId } = await params;

    const works = await serviceFetch<SourceWorkRow[]>(
      `/rest/v1/storyflow_source_works?work_id=eq.${encodeURIComponent(sourceWorkId)}&select=work_id,owner_id,title,rights_state&limit=1`,
    ).catch(() => [] as SourceWorkRow[]);
    const work = works?.[0];
    if (!work) {
      return NextResponse.json({ success: false, error: "Source work not found.", code: "not_found" }, { status: 404 });
    }
    if (work.owner_id !== viewer.id) {
      return NextResponse.json({ success: false, error: "Not the source work owner.", code: "forbidden" }, { status: 403 });
    }

    const versions = await serviceFetch<SourceVersionRow[]>(
      `/rest/v1/storyflow_source_versions?source_work_id=eq.${encodeURIComponent(sourceWorkId)}&select=id,source_work_id,version_no,file_hashes,rights_declaration,manifest,created_by,created_at&order=version_no.asc&limit=100`,
    ).catch(() => [] as SourceVersionRow[]);

    return NextResponse.json({
      success: true,
      contractVersion: "2.2.0-alpha.1",
      readOnly: true,
      work: { id: work.work_id, title: work.title, rightsState: work.rights_state },
      versions: (versions ?? []).map((v) => ({
        id: v.id,
        versionNo: v.version_no,
        fileHashes: v.file_hashes,
        rightsDeclaration: v.rights_declaration,
        manifest: v.manifest,
        createdBy: v.created_by,
        createdAt: v.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Import service unavailable.", code: "service_unavailable" }, { status: 503 });
  }
}
