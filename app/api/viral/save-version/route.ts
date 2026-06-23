import { NextResponse } from "next/server";
import { authenticateRequest, serviceFetch } from "@/lib/supabase/server";
import { failure, readViralProject } from "../_utils";

type ViralVersionRow = {
  id: string;
  viral_project_id: string;
  user_id: string;
  version_type?: string | null;
  title?: string | null;
  content_markdown?: string | null;
  content_json?: unknown;
  created_at?: string | null;
};

export async function GET(request: Request) {
  let user;

  try {
    user = await authenticateRequest(request);
  } catch {
    return failure("请先登录后再查看版本历史。", 401);
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return failure("缺少 projectId。", 400);

  try {
    const project = await readViralProject(projectId, user.id);
    if (!project) return failure("爆款项目不存在。", 404);

    const versions = await serviceFetch<ViralVersionRow[]>(
      `/rest/v1/storyflow_viral_versions?viral_project_id=eq.${encodeURIComponent(projectId)}&user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc&limit=20`,
    );

    return NextResponse.json({ success: true, versions });
  } catch (error) {
    return failure(toFriendlyError(error), 500);
  }
}

export async function POST(request: Request) {
  let body: { projectId?: string; versionType?: string; content?: string };

  try {
    body = (await request.json()) as { projectId?: string; versionType?: string; content?: string };
  } catch {
    return failure("请求格式不正确。", 400);
  }

  if (!body.projectId) return failure("缺少 projectId。", 400);
  if (!body.content?.trim()) return failure("没有可保存的版本内容。", 400);

  let user;
  try {
    user = await authenticateRequest(request);
  } catch {
    return failure("请先登录后再保存版本。", 401);
  }

  try {
    const project = await readViralProject(body.projectId, user.id);
    if (!project) return failure("爆款项目不存在。", 404);

    const rows = await serviceFetch<ViralVersionRow[]>("/rest/v1/storyflow_viral_versions", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        viral_project_id: body.projectId,
        user_id: user.id,
        version_type: body.versionType || "viral_workbench",
        title: buildVersionTitle(body.versionType),
        content_markdown: body.content.trim(),
        content_json: {
          versionType: body.versionType || "viral_workbench",
          sourceVideoName: project.source_video_name || null,
        },
        created_at: new Date().toISOString(),
      }),
    });

    return NextResponse.json({
      success: true,
      version: rows[0] || null,
    });
  } catch (error) {
    return failure(toFriendlyError(error), 500);
  }
}

function buildVersionTitle(versionType?: string) {
  if (versionType === "analysis") return "结构分析版本";
  if (versionType === "remake") return "同结构改写版本";
  return "爆款创作版本";
}

function toFriendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("SUPABASE_SERVICE_ERROR")) {
    return "版本保存或读取失败，请检查 storyflow_viral_versions 表结构。";
  }

  return "版本操作失败，请稍后重试。";
}
