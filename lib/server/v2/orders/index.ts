import type { LicenseOfferTerms, UsageGrantStatus } from "@/lib/contracts/v2";

export type OrdersFetcher = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

export class OrdersError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "not_found" | "conflict" | "validation_failed" | "service_unavailable";
  constructor(code: OrdersError["code"], message: string) { super(`${code}: ${message}`); this.name = "OrdersError"; this.code = code; }
}

export type PaymentStatus = "pending" | "processing" | "succeeded" | "failed" | "refunded" | "cancelled";
export type OrderStatus = "pending" | "paid" | "failed" | "refunded" | "cancelled";
export type SettlementStatus = "pending" | "settled" | "disputed";

type OfferRow = { id: string; asset_id: string; asset_version_id: string; owner_id: string; terms: LicenseOfferTerms; price_cents: number; currency: string; status: string };
type GrantRow = { id: string; offer_id: string; asset_id: string; asset_version_id: string; licensor_id: string; licensee_id: string; target_project_id: string; status: UsageGrantStatus };
type OrderRow = { id: string; offer_id: string; grant_id: string; buyer_id: string; seller_id: string; asset_id: string; asset_version_id: string; amount_cents: number; currency: string; license_terms_snapshot: LicenseOfferTerms; payment_status: PaymentStatus; order_status: OrderStatus; created_at: string; updated_at?: string | null };
type LedgerRow = { id: string; order_id?: string | null; payment_id?: string | null; entry_type: "income" | "platform_fee" | "refund" | "adjustment"; amount_cents: number; currency: string; status: string; description: string; created_at: string };
type SettlementRow = { id: string; creator_id: string; ledger_entry_id?: string | null; amount_cents: number; currency: string; status: SettlementStatus; settlement_method?: string; manual_settlement_notice?: string; handled_by?: string | null; settled_at?: string | null; dispute_reason?: string | null };

export interface CreateOrderInput { offerId: string; grantId: string }
export interface UpdatePaymentInput { status: "processing" | "failed" | "succeeded"; paymentId?: string; providerReference?: string; failureReason?: string }

const MANUAL_SETTLEMENT_NOTICE = "manual_settlement_required" as const;

export async function createOrder(params: { fetcher: OrdersFetcher; userId: string; input: CreateOrderInput }) {
  assertUser(params.userId); if (!params.input.offerId || !params.input.grantId) throw new OrdersError("validation_failed", "offerId and grantId are required.");
  const offers = await query<OfferRow[]>(params.fetcher, `/rest/v1/storyflow_v2_license_offers?id=eq.${encodeURIComponent(params.input.offerId)}&status=eq.active&select=*&limit=1`);
  const offer = offers?.[0]; if (!offer) throw new OrdersError("not_found", "Active license offer not found.");
  const grants = await query<GrantRow[]>(params.fetcher, `/rest/v1/storyflow_v2_usage_grants?id=eq.${encodeURIComponent(params.input.grantId)}&offer_id=eq.${encodeURIComponent(offer.id)}&select=*&limit=1`);
  const grant = grants?.[0];
  if (!grant) throw new OrdersError("not_found", "Usage grant not found for this license offer.");
  if (grant.licensee_id !== params.userId) throw new OrdersError("forbidden", "Only the grant licensee can create the order.");
  if (grant.status !== "pending") throw new OrdersError("conflict", "Only a pending Usage Grant can be ordered.");
  if (grant.asset_id !== offer.asset_id || grant.asset_version_id !== offer.asset_version_id) throw new OrdersError("conflict", "Offer and Usage Grant asset identities do not match.");
  const rows = await query<OrderRow[]>(params.fetcher, "/rest/v1/storyflow_v2_orders", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ offer_id: offer.id, grant_id: grant.id, buyer_id: params.userId, seller_id: offer.owner_id, asset_id: offer.asset_id, asset_version_id: offer.asset_version_id, amount_cents: offer.price_cents, currency: offer.currency, license_terms_snapshot: offer.terms, payment_status: "pending", order_status: "pending", manual_settlement_notice: MANUAL_SETTLEMENT_NOTICE }) });
  const row = rows?.[0]; if (!row) throw new OrdersError("service_unavailable", "Unable to create order.");
  return { order: toOrder(row), paymentStatus: row.payment_status, grantStatus: grant.status };
}

