import { NextRequest } from "next/server";
import { apiError, ok } from "@/lib/api/responses";
import { authenticateRequest, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";

const TABLE = "/rest/v1/storyflow_export_archives";

const SELECT_FIELDS =
  "id,project_id,owner_id,archive_schema_version,manifest_json,sha256,storage_path,file_size_bytes,previous_archive_id,status,created_at";

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    if (!hasServiceRoleConfig()) throw new Error("MISSING_SUPABASE_SERVICE_ROLE_KEY");

    const projectId = request.nextUrl.searchParams.get("projectId");
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 500) : 50;

    const filters = [`owner_id=eq.${encodeURIComponent(user.id)}`];
    if (projectId) filters.push(`project_id=eq.${encodeURIComponent(projectId)}`);

    const query = `${TABLE}?${filters.join("&")}&select=${SELECT_FIELDS}&order=created_at.desc&limit=${limit}`;
    const archives = await serviceFetch<unknown[]>(query);
    return ok({ archives });
  } catch (error) {
    return apiError(error, "读取档案列表失败。");
  }
}
