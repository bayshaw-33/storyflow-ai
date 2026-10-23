"use client";

import { useEffect, useState } from "react";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/client/with-timeout";
import { useI18n } from "@/lib/i18n/useI18n";
import type { Subscription } from "@/lib/contracts/v2/billing";

export function BillingSummary() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    setReady(false);
    setError("");
    const client = getSupabaseBrowserClient();
    if (!client) { setReady(true); return; }
    let active = true;
    void withTimeout(client.auth.getSession(), 10_000).then(({ data }) => {
      if (active) { setToken(data.session?.access_token ?? null); setReady(true); }
    }).catch(() => { if (active) { setError(isZh ? "会话读取失败，请刷新重试。" : "Unable to read session. Please refresh."); setLoading(false); } });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (active) { setToken(session?.access_token ?? null); setReady(true); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [isZh, reload]);

  useEffect(() => {
    if (!ready) return;
    if (!token) { setLoading(false); setSubscription(null); return; }
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const response = await fetchWithAuthRetry("/api/v2/billing/subscription", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error();
        if (active) setSubscription(payload.subscription ?? null);
      } catch {
        if (active) setError(isZh ? "账单服务暂时不可用，请重试。" : "Billing is temporarily unavailable. Please retry.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [ready, token, reload, isZh]);

  async function openPortal() {
    setOpening(true);
    setError("");
    try {
      const response = await fetchWithAuthRetry("/api/v2/billing/portal", { method: "POST", body: "{}", signal: AbortSignal.timeout(12_000) });
      const payload = await response.json();
      const url = new URL(payload.session?.url || "");
      if (!response.ok || !payload.success || url.protocol !== "https:" || url.hostname !== "billing.stripe.com") throw new Error();
      window.location.assign(url.href);
    } catch {
      setError(isZh ? "账单入口暂时不可用，请稍后重试。" : "Unable to open billing. Please retry later.");
    } finally { setOpening(false); }
  }

  return <section className="settings-card" aria-label={isZh ? "账单与订阅" : "Billing and subscription"} style={{ maxWidth: 1000, margin: "24px auto" }}>
    <h2>{isZh ? "账单与订阅" : "Billing and subscription"}</h2>
    {loading ? <p role="status">{isZh ? "正在读取订阅记录…" : "Loading subscription…"}</p> : null}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>{isZh ? "重试" : "Retry"}</button></p> : null}
    {!loading && !error && !token ? <p>{isZh ? "登录后可查看订阅及账单。" : "Sign in to view your subscription and billing."}</p> : null}
    {!loading && !error && token && !subscription ? <p>{isZh ? "当前账号未关联付费订阅，暂无订阅账单。套餐权益以当前档位为准。" : "No paid subscription is linked to this account. Your current account tier still determines access."}</p> : null}
    {!loading && !error && subscription ? <>
      <p>{isZh ? "已关联付费订阅。账单、付款记录及订阅管理在 Stripe 中查看。" : "A paid subscription is linked. View invoices, payment history and subscription settings in Stripe."}</p>
      {subscription.currentPeriodEnd ? <p>{isZh ? "本期截止：" : "Current period ends: "}{new Date(subscription.currentPeriodEnd).toLocaleString(locale)}</p> : null}
      <button type="button" className="secondary-button" disabled={opening} onClick={() => void openPortal()}>{opening ? (isZh ? "正在打开…" : "Opening…") : (isZh ? "查看账单与管理订阅" : "View billing and manage subscription")}</button>
    </> : null}
  </section>;
}