export async function listOrders(params: { fetcher: OrdersFetcher; userId: string; paymentStatus?: string | null; orderStatus?: string | null }) {
  assertUser(params.userId); const filters = [`or=(buyer_id.eq.${encodeURIComponent(params.userId)},seller_id.eq.${encodeURIComponent(params.userId)})`];
  if (params.paymentStatus) { assertPaymentStatus(params.paymentStatus); filters.push(`payment_status=eq.${encodeURIComponent(params.paymentStatus)}`); }
  if (params.orderStatus) { assertOrderStatus(params.orderStatus); filters.push(`order_status=eq.${encodeURIComponent(params.orderStatus)}`); }
  const rows = await query<OrderRow[]>(params.fetcher, `/rest/v1/storyflow_v2_orders?${filters.join("&")}&select=*&order=created_at.desc&limit=500`);
  return { items: (rows || []).map(toOrder) };
}

export async function readOrder(params: { fetcher: OrdersFetcher; userId: string; orderId: string }) {
  assertUser(params.userId); if (!params.orderId) throw new OrdersError("validation_failed", "Order id is required.");
  const rows = await query<OrderRow[]>(params.fetcher, `/rest/v1/storyflow_v2_orders?id=eq.${encodeURIComponent(params.orderId)}&or=(buyer_id.eq.${encodeURIComponent(params.userId)},seller_id.eq.${encodeURIComponent(params.userId)})&select=*&limit=1`);
  const row = rows?.[0]; if (!row) throw new OrdersError("not_found", "Order not found.");
  return { order: toOrder(row) };
}

