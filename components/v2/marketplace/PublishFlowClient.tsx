"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { loadFixturePublishFlow } from "@/lib/client/v2/marketplace/fixtures";
import type {
  LicenseType,
  MarketplaceAssetType,
  Visibility,
  ModificationScope,
} from "@/lib/client/v2/marketplace/types";
import { LICENSE_TYPE_TO_COMMERCIAL_SCOPE } from "@/lib/client/v2/marketplace/filtering";
import styles from "./marketplace.module.css";

const STEPS_ZH = [
  "资产身份",
  "主版本",
  "资产说明",
  "用途设定",
  "可见范围",
  "授权方式",
  "权利声明",
];
const STEPS_EN = [
  "Identity",
  "Main version",
  "Description",
  "Use scope",
  "Visibility",
  "License",
  "Rights",
];

interface PublishForm {
  type: MarketplaceAssetType | null;
  versionMode: "upload" | "existing" | null;
  versionId: string;
  description: string;
  tags: string;
  allowedUses: string;
  forbiddenUses: string;
  visibility: Visibility | null;
  licenseType: LicenseType | null;
  price: string;
  modificationScope: ModificationScope;
  portraitBased: boolean;
  rightsStatus: "confirmed" | "unconfirmed" | "not_applicable";
}

const INITIAL_FORM: PublishForm = {
  type: null,
  versionMode: null,
  versionId: "",
  description: "",
  tags: "",
  allowedUses: "",
  forbiddenUses: "",
  visibility: null,
  licenseType: null,
  price: "",
  modificationScope: "allowed",
  portraitBased: false,
  rightsStatus: "not_applicable",
};

