import { buildUnifiedWorkbenchUrl, type UnifiedProductionStage, type UnifiedWorkbenchContextV1 } from "@/lib/contracts/v2/unified-workbench";
import { fetchScreenplayStudio } from "@/lib/client/v2/screenplay-studio/auth";

async function parse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body.error === "string" ? body.error : "统一工作台服务暂时不可用。",
    );
  }
  return body as T;
}

export async function fetchUnifiedWorkbenchContext(projectId: string) {
  return parse<UnifiedWorkbenchContextV1>(
    await fetchScreenplayStudio(
      `/api/v2/projects/${encodeURIComponent(projectId)}/workbench-context`,
    ),
  );
}

export async function ensureUnifiedStage(
  projectId: string,
  stage: UnifiedProductionStage,
) {
  return parse<{ workId: string; created: boolean }>(
    await fetchScreenplayStudio(
      `/api/v2/projects/${encodeURIComponent(projectId)}/workbench-stages/${stage}/ensure`,
      {
        method: "POST",
        headers: { "idempotency-key": `stage:${projectId}:${stage}` },
      },
    ),
  );
}

export async function resolveUnifiedWorkbenchRoute(input: {
  projectId: string;
  workId?: string | null;
  tab: UnifiedProductionStage;
  unitId?: string | null;
}) {
  let workId = input.workId;
  if (!workId) {
    const response = await fetchScreenplayStudio(
      `/api/v2/project-start/resolve-work?projectId=${encodeURIComponent(input.projectId)}`,
    );
    const body = await parse<{ success?: boolean; workId?: string }>(response);
    if (!body.success || !body.workId) {
      throw new Error("旧项目暂时无法解析出 Work。");
    }
    workId = body.workId;
  }

  return buildUnifiedWorkbenchUrl({ ...input, workId });
}