export async function updateOrderPayment(params: { fetcher: OrdersFetcher; userId: string; orderId: string; paymentId?: string; input: UpdatePaymentInput; trustedConfirmation?: boolean }) {
  const current = await readOrder(params); const input = params.input;
  if (!["processing", "failed", "succeeded"].includes(input.status)) throw new OrdersError("validation_failed", "Unsupported payment status.");
  if (input.status === "succeeded") {
    if (!params.trustedConfirmation) throw new OrdersError("forbidden", "Payment success requires trusted provider confirmation.");
    const paymentId = input.paymentId || params.paymentId || await findPaymentId(params.fetcher, params.orderId);
    const result = await query<{ order: OrderRow; grant_status?: UsageGrantStatus; payment?: unknown }>(params.fetcher, "/rpc/confirm_order_payment", { method: "POST", body: JSON.stringify({ p_order_id: params.orderId, p_payment_id: paymentId, p_provider_reference: input.providerReference || null, p_confirmed_by: params.userId }) });
    if (!result?.order) throw new OrdersError("service_unavailable", "Unable to confirm payment.");
    return { order: toOrder(result.order), grantStatus: result.grant_status || "active", payment: result.payment || null };
  }
  if (input.status === "failed") {
    const paymentId = input.paymentId || params.paymentId || await findPaymentId(params.fetcher, params.orderId);
    const result = await query<{ order: OrderRow; grant_status?: UsageGrantStatus; payment?: unknown }>(params.fetcher, "/rpc/fail_order_payment", { method: "POST", body: JSON.stringify({ p_order_id: params.orderId, p_payment_id: paymentId, p_reason: input.failureReason || null }) });
    if (!result?.order) throw new OrdersError("service_unavailable", "Unable to fail payment.");
    return { order: toOrder(result.order), grantStatus: result.grant_status || "pending", payment: result.payment || null };
  }
  const paymentId = input.paymentId || params.paymentId || await findPaymentId(params.fetcher, params.orderId);
  const rows = await query<unknown[]>(params.fetcher, `/rest/v1/storyflow_v2_payments?id=eq.${encodeURIComponent(paymentId)}&order_id=eq.${encodeURIComponent(params.orderId)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ status: "processing" }) });
  if (!rows?.length) throw new OrdersError("service_unavailable", "Unable to update payment.");
  return { order: { ...current.order, paymentStatus: "processing" as const }, grantStatus: "pending", payment: rows[0] };
}

export async function refundOrder(params: { fetcher: OrdersFetcher; userId: string; orderId: string; reason?: string }) {
  assertUser(params.userId); if (!params.orderId) throw new OrdersError("validation_failed", "Order id is required.");
  const result = await query<{ order: OrderRow; grant_status?: UsageGrantStatus; payment?: unknown }>(params.fetcher, "/rpc/refund_order", { method: "POST", body: JSON.stringify({ p_order_id: params.orderId, p_actor_id: params.userId, p_reason: params.reason || null }) });
  if (!result?.order) throw new OrdersError("service_unavailable", "Unable to refund order.");
  return { order: toOrder(result.order), grantStatus: result.grant_status || "cancelled", payment: result.payment || null };
}

export async function readCreatorLedger(params: { fetcher: OrdersFetcher; userId: string; from?: string | null; to?: string | null }) {
  assertUser(params.userId); const filters = [`creator_id=eq.${encodeURIComponent(params.userId)}`];
  if (params.from) filters.push(`created_at=gte.${encodeURIComponent(params.from)}`); if (params.to) filters.push(`created_at=lte.${encodeURIComponent(params.to)}`);
  const rows = await query<LedgerRow[]>(params.fetcher, `/rest/v1/storyflow_v2_ledger_entries?${filters.join("&")}&select=*&order=created_at.desc&limit=1000`);
  let grossIncomeCents = 0; let platformFeesCents = 0; let refundsCents = 0; let adjustmentsCents = 0;
  for (const row of rows || []) { if (row.status !== "posted") continue; if (row.entry_type === "income") grossIncomeCents += Math.max(0, row.amount_cents); else if (row.entry_type === "platform_fee") platformFeesCents += Math.max(0, row.amount_cents); else if (row.entry_type === "refund") refundsCents += Math.abs(Math.min(0, row.amount_cents)); else adjustmentsCents += row.amount_cents; }
  return { entries: (rows || []).map(toLedgerEntry), summary: { grossIncomeCents, platformFeesCents, refundsCents, adjustmentsCents, netIncomeCents: grossIncomeCents - platformFeesCents - refundsCents + adjustmentsCents }, manualSettlementNotice: MANUAL_SETTLEMENT_NOTICE };
}

export async function updateSettlement(params: { fetcher: OrdersFetcher; adminId: string; settlementId: string; input: { status: Exclude<SettlementStatus, "pending">; note?: string } }) {
  assertUser(params.adminId); if (!params.settlementId) throw new OrdersError("validation_failed", "Settlement id is required.");
  if (!["settled", "disputed"].includes(params.input.status)) throw new OrdersError("validation_failed", "Manual settlement can only move to settled or disputed.");
  const result = await query<{ settlement?: SettlementRow; id?: string; status?: SettlementStatus; manual_settlement?: boolean }>(params.fetcher, "/rpc/update_manual_settlement", { method: "POST", body: JSON.stringify({ p_settlement_id: params.settlementId, p_admin_id: params.adminId, p_status: params.input.status, p_note: params.input.note || null }) });
  const settlement = result?.settlement || result; if (!settlement?.id) throw new OrdersError("service_unavailable", "Unable to update settlement.");
  return { settlement: toSettlement(settlement as SettlementRow), manualSettlement: true, manualSettlementNotice: MANUAL_SETTLEMENT_NOTICE };
}

async function findPaymentId(fetcher: OrdersFetcher, orderId: string) { const rows = await query<Array<{ id: string }>>(fetcher, `/rest/v1/storyflow_v2_payments?order_id=eq.${encodeURIComponent(orderId)}&select=id&limit=1`); const id = rows?.[0]?.id; if (!id) throw new OrdersError("not_found", "Payment not found."); return id; }
function assertUser(userId: string) { if (!userId) throw new OrdersError("unauthenticated", "Authentication is required."); }
function assertPaymentStatus(value: string): asserts value is PaymentStatus { if (!["pending", "processing", "succeeded", "failed", "refunded", "cancelled"].includes(value)) throw new OrdersError("validation_failed", "Unsupported payment status."); }
function assertOrderStatus(value: string): asserts value is OrderStatus { if (!["pending", "paid", "failed", "refunded", "cancelled"].includes(value)) throw new OrdersError("validation_failed", "Unsupported order status."); }
function toOrder(row: OrderRow) { return { id: row.id, offerId: row.offer_id, grantId: row.grant_id, buyerId: row.buyer_id, sellerId: row.seller_id, assetId: row.asset_id, assetVersionId: row.asset_version_id, amountCents: row.amount_cents, currency: row.currency, licenseTerms: row.license_terms_snapshot || {}, paymentStatus: row.payment_status, orderStatus: row.order_status, createdAt: row.created_at, updatedAt: row.updated_at || null, manualSettlementNotice: MANUAL_SETTLEMENT_NOTICE }; }
function toLedgerEntry(row: LedgerRow) { return { id: row.id, orderId: row.order_id || null, paymentId: row.payment_id || null, entryType: row.entry_type, amountCents: row.amount_cents, currency: row.currency, status: row.status, description: row.description, createdAt: row.created_at }; }
function toSettlement(row: SettlementRow) { return { id: row.id, creatorId: row.creator_id, ledgerEntryId: row.ledger_entry_id || null, amountCents: row.amount_cents, currency: row.currency, status: row.status, settlementMethod: row.settlement_method || "manual", manualSettlementNotice: MANUAL_SETTLEMENT_NOTICE, handledBy: row.handled_by || null, settledAt: row.settled_at || null, disputeReason: row.dispute_reason || null }; }
async function query<T>(fetcher: OrdersFetcher, path: string, init?: RequestInit): Promise<T> { try { return await fetcher<T>(path, init); } catch (error) { if (error instanceof OrdersError) throw error; throw new OrdersError("service_unavailable", error instanceof Error ? error.message : "Orders service unavailable."); } }
