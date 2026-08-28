import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { readCommunityUniverse } from "@/lib/server/v2/community/universe";
import { CommunityServiceError } from "@/lib/server/v2/community/publications";
import { UniverseCommunityPage } from "@/components/v2/community/UniverseCommunityPage";

export const dynamic = "force-dynamic";

// 客户端创建链路：/api/v2/project-start → /api/v2/projects/:projectId/universe/bind，通过 idempotency-key 保证重复点击安全。
export default async function UniverseCommunityRoute({ params }: { params: Promise<{ universeId: string }> }) {
  const { universeId } = await params;
  const viewer = await getViewerFromCookies();
  if (!hasServiceRoleConfig()) {
    return <UniverseCommunityPage data={null} viewerId={viewer?.id ?? null} error="社区数据服务尚未配置。" />;
  }

  try {
    const data = await readCommunityUniverse(serviceFetch, { universeId, viewerId: viewer?.id ?? null });
    return <UniverseCommunityPage data={data} viewerId={viewer?.id ?? null} />;
  } catch (error) {
    const message = error instanceof CommunityServiceError
      ? error.code === "forbidden" ? "这个 Universe 尚未公开，或你没有访问权限。" : error.message
      : "Universe 社区数据暂时无法加载。";
    return <UniverseCommunityPage data={null} viewerId={viewer?.id ?? null} error={message} />;
  }
}
