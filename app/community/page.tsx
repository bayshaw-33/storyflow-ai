import { hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { listDiscoveryFeed } from "@/lib/server/v2/community/discovery";
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

  // CM-002: 服务端预取发现页投影 (前 20 条 public)
  let initialItems: Awaited<ReturnType<typeof listDiscoveryFeed>> = [];
  let loadError: string | null = null;
  try {
    initialItems = await listDiscoveryFeed(serviceFetch, { limit: 20 });
  } catch (e) {
    loadError =
      e instanceof CommunityServiceError ? e.message : "Unable to load discovery feed.";
  }

  return <DiscoveryFeed initialItems={initialItems} loadError={loadError} />;
}
