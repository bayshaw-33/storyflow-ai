import { redirect } from "next/navigation";
import { getSupabaseServerClient, getViewerFromCookies, hasServiceRoleConfig } from "@/lib/supabase/server";
import { getPurchasedActors, type PurchasedActorItem } from "@/lib/supabase/marketplace-queries";
import { PurchasedActorsClient, type InitialPurchasedPayload } from "./PurchasedActorsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = { scope?: string; project_id?: string };

/**
 * /actors/purchased — 已购演员列表（SSR）
 *
 * 若服务端 cookie 可用则 SSR 拉首屏；若会话只存在浏览器 localStorage，交给客户端
 * 再读一次 Supabase session，避免已登录用户被错误重定向到登录页。
 */
export default async function PurchasedActorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!hasServiceRoleConfig()) {
    redirect("/login");
  }

  const viewer = await getViewerFromCookies();
  const client = getSupabaseServerClient();
  if (!client) {
    redirect("/login");
  }

  const params = await searchParams;
  const scope = params.scope === "global" || params.scope === "project" ? params.scope : "all";
  const projectId = params.project_id || null;

  // 首屏拉 12 条；客户端切 Tab / 加载更多走 /api/actors/purchased
  // lib 层签名：getPurchasedActors(serverClient, buyerId, cursor?, limit=12, scope?, projectId?)
  // scope 为 "all" 时不传（undefined），让 lib 返回全部
  const scopeParam = scope === "all" ? undefined : scope;
  const result = viewer
    ? await getPurchasedActors(client, viewer.id, null, 12, scopeParam, projectId).catch((error) => {
    // SSR 失败不阻塞页面：返回空列表 + 错误信息，客户端可重试
    console.error("[actors/purchased] SSR fetch failed:", error);
    return {
      items: [] as PurchasedActorItem[],
      nextCursor: null as string | null,
      hasMore: false,
    };
    })
    : { items: [] as PurchasedActorItem[], nextCursor: null as string | null, hasMore: false };

  const payload: InitialPurchasedPayload = {
    initialItems: result.items,
    initialCursor: result.nextCursor,
    hasMore: result.hasMore,
    total: result.items.length,
    initialScope: scope,
    initialProjectId: projectId,
    initialAuthenticated: Boolean(viewer),
  };

  return <PurchasedActorsClient initial={payload} />;
}
