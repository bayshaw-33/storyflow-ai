"use client";

/**
 * K2-T-10 交付物 1：License Offer 编辑器。
 *
 * 功能（PRD §9.2 / §9.3）：
 * - 选择授权模板（6 种：平台内免费 / 非商业 / 单项目商业 / 指定期限 / 团队内部 / 定制申请）
 * - 设定允许用途、禁止用途、可见范围、商业条件（价格 / 期限 / 地域）
 * - 预览授权摘要（用户确认前可看到完整条款，PRD §9.3 验收）
 * - 调用 I-04 适配器 createLicenseOffer(accessToken, assetId, input)
 *
 * 肖像保护（PRD §9.2 强制）：
 * - 资产 rightsStatus 非 confirmed 时禁用提交并显示提示
 * - 商业模板对未确认肖像资产不可选
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  ShieldAlert,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  fetchAssetById,
  isUnauthenticatedError,
  createLicenseOffer,
} from "@/lib/client/v2/marketplace/api";
import type {
  MarketplaceAsset,
  MarketplaceStatus,
} from "@/lib/client/v2/marketplace/types";
import {
  LICENSE_TYPE_TO_COMMERCIAL_SCOPE,
  isLicenseCommercial,
  formatPrice,
} from "@/lib/client/v2/marketplace/filtering";
import type {
  CodexLicenseTemplate,
  CommercialScope,
  CreateLicenseOfferInput,
  LicenseType,
  ModificationScope,
  Visibility,
} from "@/lib/client/v2/marketplace/types";
import styles from "./licensing.module.css";

// 6 种授权模板的中英文标签与说明
const LICENSE_TEMPLATES: ReadonlyArray<{
  type: LicenseType;
  codexTemplate: CodexLicenseTemplate;
  zh: string;
  en: string;
  zhDesc: string;
  enDesc: string;
  paid: boolean;
}> = [
  {
    type: "free",
    codexTemplate: "platform_free",
    zh: "平台内免费",
    en: "Platform free",
    zhDesc: "在 Kiikis 平台内免费使用，不限制项目数。",
    enDesc: "Free use within Kiikis platform, unlimited projects.",
    paid: false,
  },
  {
    type: "non_commercial",
    codexTemplate: "non_commercial",
    zh: "非商业",
    en: "Non-commercial",
    zhDesc: "仅允许非商业用途，可用于学习与个人创作。",
    enDesc: "Non-commercial use only, for learning and personal creation.",
    paid: false,
  },
  {
    type: "single_project_commercial",
    codexTemplate: "single_project",
    zh: "单项目商业",
    en: "Single-project commercial",
    zhDesc: "授权给单个项目商业使用，需指定价格与项目。",
    enDesc: "Commercial license for a single project; price and project required.",
    paid: true,
  },
  {
    type: "time_limited",
    codexTemplate: "commercial",
    zh: "指定期限",
    en: "Time-limited",
    zhDesc: "在指定期限内可商业使用，到期自动失效。",
    enDesc: "Commercial use within a specified period; expires automatically.",
    paid: true,
  },
  {
    type: "team_internal",
    codexTemplate: "team_internal",
    zh: "团队内部",
    en: "Team internal",
    zhDesc: "仅团队内部可见和使用，不可对外授权。",
    enDesc: "Visible and usable within the team only; cannot be re-licensed.",
    paid: false,
  },
  {
    type: "custom",
    codexTemplate: "custom",
    zh: "定制申请",
    en: "Custom application",
    zhDesc: "用户提交定制申请，由创建者审核后授权。",
    enDesc: "User submits custom request; creator reviews and grants.",
    paid: false,
  },
];

interface LicenseOfferEditorProps {
  assetId: string;
}

interface EditorForm {
  template: LicenseType | null;
  allowedUses: string;
  forbiddenUses: string;
  visibility: Visibility;
  modificationScope: ModificationScope;
  territory: string;
  durationDays: string;
  price: string;
  currency: string;
}

const INITIAL_FORM: EditorForm = {
  template: null,
  allowedUses: "",
  forbiddenUses: "",
  visibility: "private",
  modificationScope: "not_allowed",
  territory: "",
  durationDays: "",
  price: "",
  currency: "CNY",
};

export function LicenseOfferEditor({ assetId }: LicenseOfferEditorProps) {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [session, setSession] = useState<Session | null>(null);
  const [asset, setAsset] = useState<MarketplaceAsset | null>(null);
  const [status, setStatus] = useState<MarketplaceStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState<EditorForm>({ ...INITIAL_FORM });
  const [step, setStep] = useState<"edit" | "preview" | "done">("edit");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdOfferId, setCreatedOfferId] = useState<string | null>(null);

  // 监听登录态（fixture 模式下可预览，不强制登录）
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

  const loadAsset = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const result = await fetchAssetById(assetId, session?.access_token || null);
      setAsset(result.asset);
      setStatus("ready");
      // 预填充表单：从资产已有字段同步
      setForm((f) => ({
        ...f,
        allowedUses: result.asset.allowedUses.join(", "),
        forbiddenUses: result.asset.forbiddenUses.join(", "),
        visibility: result.asset.visibility,
      }));
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
  }, [assetId, session, isZh]);

  useEffect(() => {
    void loadAsset();
  }, [loadAsset]);

  // 肖像保护：未确认时禁用商业模板与提交
  const portraitBlocked = useMemo(() => {
    if (!asset) return false;
    return asset.portraitBased && asset.rightsStatus !== "confirmed";
  }, [asset]);

  const selectedTemplate = useMemo(
    () => LICENSE_TEMPLATES.find((t) => t.type === form.template) || null,
    [form.template],
  );

  const isPaidTemplate = selectedTemplate?.paid === true;

  // 商业条件对肖像未确认资产禁用
  const canSelectTemplate = (tpl: (typeof LICENSE_TEMPLATES)[number]): boolean => {
    if (portraitBlocked && tpl.paid) return false;
    return true;
  };

  // 提交按钮可用性
  const canSubmit = useMemo(() => {
    if (!asset) return false;
    if (portraitBlocked) return false;
    if (!form.template) return false;
    if (!form.allowedUses.trim()) return false;
    if (isPaidTemplate) {
      const priceNum = parseFloat(form.price);
      if (isNaN(priceNum) || priceNum <= 0) return false;
    }
    if (form.template === "time_limited") {
      const durNum = parseInt(form.durationDays, 10);
      if (isNaN(durNum) || durNum <= 0) return false;
    }
    return true;
  }, [asset, portraitBlocked, form, isPaidTemplate]);

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
            {isZh
              ? "请先登录后编辑授权要约。"
              : "Please log in to edit license offers."}
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
  if (step === "done") {
    return (
      <main className={styles.shell}>
        <div className={styles.container} style={{ maxWidth: 640 }}>
          <div className={styles.doneWrap}>
            <CheckCircle2 size={48} style={{ color: "#7dd181" }} className={styles.doneIcon} />
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>
              {isZh ? "授权要约已创建" : "License offer created"}
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 8px" }}>
              {isZh
                ? "用户可基于该要约下单并创建使用授权。"
                : "Users can place orders and create usage grants based on this offer."}
            </p>
            {createdOfferId && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "0 0 24px", wordBreak: "break-all" }}>
                {isZh ? "要约 ID" : "Offer ID"}: {createdOfferId}
              </p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={() => router.push("/business/licensing")}
              >
                {isZh ? "返回授权管理" : "Back to licensing"}
              </button>
              {createdOfferId && (
                <button
                  type="button"
                  className={styles.button}
                  onClick={() =>
                    router.push(`/business/licensing/checkout/${createdOfferId}`)
                  }
                >
                  {isZh ? "去下单页预览" : "Preview checkout"}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  // 构造提交参数（与 I-04 createLicenseOffer 输入对齐）
  const buildInput = (): CreateLicenseOfferInput => {
    if (!selectedTemplate) {
      throw new Error("未选择授权模板");
    }
    const scope: CommercialScope =
      LICENSE_TYPE_TO_COMMERCIAL_SCOPE[selectedTemplate.type];
    const territory = form.territory
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const durationDays =
      form.template === "time_limited"
        ? parseInt(form.durationDays, 10) || null
        : null;
    const priceCents = isPaidTemplate
      ? Math.round(parseFloat(form.price) * 100)
      : undefined;
    const currency = isPaidTemplate ? form.currency : undefined;

    return {
      assetVersionId: asset.mainVersion.id || "",
      template: selectedTemplate.codexTemplate,
      terms: {
        commercial: isLicenseCommercial({
          commercialScope: scope,
        } as never),
        scope,
        territory: territory.length > 0 ? territory : undefined,
        durationDays: durationDays ?? undefined,
        modificationAllowed: form.modificationScope !== "not_allowed",
      },
      priceCents,
      currency,
    };
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      // 肖像保护前置校验（防止 UI 状态被绕过）
      if (portraitBlocked) {
        throw new Error(
          isZh
            ? "资产肖像权利未确认，不可创建授权要约（PRD §9.2 强制）。"
            : "Portrait rights unconfirmed; cannot create license offer (PRD §9.2).",
        );
      }
      const input = buildInput();
      const result = await createLicenseOffer(
        session?.access_token || null,
        assetId,
        input,
      );
      setCreatedOfferId(result.offer.id);
      setStep("done");
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : isZh
            ? "创建授权要约失败。"
            : "Failed to create license offer.",
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
          <p className={styles.eyebrow}>Kiikis 2.0 · License Offer Editor</p>
          <h1 className={styles.title}>
            {isZh ? "编辑授权要约" : "Edit license offer"}
          </h1>
          <p className={styles.subtitle}>
            {isZh
              ? `为资产「${asset.name}」配置授权条款。`
              : `Configure license terms for asset "${asset.name}".`}
          </p>
        </header>

        {/* 肖像保护提示 */}
        {portraitBlocked && (
          <div className={styles.rightsBlock}>
            <ShieldAlert
              size={12}
              style={{ display: "inline", marginRight: 4 }}
            />
            {isZh
              ? "该资产基于真人肖像且权利未确认（PRD §9.2 强制）：不可创建授权要约。请先在资产详情页确认肖像授权状态。"
              : "This asset is portrait-based with unconfirmed rights (PRD §9.2): cannot create license offers. Please confirm portrait rights on the asset detail page first."}
          </div>
        )}

        {step === "edit" && (
          <>
            {/* 步骤 1：选择授权模板 */}
            <h2 className={styles.sectionTitle} style={{ marginTop: 0 }}>
              {isZh ? "步骤 1：选择授权模板" : "Step 1: Select license template"}
            </h2>
            <div className={styles.optionGrid}>
              {LICENSE_TEMPLATES.map((tpl) => {
                const disabled = !canSelectTemplate(tpl);
                return (
                  <button
                    key={tpl.type}
                    type="button"
                    disabled={disabled}
                    className={`${styles.optionCard} ${
                      form.template === tpl.type ? styles.optionCardSelected : ""
                    } ${tpl.paid ? styles.optionCardPaid : ""}`}
                    onClick={() => setForm((f) => ({ ...f, template: tpl.type }))}
                    style={
                      disabled
                        ? { opacity: 0.4, cursor: "not-allowed" }
                        : undefined
                    }
                    title={
                      disabled
                        ? isZh
                          ? "肖像未确认，不可选择商业模板"
                          : "Portrait unconfirmed; commercial templates unavailable"
                        : ""
                    }
                  >
                    <div className={styles.optionCardTitle}>
                      {isZh ? tpl.zh : tpl.en}
                    </div>
                    <div className={styles.optionCardDesc}>
                      {isZh ? tpl.zhDesc : tpl.enDesc}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: tpl.paid ? "#ffd166" : "#6de7df",
                        marginTop: 4,
                      }}
                    >
                      {tpl.paid
                        ? isZh
                          ? "付费"
                          : "Paid"
                        : isZh
                          ? "免费"
                          : "Free"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 步骤 2：用途与可见范围 */}
            <h2 className={styles.sectionTitle}>
              {isZh ? "步骤 2：用途与可见范围" : "Step 2: Use scope & visibility"}
            </h2>
            <div className={styles.form}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {isZh ? "允许用途（逗号分隔）" : "Allowed uses (comma separated)"} *
                </label>
                <textarea
                  className={styles.textarea}
                  value={form.allowedUses}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, allowedUses: e.target.value }))
                  }
                  placeholder={
                    isZh
                      ? "例：平台内项目, 短剧出演, 分镜预览"
                      : "e.g. platform project, drama, storyboard"
                  }
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {isZh ? "禁止用途（逗号分隔）" : "Forbidden uses (comma separated)"}
                </label>
                <textarea
                  className={styles.textarea}
                  value={form.forbiddenUses}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, forbiddenUses: e.target.value }))
                  }
                  placeholder={
                    isZh
                      ? "例：真人冒充, 政治敏感, 色情"
                      : "e.g. impersonation, political, adult"
                  }
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {isZh ? "可见范围" : "Visibility"}
                </label>
                <select
                  className={styles.select}
                  value={form.visibility}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      visibility: e.target.value as Visibility,
                    }))
                  }
                >
                  <option value="public">{isZh ? "公开" : "Public"}</option>
                  <option value="private">{isZh ? "私有" : "Private"}</option>
                  <option value="team">{isZh ? "团队" : "Team"}</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {isZh ? "修改范围" : "Modification scope"}
                </label>
                <select
                  className={styles.select}
                  value={form.modificationScope}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      modificationScope: e.target.value as ModificationScope,
                    }))
                  }
                >
                  <option value="allowed">{isZh ? "允许修改" : "Allowed"}</option>
                  <option value="not_allowed">
                    {isZh ? "禁止修改" : "Not allowed"}
                  </option>
                  <option value="with_attribution">
                    {isZh ? "允许但需署名" : "Allowed with attribution"}
                  </option>
                </select>
              </div>
            </div>

            {/* 步骤 3：商业条件（仅付费模板显示） */}
            {isPaidTemplate && (
              <>
                <h2 className={styles.sectionTitle}>
                  {isZh ? "步骤 3：商业条件" : "Step 3: Commercial terms"}
                </h2>
                <div className={styles.form}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      {isZh ? "价格（元）" : "Price (CNY)"} *
                    </label>
                    <input
                      className={styles.input}
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, price: e.target.value }))
                      }
                      placeholder="99.00"
                    />
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      {isZh ? "货币" : "Currency"}
                    </label>
                    <select
                      className={styles.select}
                      value={form.currency}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, currency: e.target.value }))
                      }
                    >
                      <option value="CNY">CNY</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                  {form.template === "time_limited" && (
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>
                        {isZh ? "期限（天）" : "Duration (days)"} *
                      </label>
                      <input
                        className={styles.input}
                        type="number"
                        min="1"
                        value={form.durationDays}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, durationDays: e.target.value }))
                        }
                        placeholder="90"
                      />
                    </div>
                  )}
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>
                      {isZh ? "地域限制（国家代码逗号分隔，留空为全球）" : "Territory (country codes, empty = worldwide)"}
                    </label>
                    <input
                      className={styles.input}
                      value={form.territory}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, territory: e.target.value }))
                      }
                      placeholder="CN, JP"
                    />
                  </div>
                </div>
              </>
            )}

            {submitError && (
              <div className={styles.errorBox} style={{ marginTop: 16 }}>
                {submitError}
              </div>
            )}

            <div className={styles.actions} style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.buttonPrimary}
                disabled={!canSubmit}
                onClick={() => setStep("preview")}
              >
                <Eye size={12} />
                {isZh ? "预览授权摘要" : "Preview summary"}
              </button>
            </div>
          </>
        )}

        {/* 步骤 4：预览授权摘要 */}
        {step === "preview" && selectedTemplate && (
          <>
            <h2 className={styles.sectionTitle} style={{ marginTop: 0 }}>
              {isZh ? "授权条款预览" : "License terms preview"}
            </h2>
            <p className={styles.fieldHint} style={{ marginBottom: 12 }}>
              {isZh
                ? "请仔细阅读以下条款，确认无误后再创建要约。用户下单前可读到这些条款（PRD §9.3 验收）。"
                : "Please review the terms below before creating the offer. Users will see these terms before placing an order (PRD §9.3)."}
            </p>
            <div className={styles.summaryBox}>
              <div>
                <strong>{isZh ? "资产" : "Asset"}:</strong> {asset.name}
              </div>
              <div>
                <strong>{isZh ? "授权模板" : "Template"}:</strong>{" "}
                {isZh ? selectedTemplate.zh : selectedTemplate.en}
              </div>
              <div>
                <strong>{isZh ? "商业范围" : "Commercial scope"}:</strong>{" "}
                {LICENSE_TYPE_TO_COMMERCIAL_SCOPE[selectedTemplate.type]}
              </div>
              <div>
                <strong>{isZh ? "修改范围" : "Modification"}:</strong>{" "}
                {form.modificationScope}
              </div>
              <div>
                <strong>{isZh ? "允许用途" : "Allowed uses"}:</strong>{" "}
                {form.allowedUses || (isZh ? "（未指定）" : "(none)")}
              </div>
              <div>
                <strong>{isZh ? "禁止用途" : "Forbidden uses"}:</strong>{" "}
                {form.forbiddenUses || (isZh ? "（未指定）" : "(none)")}
              </div>
              <div>
                <strong>{isZh ? "可见范围" : "Visibility"}:</strong>{" "}
                {form.visibility}
              </div>
              {isPaidTemplate && (
                <>
                  <div>
                    <strong>{isZh ? "价格" : "Price"}:</strong>{" "}
                    {formatPrice(
                      {
                        id: "preview",
                        type: selectedTemplate.type,
                        commercialScope:
                          LICENSE_TYPE_TO_COMMERCIAL_SCOPE[selectedTemplate.type],
                        modificationScope: form.modificationScope,
                        territory: [],
                        durationDays:
                          form.template === "time_limited"
                            ? parseInt(form.durationDays, 10) || null
                            : null,
                        price: Math.round(parseFloat(form.price) * 100) || null,
                        currency: form.currency,
                      },
                      locale,
                    )}
                  </div>
                  {form.template === "time_limited" && (
                    <div>
                      <strong>{isZh ? "期限" : "Duration"}:</strong>{" "}
                      {form.durationDays} {isZh ? "天" : "days"}
                    </div>
                  )}
                  {form.territory.trim() && (
                    <div>
                      <strong>{isZh ? "地域" : "Territory"}:</strong>{" "}
                      {form.territory}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 肖像保护再次确认 */}
            {asset.portraitBased && asset.rightsStatus === "confirmed" && (
              <div className={styles.warningBox}>
                <ShieldAlert
                  size={12}
                  style={{ display: "inline", marginRight: 4 }}
                />
                {isZh
                  ? "该资产基于真人肖像，权利已确认。请确保授权条款不超出肖像授权范围。"
                  : "This asset is portrait-based with confirmed rights. Ensure the license terms do not exceed the portrait authorization."}
              </div>
            )}

            {submitError && (
              <div className={styles.errorBox} style={{ marginTop: 16 }}>
                {submitError}
              </div>
            )}

            <div className={styles.actions} style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                className={styles.button}
                onClick={() => setStep("edit")}
                disabled={submitting}
              >
                {isZh ? "返回编辑" : "Back to edit"}
              </button>
              <button
                type="button"
                className={styles.buttonPrimary}
                disabled={portraitBlocked || submitting}
                onClick={() => void handleSubmit()}
              >
                <CircleDollarSign size={12} />
                {submitting
                  ? isZh
                    ? "提交中..."
                    : "Submitting..."
                  : isZh
                    ? "确认创建授权要约"
                    : "Confirm and create offer"}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
