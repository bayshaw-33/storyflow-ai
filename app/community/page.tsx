import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { searchCommunityFeed } from "@/lib/server/v2/community/search";
import { CommunityServiceError } from "@/lib/server/v2/community/publications";
import { DiscoveryFeed } from "@/components/v2/community/DiscoveryFeed";
import { CommunityPlaceholderClient } from "./CommunityPlaceholderClient";

export const dynamic = "force-dynamic";

/**
 * /community — IP 资产社区发现页 (Phase 5, CM-002)
 *
 * Phase 7 (CM-010 解除): feature flag 限制已移除。
 * /community 现在对所有用户公开可访问 (匿名用户受 RLS 限制，只能浏览 public)。
 *
 * CM-002: 发现页只查询允许公开访问的 publication 投影，不查私有资源表。
 * 匿名用户可浏览 public；认证用户额外可查询自己发布的。
 */
export default async function CommunityPage() {
  // 服务未配置 → 占位 (不静默切 fixture)
  if (!hasServiceRoleConfig()) {
    return <CommunityPlaceholderClient />;
  }

  // C0：服务端预取带公开 source context 的社区卡片投影。
  const viewer = await getViewerFromCookies();
  let initialItems: Awaited<ReturnType<typeof searchCommunityFeed>>["items"] = [];
  let initialNextCursor: string | null = null;
  let initialHasMore = false;
  let loadError: string | null = null;
  try {
    const initialResult = await searchCommunityFeed(serviceFetch, {
      section: "recommended",
      limit: 20,
      viewerId: viewer?.id ?? null,
    });
    initialItems = initialResult.items;
    initialNextCursor = initialResult.nextCursor;
    initialHasMore = initialResult.hasMore;
  } catch (e) {
    loadError =
      e instanceof CommunityServiceError ? e.message : "社区内容暂时无法加载，请稍后重试。";
  }

  return <DiscoveryFeed initialItems={initialItems} initialNextCursor={initialNextCursor} initialHasMore={initialHasMore} initialViewerId={viewer?.id ?? null} loadError={loadError} />;
}
