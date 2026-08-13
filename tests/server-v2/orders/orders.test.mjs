import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const {
  OrdersError,
  createOrder,
  listOrders,
  readOrder,
  updateOrderPayment,
  refundOrder,
  readCreatorLedger,
  updateSettlement,
} = await import("../../../lib/server/v2/orders/index.ts");
const { EvidenceError, createEvidenceEvent, listEvidenceEvents } = await import("../../../lib/server/v2/evidence/index.ts");

const offer = {
  id: "offer-1",
  asset_id: "asset-1",
  asset_version_id: "version-1",
  owner_id: "creator-1",
  terms: { commercial: true, scope: "single_project" },
  price_cents: 1999,
  currency: "USD",
  status: "active",
};
const grant = {
  id: "grant-1",
  offer_id: "offer-1",
  asset_id: "asset-1",
  asset_version_id: "version-1",
  licensor_id: "creator-1",
  licensee_id: "buyer-1",
  target_project_id: "project-1",
  status: "pending",
};
const order = {
  id: "order-1",
  offer_id: "offer-1",
  grant_id: "grant-1",
  buyer_id: "buyer-1",
  seller_id: "creator-1",
  asset_id: "asset-1",
  asset_version_id: "version-1",
  amount_cents: 1999,
  currency: "USD",
  license_terms_snapshot: offer.terms,
  payment_status: "pending",
  order_status: "pending",
  created_at: "2026-08-13T00:00:00Z",
};

function createFetcher(overrides = {}) {
  const calls = [];
  const fetcher = async (path, init = {}) => {
    calls.push({ path, init });
    for (const [needle, value] of Object.entries(overrides)) {
      if (path.includes(needle)) return typeof value === "function" ? value(path, init) : value;
    }
    if (path.includes("storyflow_v2_license_offers")) return [offer];
    if (path.includes("storyflow_v2_usage_grants")) return [grant];
    if (path.includes("storyflow_v2_orders") && init.method === "POST") return [order];
    if (path.includes("storyflow_v2_orders")) return [order];
    if (path.includes("storyflow_v2_ledger_entries")) return [{ id: "entry-1", entry_type: "income", amount_cents: 1999, currency: "USD", status: "posted", created_at: order.created_at }];
    if (path.includes("storyflow_v2_settlements")) return [{ id: "settlement-1", creator_id: "creator-1", amount_cents: 1799, currency: "USD", status: "pending" }];
    if (path.includes("storyflow_v2_evidence_events")) return [{ id: "event-1", event_type: "asset_published", subject_type: "asset", subject_id: "asset-1", occurred_at: order.created_at, summary: "Published", facts: { status: "published" } }];
    throw new Error(`unexpected query: ${path}`);
  };
  fetcher.calls = calls;
  return fetcher;
}

test("createOrder snapshots the active offer and links the pending grant", async () => {
  const fetcher = createFetcher({ storyflow_v2_orders: [{ ...order, id: "order-new" }] });
  const result = await createOrder({ fetcher, userId: "buyer-1", input: { offerId: "offer-1", grantId: "grant-1" } });
  assert.equal(result.order.id, "order-new");
  const insert = fetcher.calls.find(({ path, init }) => path.endsWith("storyflow_v2_orders") && init.method === "POST");
  assert.match(insert.init.body, /"offer_id":"offer-1"/);
  assert.match(insert.init.body, /"license_terms_snapshot"/);
});

test("order payment cannot be marked succeeded by an untrusted client", async () => {
  const fetcher = createFetcher();
  await assert.rejects(updateOrderPayment({ fetcher, userId: "buyer-1", orderId: "order-1", input: { status: "succeeded" } }), (error) => error instanceof OrdersError && error.code === "forbidden");
  assert.equal(fetcher.calls.some(({ path }) => path.includes("confirm_order_payment")), false);
});

test("trusted payment confirmation activates the grant in the transaction RPC", async () => {
  const fetcher = createFetcher({ "/rpc/confirm_order_payment": { order: { ...order, payment_status: "succeeded", order_status: "paid" }, grant_status: "active" } });
  const result = await updateOrderPayment({ fetcher, userId: "buyer-1", orderId: "order-1", paymentId: "payment-1", input: { status: "succeeded", providerReference: "provider-1" }, trustedConfirmation: true });
  assert.equal(result.order.paymentStatus, "succeeded");
  assert.equal(result.grantStatus, "active");
  assert.match(fetcher.calls.find(({ path }) => path.includes("confirm_order_payment")).init.body, /provider-1/);
});

test("failed payment leaves the Usage Grant pending", async () => {
  const fetcher = createFetcher({ "/rpc/fail_order_payment": { order: { ...order, payment_status: "failed", order_status: "failed" }, grant_status: "pending" } });
  const result = await updateOrderPayment({ fetcher, userId: "buyer-1", orderId: "order-1", paymentId: "payment-1", input: { status: "failed", failureReason: "declined" } });
  assert.equal(result.order.paymentStatus, "failed");
  assert.equal(result.grantStatus, "pending");
  assert.equal(fetcher.calls.some(({ path }) => path.includes("confirm_order_payment")), false);
});

