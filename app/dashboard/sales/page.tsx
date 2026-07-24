import { redirect } from "next/navigation";
import {
  getSupabaseServerClient,
  getViewerFromCookies,
  hasServiceRoleConfig,
} from "@/lib/supabase/server";
import { getSellerOrders, type SellerOrderItem } from "@/lib/supabase/marketplace-queries";
import { getSalesSummary, type SalesSummary } from "@/lib/marketplace/revenue-stats";
import { SalesDashboardClient, type InitialSalesPayload } from "./SalesDashboardClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = { tab?: string };

/**
 * /dashboard/sales — 创作者销售面板（SSR）
 *
 * 必须登录：未登录跳 /login。
 * SSR 拉 summary + 默认 Tab（orders）首屏，其余 Tab 客户端按需加载。
 */
export default async function SalesDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!hasServiceRoleConfig()) {
    redirect("/login");
  }

  const viewer = await getViewerFromCookies();
  if (!viewer) {
    redirect("/login");
  }

  const client = getSupabaseServerClient();
  if (!client) {
    redirect("/login");
  }

  const params = await searchParams;
  const initialTab = params.tab === "revenue" || params.tab === "listings" ? params.tab : "orders";

  // 并发拉 summary + 默认 Tab 首屏；任一失败不阻塞整页
  const [summaryResult, ordersResult] = await Promise.all([
    getSalesSummary(client, viewer.id).catch((error: Error) => {
      console.error("[dashboard/sales] summary fetch failed:", error);
      return null as SalesSummary | null;
    }),
    getSellerOrders(client, viewer.id, null, 12).catch((error: Error) => {
      console.error("[dashboard/sales] orders fetch failed:", error);
      return { items: [] as SellerOrderItem[], nextCursor: null, hasMore: false };
    }),
  ]);

  const payload: InitialSalesPayload = {
    summary: summaryResult,
    initialTab: initialTab as "orders" | "revenue" | "listings",
    ordersInitial: {
      items: ordersResult.items,
      nextCursor: ordersResult.nextCursor,
      hasMore: ordersResult.hasMore,
    },
  };

  return <SalesDashboardClient initial={payload} />;
}
