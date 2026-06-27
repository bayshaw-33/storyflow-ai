import { NextResponse } from "next/server";
import { getPlanEntitlement } from "@/lib/billing/plans";
import { TIERS, type TierDef } from "@/lib/pricing/tiers";
import { authenticateRequest } from "@/lib/supabase/server";

type CheckoutBody = {
  tierId?: TierDef["id"];
  annual?: boolean;
};

export async function POST(request: Request) {
  let body: CheckoutBody;

  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  const tier = TIERS.find((item) => item.id === body.tierId);
  if (!tier) {
    return NextResponse.json({ success: false, error: "Unknown tier." }, { status: 400 });
  }

  if (tier.planId === "free") {
    return NextResponse.json({ success: false, error: "Free tier does not require checkout." }, { status: 400 });
  }

  let user;
  try {
    user = await authenticateRequest(request);
  } catch {
    return NextResponse.json({ success: false, error: "Sign in before checkout." }, { status: 401 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = getStripePriceId(tier.id, Boolean(body.annual));
  if (!secretKey || !priceId) {
    return NextResponse.json(
      { success: false, code: "BILLING_NOT_CONFIGURED", error: "Stripe billing is not configured." },
      { status: 501 },
    );
  }

  const plan = getPlanEntitlement(tier.planId);
  const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || getVercelUrl();
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    client_reference_id: user.id,
    customer_email: user.email || "",
    success_url: `${origin}/subscription?checkout=success&tier=${tier.id}`,
    cancel_url: `${origin}/subscription?checkout=cancelled&tier=${tier.id}`,
    "metadata[userId]": user.id,
    "metadata[planId]": plan.id,
    "metadata[tierId]": tier.id,
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const payload = await response.json().catch(() => null) as { url?: string; error?: { message?: string } } | null;
  if (!response.ok || !payload?.url) {
    return NextResponse.json(
      { success: false, error: payload?.error?.message || "Stripe checkout failed." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, url: payload.url });
}

function getStripePriceId(tierId: TierDef["id"], annual: boolean) {
  if (tierId === "ELITE") return annual ? process.env.STRIPE_PRICE_ELITE_ANNUAL : process.env.STRIPE_PRICE_ELITE_MONTHLY;
  if (tierId === "PRO") return annual ? process.env.STRIPE_PRICE_PRO_ANNUAL : process.env.STRIPE_PRICE_PRO_MONTHLY;
  if (tierId === "ULTRA") return annual ? process.env.STRIPE_PRICE_ULTRA_ANNUAL : process.env.STRIPE_PRICE_ULTRA_MONTHLY;
  return "";
}

function getVercelUrl() {
  return process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
}