export function PublishFlowClient() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const steps = isZh ? STEPS_ZH : STEPS_EN;
  const publishFlow = useMemo(() => loadFixturePublishFlow(), []);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<PublishForm>({ ...INITIAL_FORM });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const validateStep = (currentStep: number): boolean => {
    setError(null);
    switch (currentStep) {
      case 0:
        if (!form.type) {
          setError(isZh ? "请选择资产类型" : "Please select asset type");
          return false;
        }
        return true;
      case 1:
        if (!form.versionMode) {
          setError(isZh ? "请选择主版本方式" : "Please select main version mode");
          return false;
        }
        if (form.versionMode === "existing" && !form.versionId.trim()) {
          setError(isZh ? "请填写已有版本 ID" : "Please enter existing version ID");
          return false;
        }
        return true;
      case 2:
        if (!form.description.trim()) {
          setError(isZh ? "请填写资产说明" : "Please enter description");
          return false;
        }
        return true;
      case 3:
        if (!form.allowedUses.trim()) {
          setError(isZh ? "请至少填写一个允许用途" : "Please enter at least one allowed use");
          return false;
        }
        return true;
      case 4:
        if (!form.visibility) {
          setError(isZh ? "请选择可见范围" : "Please select visibility");
          return false;
        }
        return true;
      case 5:
        if (!form.licenseType) {
          setError(isZh ? "请选择授权方式" : "Please select license type");
          return false;
        }
        return true;
      case 6: {
        // 权利声明：真人肖像需明确授权状态
        if (form.portraitBased && form.rightsStatus === "unconfirmed") {
          setError(
            isZh
              ? "真人肖像未确认授权，不得公开发布或商业授权。请先确认授权状态。"
              : "Portrait rights unconfirmed; cannot publish publicly or commercially.",
          );
          return false;
        }
        return true;
      }
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!validateStep(step)) return;
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      setDone(true);
    }
  };

  const handleBack = () => {
    setError(null);
    if (step > 0) setStep(step - 1);
  };

  const isPaidLicense = form.licenseType
    ? publishFlow.licenseTypes.find((l) => l.value === form.licenseType)?.paid
    : false;

  // 权利声明校验：真人肖像未确认时阻止公开/商业发布
  const rightsBlocked =
    form.portraitBased && form.rightsStatus === "unconfirmed" && (form.visibility === "public" || isPaidLicense);

  if (done) {
    return (
      <main className={styles.shell}>
        <div className={styles.container} style={{ maxWidth: 640 }}>
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <CheckCircle2 size={48} style={{ color: "#7dd181", marginBottom: 16 }} />
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>
              {isZh ? "资产已提交发布" : "Asset submitted for publish"}
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 24px" }}>
              {isZh
                ? "平台将审核资产与权利声明，通过后发布到市场。"
                : "The platform will review the asset and rights declaration before publishing."}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={() => router.push("/business/marketplace")}
              >
                {isZh ? "返回市场" : "Back to marketplace"}
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setForm({ ...INITIAL_FORM });
                  setStep(0);
                  setDone(false);
                }}
              >
                {isZh ? "再发布一个" : "Publish another"}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.container} style={{ maxWidth: 760 }}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Kiikis 2.0 · Publish</p>
          <h1 className={styles.title}>{isZh ? "发布资产到市场" : "Publish asset to marketplace"}</h1>
        </header>

        {/* 步骤条 */}
        <div className={styles.stepper}>
          {steps.map((label, i) => (
            <div
              key={label}
              className={`${styles.step} ${i === step ? styles.stepActive : ""} ${i < step ? styles.stepDone : ""}`}
            >
              <span className={styles.stepNum}>{i < step ? "✓" : i + 1}</span>
              {label}
            </div>
          ))}
        </div>

        <div className={styles.stepForm}>
          {/* 步骤 1：资产身份确认 */}
          {step === 0 && (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>
                {isZh ? "步骤 1：资产身份确认" : "Step 1: Asset identity"}
              </h2>
              <p className={styles.fieldHint} style={{ marginBottom: 14 }}>
                {isZh ? "选择资产类型，决定后续授权与可见性选项。" : "Select asset type."}
              </p>
              <div className={styles.optionGrid}>
                {publishFlow.assetTypes.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.optionCard} ${form.type === opt.value ? styles.optionCardSelected : ""}`}
                    onClick={() => setForm((f) => ({ ...f, type: opt.value }))}
                  >
                    {isZh ? opt.labelZh : opt.labelEn}
                  </button>
                ))}
              </div>
              {form.type === "ai_actor" && (
                <div className={styles.rightsDeclBox}>
                  <strong>{isZh ? "AI演员提示" : "AI actor note"}: </strong>
                  {isZh
                    ? "AI演员可能基于真人肖像，请在步骤 7 确认肖像授权状态。未确认授权不得公开发布或商业授权。"
                    : "AI actors may be portrait-based; confirm rights in step 7. Unconfirmed rights prohibit public or commercial release."}
                </div>
              )}
            </>
          )}

          {/* 步骤 2：主版本选择 */}
          {step === 1 && (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>
                {isZh ? "步骤 2：主版本选择" : "Step 2: Main version"}
              </h2>
              <p className={styles.fieldHint} style={{ marginBottom: 14 }}>
                {isZh ? "上传新版本或选择已有版本作为市场展示主版本。" : "Upload new or select existing version."}
              </p>
              <div className={styles.optionGrid}>
                <button
                  type="button"
                  className={`${styles.optionCard} ${form.versionMode === "upload" ? styles.optionCardSelected : ""}`}
                  onClick={() => setForm((f) => ({ ...f, versionMode: "upload" }))}
                >
                  {isZh ? "上传新版本" : "Upload new"}
                </button>
                <button
                  type="button"
                  className={`${styles.optionCard} ${form.versionMode === "existing" ? styles.optionCardSelected : ""}`}
                  onClick={() => setForm((f) => ({ ...f, versionMode: "existing" }))}
                >
                  {isZh ? "选择已有版本" : "Select existing"}
                </button>
              </div>
              {form.versionMode === "existing" && (
                <div className={styles.fieldGroup} style={{ marginTop: 14 }}>
                  <label className={styles.fieldLabel}>{isZh ? "已有版本 ID" : "Existing version ID"} *</label>
                  <input
                    className={styles.input}
                    value={form.versionId}
                    onChange={(e) => setForm((f) => ({ ...f, versionId: e.target.value }))}
                    placeholder="mv-xxxx"
                  />
                </div>
              )}
              {form.versionMode === "upload" && (
                <div className={styles.fieldGroup} style={{ marginTop: 14 }}>
                  <label className={styles.fieldLabel}>{isZh ? "上传文件" : "Upload file"}</label>
                  <input type="file" className={styles.input} disabled />
                  <p className={styles.fieldHint}>
                    {isZh ? "（Alpha 版本占位，实际上传由后端处理）" : "(Alpha placeholder; actual upload handled by backend)"}
                  </p>
                </div>
              )}
            </>
          )}

          {/* 步骤 3：说明填写 */}
          {step === 2 && (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>
                {isZh ? "步骤 3：资产说明" : "Step 3: Description"}
              </h2>
              <p className={styles.fieldHint} style={{ marginBottom: 14 }}>
                {isZh ? "填写资产说明与标签，便于用户搜索与理解用途。" : "Enter description and tags."}
              </p>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>{isZh ? "资产说明" : "Description"} *</label>
                <textarea
                  className={styles.textarea}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={isZh ? "描述资产的内容、风格、适用场景..." : "Describe content, style, applicable scenes..."}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>{isZh ? "标签（逗号分隔）" : "Tags (comma separated)"}</label>
                <input
                  className={styles.input}
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder={isZh ? "例：女性, 都市, 悬疑" : "e.g. female, urban, mystery"}
                />
              </div>
            </>
          )}

          {/* 步骤 4：用途设定 */}
          {step === 3 && (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>
                {isZh ? "步骤 4：用途设定" : "Step 4: Use scope"}
              </h2>
              <p className={styles.fieldHint} style={{ marginBottom: 14 }}>
                {isZh ? "明确允许与禁止的用途，避免授权争议。" : "Specify allowed and forbidden uses."}
              </p>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>{isZh ? "允许用途（逗号分隔）" : "Allowed uses (comma separated)"} *</label>
                <textarea
                  className={styles.textarea}
                  value={form.allowedUses}
                  onChange={(e) => setForm((f) => ({ ...f, allowedUses: e.target.value }))}
                  placeholder={isZh ? "例：平台内项目, 短剧出演, 分镜预览" : "e.g. platform project, drama, storyboard"}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>{isZh ? "禁止用途（逗号分隔）" : "Forbidden uses (comma separated)"}</label>
                <textarea
                  className={styles.textarea}
                  value={form.forbiddenUses}
                  onChange={(e) => setForm((f) => ({ ...f, forbiddenUses: e.target.value }))}
                  placeholder={isZh ? "例：真人冒充, 政治敏感, 色情" : "e.g. impersonation, political, adult"}
                />
              </div>
            </>
          )}

          {/* 步骤 5：可见范围 */}
          {step === 4 && (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>
                {isZh ? "步骤 5：可见范围" : "Step 5: Visibility"}
              </h2>
              <p className={styles.fieldHint} style={{ marginBottom: 14 }}>
                {isZh ? "公开资产将被所有用户可见；私有仅自己可见；团队限团队成员可见。" : "Public/Private/Team visibility."}
              </p>
              <div className={styles.optionGrid}>
                {publishFlow.visibilities.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.optionCard} ${form.visibility === opt.value ? styles.optionCardSelected : ""}`}
                    onClick={() => setForm((f) => ({ ...f, visibility: opt.value }))}
                  >
                    {isZh ? opt.labelZh : opt.labelEn}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 步骤 6：授权方式 */}
          {step === 5 && (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>
                {isZh ? "步骤 6：授权方式" : "Step 6: License"}
              </h2>
              <p className={styles.fieldHint} style={{ marginBottom: 14 }}>
                {isZh ? "选择授权模板。免费与付费授权将清晰区分展示。" : "Select license template. Free/paid clearly distinguished."}
              </p>
              <div className={styles.optionGrid}>
                {publishFlow.licenseTypes.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.optionCard} ${form.licenseType === opt.value ? styles.optionCardSelected : ""} ${opt.paid ? styles.optionCardPaid : ""}`}
                    onClick={() => setForm((f) => ({ ...f, licenseType: opt.value }))}
                  >
                    <div style={{ fontWeight: 700 }}>{isZh ? opt.labelZh : opt.labelEn}</div>
                    <div style={{ fontSize: 10, color: opt.paid ? "#ffd166" : "#6de7df", marginTop: 2 }}>
                      {opt.paid ? (isZh ? "付费" : "Paid") : (isZh ? "免费" : "Free")}
                    </div>
                  </button>
                ))}
              </div>
              {isPaidLicense && (
                <div className={styles.fieldGroup} style={{ marginTop: 14 }}>
                  <label className={styles.fieldLabel}>{isZh ? "价格（元）" : "Price (CNY)"}</label>
                  <input
                    className={styles.input}
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="99.00"
                  />
                </div>
              )}
              <div className={styles.fieldGroup} style={{ marginTop: 14 }}>
                <label className={styles.fieldLabel}>{isZh ? "修改范围" : "Modification scope"}</label>
                <select
                  className={styles.input}
                  value={form.modificationScope}
                  onChange={(e) => setForm((f) => ({ ...f, modificationScope: e.target.value as ModificationScope }))}
                >
                  <option value="allowed">{isZh ? "允许修改" : "Allowed"}</option>
                  <option value="not_allowed">{isZh ? "禁止修改" : "Not allowed"}</option>
                  <option value="with_attribution">{isZh ? "允许但需署名" : "Allowed with attribution"}</option>
                </select>
              </div>
            </>
          )}

          {/* 步骤 7：权利声明 */}
          {step === 6 && (
            <>
              <h2 style={{ margin: "0 0 6px", fontSize: 16 }}>
                {isZh ? "步骤 7：权利声明" : "Step 7: Rights declaration"}
              </h2>
              <p className={styles.fieldHint} style={{ marginBottom: 14 }}>
                {isZh
                  ? "PRD §9.2 强制：真人肖像需明确授权状态，未确认授权不得公开发布或商业授权。"
                  : "PRD §9.2: Portrait-based assets require confirmed rights for public/commercial release."}
              </p>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>{isZh ? "是否基于真人肖像" : "Portrait-based?"}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className={`${styles.optionCard} ${form.portraitBased ? styles.optionCardSelected : ""}`}
                    style={{ flex: 1 }}
                    onClick={() => setForm((f) => ({ ...f, portraitBased: true, rightsStatus: "unconfirmed" }))}
                  >
                    {isZh ? "是（基于真人）" : "Yes (portrait)"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.optionCard} ${!form.portraitBased ? styles.optionCardSelected : ""}`}
                    style={{ flex: 1 }}
                    onClick={() => setForm((f) => ({ ...f, portraitBased: false, rightsStatus: "not_applicable" }))}
                  >
                    {isZh ? "否（纯 AI 生成）" : "No (AI only)"}
                  </button>
                </div>
              </div>
              {form.portraitBased && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>{isZh ? "肖像授权状态" : "Portrait rights status"}</label>
                  <select
                    className={styles.input}
                    value={form.rightsStatus}
                    onChange={(e) => setForm((f) => ({ ...f, rightsStatus: e.target.value as PublishForm["rightsStatus"] }))}
                  >
                    <option value="unconfirmed">{isZh ? "未确认（不可公开/商业）" : "Unconfirmed (no public/commercial)"}</option>
                    <option value="confirmed">{isZh ? "已确认授权" : "Confirmed"}</option>
                  </select>
                </div>
              )}
              {rightsBlocked && (
                <div className={styles.rightsBlock}>
                  <ShieldAlert size={12} style={{ display: "inline", marginRight: 4 }} />
                  {isZh
                    ? "真人肖像未确认授权，当前可见范围或授权方式涉及公开/商业，不得发布。请先确认授权或改为私有/非商业。"
                    : "Unconfirmed portrait rights conflict with public/commercial selection. Confirm rights or switch to private/non-commercial."}
                </div>
              )}
              <div className={styles.rightsDeclBox}>
                <strong>{isZh ? "声明" : "Declaration"}: </strong>
                {isZh
                  ? "我确认对该资产拥有发布与授权的合法权利。如基于真人肖像，已取得本人书面授权。如发现侵权，平台有权下架并追究责任。"
                  : "I confirm I hold lawful rights to publish and license this asset. Portrait-based assets require written authorization from the subject. The platform may takedown infringing assets."}
              </div>
            </>
          )}

          {error && <div className={styles.errorBox} style={{ marginTop: 14 }}>{error}</div>}

          {/* 步骤导航 */}
          <div className={styles.stepNav}>
            <button
              type="button"
              className={styles.button}
              onClick={handleBack}
              disabled={step === 0}
            >
              {isZh ? "上一步" : "Back"}
            </button>
            <button type="button" className={styles.buttonPrimary} onClick={handleNext}>
              {step === steps.length - 1
                ? isZh ? "提交发布" : "Submit"
                : isZh ? "下一步" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