test("refund uses an explicit cancellation/refund transition", async () => {
  const fetcher = createFetcher({ "/rpc/refund_order": { order: { ...order, payment_status: "refunded", order_status: "refunded" }, grant_status: "cancelled" } });
  const result = await refundOrder({ fetcher, userId: "buyer-1", orderId: "order-1", reason: "buyer request" });
  assert.equal(result.order.paymentStatus, "refunded");
  assert.equal(result.grantStatus, "cancelled");
  assert.match(fetcher.calls.find(({ path }) => path.includes("refund_order")).init.body, /buyer request/);
});

test("orders can be listed and read for either buyer or seller", async () => {
  const fetcher = createFetcher();
  assert.equal((await listOrders({ fetcher, userId: "creator-1" })).items.length, 1);
  assert.equal((await readOrder({ fetcher, userId: "buyer-1", orderId: "order-1" })).order.id, "order-1");
  assert.match(fetcher.calls[0].path, /buyer_id\.eq\.creator-1/);
});

test("creator ledger returns gross income, platform fees, refunds, and net with manual settlement notice", async () => {
  const fetcher = createFetcher({ storyflow_v2_ledger_entries: [
    { id: "income", entry_type: "income", amount_cents: 1999, currency: "USD", status: "posted", created_at: order.created_at },
    { id: "fee", entry_type: "platform_fee", amount_cents: 200, currency: "USD", status: "posted", created_at: order.created_at },
    { id: "refund", entry_type: "refund", amount_cents: -500, currency: "USD", status: "posted", created_at: order.created_at },
  ] });
  const result = await readCreatorLedger({ fetcher, userId: "creator-1" });
  assert.equal(result.summary.grossIncomeCents, 1999);
  assert.equal(result.summary.platformFeesCents, 200);
  assert.equal(result.summary.refundsCents, 500);
  assert.equal(result.summary.netIncomeCents, 1299);
  assert.equal(result.manualSettlementNotice, "manual_settlement_required");
});

test("settlement accepts only the manual Pending, Settled, Disputed state flow", async () => {
  const fetcher = createFetcher({ "/rpc/update_manual_settlement": { id: "settlement-1", status: "settled", manual_settlement: true } });
  const result = await updateSettlement({ fetcher, adminId: "admin-1", settlementId: "settlement-1", input: { status: "settled", note: "Bank transfer recorded" } });
  assert.equal(result.settlement.status, "settled");
  assert.equal(result.manualSettlement, true);
  await assert.rejects(updateSettlement({ fetcher, adminId: "admin-1", settlementId: "settlement-1", input: { status: "pending" } }), (error) => error instanceof OrdersError && error.code === "validation_failed");
});

test("evidence records facts and explicitly avoids legal adjudication", async () => {
  const fetcher = createFetcher();
  const result = await createEvidenceEvent({ fetcher, userId: "creator-1", input: { eventType: "asset_published", subjectType: "asset", subjectId: "asset-1", summary: "Published", facts: { status: "published" } } });
  assert.equal(result.event.eventType, "asset_published");
  assert.match(result.disclaimer, /do not constitute legal determinations/i);
  assert.match(fetcher.calls.find(({ path, init }) => path.endsWith("storyflow_v2_evidence_events") && init.method === "POST").init.body, /"facts"/);
  await assert.rejects(createEvidenceEvent({ fetcher, userId: "creator-1", input: { eventType: "not_a_contract_event", subjectType: "asset", subjectId: "asset-1" } }), (error) => error instanceof EvidenceError && error.code === "validation_failed");
  await assert.rejects(createEvidenceEvent({ fetcher, userId: "creator-1", input: { eventType: "asset_published", subjectType: "asset", subjectId: "asset-1", facts: { legal_decision: "approved" } } }), (error) => error instanceof EvidenceError && error.code === "validation_failed");
});

test("evidence queries support asset, project, and time filters", async () => {
  const fetcher = createFetcher();
  const result = await listEvidenceEvents({ fetcher, userId: "creator-1", filters: { assetId: "asset-1", projectId: "project-1", from: "2026-08-01T00:00:00Z", to: "2026-08-31T00:00:00Z" } });
  assert.equal(result.items.length, 1);
  assert.match(fetcher.calls[0].path, /asset_id=eq\.asset-1/);
  assert.match(fetcher.calls[0].path, /project_id=eq\.project-1/);
  assert.match(fetcher.calls[0].path, /occurred_at=gte/);
  assert.match(fetcher.calls[0].path, /occurred_at=lte/);
});

test("C-09 migration defines reconciliable orders, payments, ledger, settlements, and append-only evidence", async () => {
  const sql = await readFile(new URL("../../../supabase/migrations/20260813020000_K2-C-09_orders_ledger_evidence.sql", import.meta.url), "utf8");
  for (const table of ["storyflow_v2_orders", "storyflow_v2_payments", "storyflow_v2_ledger_entries", "storyflow_v2_settlements", "storyflow_v2_evidence_events"]) assert.match(sql, new RegExp(table));
  for (const fn of ["confirm_order_payment", "fail_order_payment", "refund_order", "update_manual_settlement"]) assert.match(sql, new RegExp(fn));
  for (const status of ["pending", "processing", "succeeded", "failed", "refunded", "cancelled"]) assert.match(sql, new RegExp(status));
  assert.match(sql, /manual_settlement_required/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.confirm_order_payment/);
  assert.match(sql, /Evidence records facts and does not make legal determinations/i);
  assert.doesNotMatch(sql, /automatic.*cross-border.*payout/i);
});
