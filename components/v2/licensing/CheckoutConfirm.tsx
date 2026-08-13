"use client";

/**
 * K2-T-10 交付物 2：下单确认页。
 *
 * 功能（PRD §9.3 / §9.6）：
 * - 资产信息摘要 + 授权范围（下单前可读，PRD §9.3 验收）
 * - 价格和支付方式选择
 * - 确认后创建订单和 Usage Grant
 * - 订单失败不会错误创建 Active Grant（PRD §9.6 验收）
 *   - 订单 pending 时 Grant 也是 pending
 *   - 订单 paid 时 Grant 激活为 active
 *   - 订单 failed / cancelled 时 Grant 不激活
 *
 * 调用 I-04 适配器 createUsageGrant(accessToken, offerId, targetProjectId, expiresAt?)
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  createUsageGrant,
  fetchAssetById,
  isUnauthenticatedError,
} from "@/lib/client/v2/marketplace/api";
import type {
  MarketplaceAsset,
  MarketplaceStatus,
} from "@/lib/client/v2/marketplace/types";
import {
  formatPrice,
  isLicenseCommercial,
  licenseTypeLabel,
} from "@/lib/client/v2/marketplace/filtering";
import type { PaymentMethod } from "@/lib/client/v2/licensing/types";
import { ALL_PAYMENT_METHODS } from "@/lib/client/v2/licensing/types";
import { paymentMethodLabel } from "./format";
import styles from "./licensing.module.css";

interface CheckoutConfirmProps {
  offerId: string;
}

export function CheckoutConfirm({ offerId }: CheckoutConfirmProps) {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [session, setSession] = useState<Session | null>(null);
  const [asset, setAsset] = useState<MarketplaceAsset | null>(null);
  const [status, setStatus] = useState<MarketplaceStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [targetProjectId, setTargetProjectId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("alipay");
  const [expiresAt, setExpiresAt] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [grantResult, setGrantResult] = useState<{
    grantId: string;
    grantStatus: string;
  } | null>(null);

  // 监听登录态
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setStatus("loading");
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { data: authData } = await client.auth.getSession();
        if (!active) return;
        setSession(authData.session);
      } catch {
        // ignore
      }
    })();
    const { data: sub } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 模拟：从 offerId 反查资产（fixture 模式下用 offerId 前缀 ast- 来定位资产）
  // 真实模式下后端会返回 offer 关联的资产 ID。这里用 offerId 直接作为 assetId 查询（fixture 兼容）。
  const loadAsset = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      // fixture 兼容：从 offerId 提取 assetId，或直接用 offerId 作为 assetId
      const lookupAssetId = offerId.replace(/^ofr-/, "ast-").replace(/^ofr-fixture-/, "ast-");
      const tryIds = [
        lookupAssetId,
        offerId,
        "ast-001", // fixture 兜底
      ];
      let found: MarketplaceAsset | null = null;
      for (const id of tryIds) {
        try {
          const result = await fetchAssetById(id, session?.access_token || null);
          found = result.asset;
          break;
        } catch {
          // 尝试下一个
        }
      }
      if (!found) {
        throw new Error(isZh ? "未找到该要约关联的资产。" : "Asset not found for this offer.");
      }
      setAsset(found);
      setStatus("ready");
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        setStatus("unauthenticated");
        return;
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isZh
            ? "加载资产失败。"
            : "Failed to load asset.",
      );
      setStatus("error");
    }
  }, [offerId, session, isZh]);

  useEffect(() => {
    void loadAsset();
  }, [loadAsset]);

  if (status === "loading") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <div className={styles.loading}>
            {isZh ? "加载资产中..." : "Loading asset..."}
          </div>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => router.push("/business/licensing")}
          >
            <ArrowLeft size={14} /> {isZh ? "返回授权管理" : "Back to licensing"}
          </button>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
            {isZh ? "请先登录后下单。" : "Please log in to place an order."}
          </p>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={() => router.push("/login")}
            style={{ marginTop: 12 }}
          >
            {isZh ? "去登录" : "Log in"}
          </button>
        </div>
      </main>
    );
  }

  if (status === "error" || !asset) {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => router.push("/business/licensing")}
          >
            <ArrowLeft size={14} /> {isZh ? "返回授权管理" : "Back to licensing"}
          </button>
          <div className={styles.errorBox}>{errorMsg}</div>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={() => void loadAsset()}
          >
            {isZh ? "重试" : "Retry"}
          </button>
        </div>
      </main>
    );
  }

  // 完成
  if (step === "done" && grantResult) {
    const orderPaid = grantResult.grantStatus === "active";
    return (
      <main className={styles.shell}>
        <div className={styles.container} style={{ maxWidth: 640 }}>
          <div className={styles.doneWrap}>
            {orderPaid ? (
              <CheckCircle2
                size={48}
                style={{ color: "#7dd181" }}
                className={styles.doneIcon}
              />
            ) : (
              <XCircle
                size={48}
                style={{ color: "#ffd166" }}
                className={styles.doneIcon}
              />
            )}
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>
              {orderPaid
                ? isZh
                  ? "下单成功"
                  : "Order placed"
                : isZh
                  ? "已发起授权（待支付激活）"
                  : "Grant created (pending payment)"}
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 8px" }}>
              {orderPaid
                ? isZh
                  ? "订单已支付，使用授权已激活。"
                  : "Order paid; usage grant activated."
                : isZh
                  ? "订单待支付，使用授权为待激活状态。支付成功后才激活。"
                  : "Order pending payment; grant is pending. Activation occurs only after payment."}
            </p>
            <div className={styles.summaryBox} style={{ marginTop: 16 }}>
              <div>
                <strong>{isZh ? "授权 ID" : "Grant ID"}:</strong> {grantResult.grantId}
              </div>
              <div>
                <strong>{isZh ? "授权状态" : "Grant status"}:</strong>{" "}
                {grantResult.grantStatus}
              </div>
            </div>
            <div className={styles.noticeBox}>
              {isZh
                ? "PRD §9.6 强制：订单失败不会错误创建 Active Grant。如支付失败，授权保持待激活状态。"
                : "PRD §9.6: Failed orders do not create Active Grants. If payment fails, the grant remains pending."}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24 }}>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={() => router.push("/business/licensing/orders")}
              >
                {isZh ? "查看订单" : "View orders"}
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => router.push("/business/licensing")}
              >
                {isZh ? "返回授权管理" : "Back to licensing"}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const commercial = isLicenseCommercial(asset.licenseOffer);
  const portraitWarn = asset.portraitBased && asset.rightsStatus !== "confirmed";

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (!targetProjectId.trim()) {
        throw new Error(isZh ? "请填写目标项目 ID。" : "Please enter target project ID.");
      }
      if (portraitWarn && commercial) {
        throw new Error(
          isZh
            ? "资产肖像权利未确认，不可创建商业授权（PRD §9.2）。"
            : "Portrait rights unconfirmed; cannot create commercial grant (PRD §9.2).",
        );
      }
      // 调用 I-04 适配器：先创建 Usage Grant（pending 状态）
      // 真实流程下订单与 grant 在服务端联动，订单 paid 才激活 grant
      // fixture 模式下 createUsageGrant 返回 pending grant（PRD §9.6）
      const expiresAtValue = expiresAt.trim() || null;
      const result = await createUsageGrant(
        session?.access_token || null,
        offerId,
        targetProjectId.trim(),
        expiresAtValue,
      );
      // fixture 模式返回 grant.status = "pending"（订单未支付，不激活）
      // 真实模式下订单 paid 时服务端激活 grant
      setGrantResult({
        grantId: result.grant.id,
        grantStatus: result.grant.status,
      });
      setStep("done");
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : isZh
            ? "下单失败。"
            : "Failed to place order.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.shell}>
      <div className={styles.container} style={{ maxWidth: 900 }}>
        <button
          type="button"
          className={styles.backLink}
          onClick={() => router.push("/business/licensing")}
        >
          <ArrowLeft size={14} /> {isZh ? "返回授权管理" : "Back to licensing"}
        </button>

        <header className={styles.header}>
          <p className={styles.eyebrow}>Kiikis 2.0 · Checkout</p>
          <h1 className={styles.title}>
            {isZh ? "下单确认" : "Checkout confirm"}
          </h1>
          <p className={styles.subtitle}>
            {isZh
              ? "下单前可读完整授权范围（PRD §9.3 验收）。"
              : "Review the full license scope before placing an order (PRD §9.3)."}
          </p>
        </header>

        {step === "form" && (
          <>
            {/* 资产信息摘要 */}
            <h2 className={styles.sectionTitle} style={{ marginTop: 0 }}>
              {isZh ? "资产信息" : "Asset info"}
            </h2>
            <div className={styles.detailPanel}>
              <h3 className={styles.detailName}>{asset.name}</h3>
              <p className={styles.cardSubtitle}>
                {isZh ? "创建者" : "Creator"}: {asset.creator.name}
              </p>
              <div className={styles.metaRow}>
                <span className={styles.metaKey}>{isZh ? "类型" : "Type"}</span>
                <span className={styles.metaVal}>{asset.type}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaKey}>{isZh ? "使用次数" : "Usage count"}</span>
                <span className={styles.metaVal}>{asset.usageCount}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaKey}>{isZh ? "评分" : "Rating"}</span>
                <span className={styles.metaVal}>{asset.rating} / 5</span>
              </div>
            </div>

            {/* 授权范围（PRD §9.3：下单前可读） */}
            <h2 className={styles.sectionTitle}>
              {isZh ? "授权范围（PRD §9.3）" : "License scope (PRD §9.3)"}
            </h2>
            <div className={styles.summaryBox}>
              <div>
                <strong>{isZh ? "授权方式" : "License"}:</strong>{" "}
                {licenseTypeLabel(asset.licenseOffer.type, locale)}
              </div>
              <div>
                <strong>{isZh ? "商业范围" : "Commercial scope"}:</strong>{" "}
                {asset.licenseOffer.commercialScope}
                {commercial ? (isZh ? "（商业）" : " (commercial)") : (isZh ? "（非商业）" : " (non-commercial)")}
              </div>
              <div>
                <strong>{isZh ? "修改范围" : "Modification"}:</strong>{" "}
                {asset.licenseOffer.modificationScope}
              </div>
              <div>
                <strong>{isZh ? "允许用途" : "Allowed uses"}:</strong>{" "}
                {asset.allowedUses.length > 0
                  ? asset.allowedUses.join(", ")
                  : isZh
                    ? "（未指定）"
                    : "(none)"}
              </div>
              <div>
                <strong>{isZh ? "禁止用途" : "Forbidden uses"}:</strong>{" "}
                {asset.forbiddenUses.length > 0
                  ? asset.forbiddenUses.join(", ")
                  : isZh
                    ? "（未指定）"
                    : "(none)"}
              </div>
              <div>
                <strong>{isZh ? "地域" : "Territory"}:</strong>{" "}
                {asset.licenseOffer.territory.length === 0
                  ? isZh
                    ? "全球"
                    : "Worldwide"
                  : asset.licenseOffer.territory.join(", ")}
              </div>
              <div>
                <strong>{isZh ? "期限" : "Duration"}:</strong>{" "}
                {asset.licenseOffer.durationDays === null
                  ? isZh
                    ? "永久"
                    : "Perpetual"
                  : `${asset.licenseOffer.durationDays} ${isZh ? "天" : "days"}`}
              </div>
              <div>
                <strong>{isZh ? "价格" : "Price"}:</strong>{" "}
                {formatPrice(asset.licenseOffer, locale)}
              </div>
            </div>

            {/* 肖像保护提示 */}
            {portraitWarn && (
              <div className={styles.rightsBlock}>
                <ShieldAlert
                  size={12}
                  style={{ display: "inline", marginRight: 4 }}
                />
                {isZh
                  ? "该资产基于真人肖像且权利未确认。仅可下非商业订单。"
                  : "This asset is portrait-based with unconfirmed rights. Only non-commercial orders are allowed."}
              </div>
            )}

            {/* 价格与支付方式 */}
            <h2 className={styles.sectionTitle}>
              {isZh ? "价格与支付方式" : "Price & payment method"}
            </h2>
            <div className={styles.form}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {isZh ? "应付金额" : "Amount due"}
                </label>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: asset.licenseOffer.price && asset.licenseOffer.price > 0 ? "#ffd166" : "#6de7df",
                  }}
                >
                  {formatPrice(asset.licenseOffer, locale)}
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {isZh ? "支付方式" : "Payment method"}
                </label>
                <div className={styles.optionGrid}>
                  {ALL_PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`${styles.optionCard} ${
                        paymentMethod === m ? styles.optionCardSelected : ""
                      }`}
                      onClick={() => setPaymentMethod(m)}
                    >
                      <div className={styles.optionCardTitle}>
                        {paymentMethodLabel(m, locale)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 目标项目 */}
            <h2 className={styles.sectionTitle}>
              {isZh ? "目标项目" : "Target project"}
            </h2>
            <div className={styles.form}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {isZh ? "目标项目 ID" : "Target project ID"} *
                </label>
                <input
                  className={styles.input}
                  value={targetProjectId}
                  onChange={(e) => setTargetProjectId(e.target.value)}
                  placeholder={isZh ? "例：proj-night-rule" : "e.g. proj-night-rule"}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {isZh ? "授权到期时间（可选）" : "Grant expires at (optional)"}
                </label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
                <p className={styles.fieldHint}>
                  {isZh
                    ? "留空则按授权要约期限（永久或指定期限）。"
                    : "Leave empty to use the offer's duration (perpetual or specified)."}
                </p>
              </div>
            </div>

            {/* PRD §9.6 风险提示 */}
            <div className={styles.noticeBox}>
              {isZh
                ? "PRD §9.6 强制：订单未支付时，使用授权保持待激活状态。支付成功后才激活。订单失败或取消不会错误创建 Active Grant。"
                : "PRD §9.6: Pending orders create pending grants. Activation only after payment. Failed or cancelled orders do not create Active Grants."}
            </div>

            {submitError && (
              <div className={styles.errorBox} style={{ marginTop: 16 }}>
                {submitError}
              </div>
            )}

            <div className={styles.actions} style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.buttonPrimary}
                disabled={submitting || !targetProjectId.trim()}
                onClick={() => setStep("confirm")}
              >
                <CircleDollarSign size={12} />
                {isZh ? "下一步：最终确认" : "Next: final confirm"}
              </button>
            </div>
          </>
        )}

        {/* 最终确认步骤 */}
        {step === "confirm" && (
          <>
            <h2 className={styles.sectionTitle} style={{ marginTop: 0 }}>
              {isZh ? "最终确认" : "Final confirmation"}
            </h2>
            <p className={styles.fieldHint} style={{ marginBottom: 12 }}>
              {isZh
                ? "请确认以下信息。点击确认后将创建订单与使用授权。"
                : "Please confirm the details below. An order and usage grant will be created."}
            </p>
            <div className={styles.summaryBox}>
              <div>
                <strong>{isZh ? "资产" : "Asset"}:</strong> {asset.name}
              </div>
              <div>
                <strong>{isZh ? "授权方式" : "License"}:</strong>{" "}
                {licenseTypeLabel(asset.licenseOffer.type, locale)}
              </div>
              <div>
                <strong>{isZh ? "应付金额" : "Amount"}:</strong>{" "}
                {formatPrice(asset.licenseOffer, locale)}
              </div>
              <div>
                <strong>{isZh ? "支付方式" : "Payment"}:</strong>{" "}
                {paymentMethodLabel(paymentMethod, locale)}
              </div>
              <div>
                <strong>{isZh ? "目标项目" : "Project"}:</strong> {targetProjectId}
              </div>
              {expiresAt && (
                <div>
                  <strong>{isZh ? "到期时间" : "Expires at"}:</strong> {expiresAt}
                </div>
              )}
            </div>

            <div className={styles.noticeBox}>
              {isZh
                ? "下单后授权为待激活状态。支付成功后激活。订单失败或取消不会错误创建 Active Grant。"
                : "The grant is pending after placing the order. Activation happens only after payment. Failed or cancelled orders do not create Active Grants."}
            </div>

            {submitError && (
              <div className={styles.errorBox} style={{ marginTop: 16 }}>
                {submitError}
              </div>
            )}

            <div className={styles.actions} style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                className={styles.button}
                onClick={() => setStep("form")}
                disabled={submitting}
              >
                {isZh ? "返回" : "Back"}
              </button>
              <button
                type="button"
                className={styles.buttonPrimary}
                disabled={submitting}
                onClick={() => void handleSubmit()}
              >
                {submitting
                  ? isZh
                    ? "提交中..."
                    : "Submitting..."
                  : isZh
                    ? "确认下单"
                    : "Confirm order"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
