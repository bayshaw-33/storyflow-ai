"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Flag,
  Image as ImageIcon,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import { fetchAssetById, isUnauthenticatedError } from "@/lib/client/v2/marketplace/api";
import type { MarketplaceAsset, MarketplaceStatus } from "@/lib/client/v2/marketplace/types";
import {
  assetTypeLabel,
  canGrantCommercial,
  canPublishPublicly,
  formatPrice,
  isAssetUsable,
  isLicenseCommercial,
  isLicenseFree,
  licenseTypeLabel,
} from "@/lib/client/v2/marketplace/filtering";
import { UsageEntryModal } from "./UsageEntryModal";
import styles from "./marketplace.module.css";

interface AssetDetailClientProps {
  assetId: string;
}

export function AssetDetailClient({ assetId }: AssetDetailClientProps) {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [session, setSession] = useState<Session | null>(null);
  const [asset, setAsset] = useState<MarketplaceAsset | null>(null);
  const [status, setStatus] = useState<MarketplaceStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [usageOpen, setUsageOpen] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
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

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const result = await fetchAssetById(assetId, session?.access_token || null);
      setAsset(result.asset);
      setStatus("ready");
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        setStatus("unauthenticated");
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : isZh ? "加载资产详情失败。" : "Failed to load asset.");
      setStatus("error");
    }
  }, [assetId, session, isZh]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "loading") {
    return (
      <main className={styles.shell}>
        <div className={styles.loading}>{isZh ? "加载资产详情..." : "Loading asset..."}</div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className={styles.shell}>
        <button type="button" className={styles.backLink} onClick={() => router.push("/business/marketplace")}>
          <ArrowLeft size={14} /> {isZh ? "返回市场" : "Back to marketplace"}
        </button>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
          {isZh ? "请先登录后查看资产详情。" : "Please log in to view asset details."}
        </p>
      </main>
    );
  }

  if (status === "error" || !asset) {
    return (
      <main className={styles.shell}>
        <button type="button" className={styles.backLink} onClick={() => router.push("/business/marketplace")}>
          <ArrowLeft size={14} /> {isZh ? "返回市场" : "Back to marketplace"}
        </button>
        <div className={styles.errorBox}>{errorMsg}</div>
        <button type="button" className={styles.buttonPrimary} onClick={() => void load()}>
          {isZh ? "重试" : "Retry"}
        </button>
      </main>
    );
  }

  const free = isLicenseFree(asset.licenseOffer);
  const commercial = isLicenseCommercial(asset.licenseOffer);
  const usable = isAssetUsable(asset);
  const portraitWarn = asset.portraitBased && asset.rightsStatus !== "confirmed";
  const canPublic = canPublishPublicly(asset);
  const canCommercial = canGrantCommercial(asset);

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <button type="button" className={styles.backLink} onClick={() => router.push("/business/marketplace")}>
          <ArrowLeft size={14} /> {isZh ? "返回市场" : "Back to marketplace"}
        </button>

        {/* 推荐理由 */}
        {asset.recommended && asset.recommendationReason && (
          <div className={styles.recommendBanner}>
            <Sparkles size={14} style={{ flexShrink: 0, marginTop: 1, color: "#6de7df" }} />
            <span>
              <strong>{isZh ? "推荐理由" : "Recommendation reason"}: </strong>
              {asset.recommendationReason}
            </span>
          </div>
        )}

        <div className={styles.detailWrap}>
          {/* 左侧：主版本预览 */}
          <div>
            <div className={styles.detailPreview}>
              {asset.mainVersion.preview ? (
                <img
                  className={styles.detailPreviewImg}
                  src={asset.mainVersion.preview}
                  alt={asset.name}
                  onError={(e) => {
                    (e.currentTarget.style.display = "none");
                  }}
                />
              ) : (
                <span>
                  <ImageIcon size={32} />
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "8px 0 0" }}>
              {isZh ? "主版本预览" : "Main version preview"} · {new Date(asset.mainVersion.createdAt).toLocaleDateString()}
            </p>
          </div>

          {/* 右侧：详情面板 */}
          <div className={styles.detailPanel}>
            <h1 className={styles.detailName}>{asset.name}</h1>
            <p className={styles.detailCreator}>
              {isZh ? "创建者" : "Creator"}: <strong>{asset.creator.name}</strong>
              {" · "}
              {isZh ? "作品" : "Works"}: {asset.creator.worksCount}
              {" · "}
              {isZh ? "使用" : "Uses"}: {asset.creator.usageCount}
            </p>

            {/* 资产说明 */}
            <p className={styles.detailDesc}>{asset.description}</p>

            {/* 允许用途 / 禁止用途 */}
            <h3 className={styles.sectionTitle}>{isZh ? "允许用途" : "Allowed uses"}</h3>
            <ul className={styles.useList}>
              {asset.allowedUses.map((u) => (
                <li key={u} className={styles.useAllowed}>
                  <CheckCircle2 size={10} style={{ display: "inline", marginRight: 4 }} />
                  {u}
                </li>
              ))}
            </ul>

            <h3 className={styles.sectionTitle}>{isZh ? "禁止用途" : "Forbidden uses"}</h3>
            <ul className={styles.useList}>
              {asset.forbiddenUses.map((u) => (
                <li key={u} className={styles.useForbidden}>
                  <XCircle size={10} style={{ display: "inline", marginRight: 4 }} />
                  {u}
                </li>
              ))}
            </ul>

            {/* 可见范围 */}
            <h3 className={styles.sectionTitle}>{isZh ? "可见范围" : "Visibility"}</h3>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>{isZh ? "范围" : "Scope"}</span>
              <span className={styles.metaVal}>{asset.visibility}</span>
            </div>

            {/* 授权方式摘要 */}
            <h3 className={styles.sectionTitle}>{isZh ? "授权方式摘要" : "License offer summary"}</h3>
            <div className={styles.licenseBox}>
              <div className={styles.licenseRow}>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>{isZh ? "类型" : "Type"}</span>
                <span>{licenseTypeLabel(asset.licenseOffer.type, locale)}</span>
              </div>
              <div className={styles.licenseRow}>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>{isZh ? "商业范围" : "Commercial scope"}</span>
                <span>{asset.licenseOffer.commercialScope}</span>
              </div>
              <div className={styles.licenseRow}>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>{isZh ? "修改范围" : "Modification"}</span>
                <span>{asset.licenseOffer.modificationScope}</span>
              </div>
              <div className={styles.licenseRow}>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>{isZh ? "地域" : "Territory"}</span>
                <span>
                  {asset.licenseOffer.territory.length === 0
                    ? isZh ? "全球" : "Worldwide"
                    : asset.licenseOffer.territory.join(", ")}
                </span>
              </div>
              <div className={styles.licenseRow}>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>{isZh ? "期限" : "Duration"}</span>
                <span>
                  {asset.licenseOffer.durationDays === null
                    ? isZh ? "永久" : "Perpetual"
                    : `${asset.licenseOffer.durationDays} ${isZh ? "天" : "days"}`}
                </span>
              </div>
              <div className={styles.licenseRow}>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>{isZh ? "价格" : "Price"}</span>
                <span style={{ fontWeight: 800, color: free ? "#6de7df" : "#ffd166" }}>
                  {formatPrice(asset.licenseOffer, locale)}
                </span>
              </div>
            </div>

            {/* 来源与证据状态 */}
            <h3 className={styles.sectionTitle}>{isZh ? "来源与证据" : "Source & evidence"}</h3>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>{isZh ? "证据状态" : "Evidence"}</span>
              <span className={styles.metaVal}>{asset.sourceEvidence.status}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>{isZh ? "验证时间" : "Verified at"}</span>
              <span className={styles.metaVal}>
                {asset.sourceEvidence.verifiedAt
                  ? new Date(asset.sourceEvidence.verifiedAt).toLocaleDateString()
                  : isZh ? "未验证" : "Not verified"}
              </span>
            </div>

            {/* 真人肖像权利状态（PRD §9.2 强制） */}
            {asset.portraitBased && (
              <>
                <h3 className={styles.sectionTitle}>{isZh ? "真人肖像权利" : "Portrait rights"}</h3>
                <div className={styles.metaRow}>
                  <span className={styles.metaKey}>{isZh ? "基于真人肖像" : "Portrait-based"}</span>
                  <span className={styles.metaVal}>{isZh ? "是" : "Yes"}</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaKey}>{isZh ? "权利状态" : "Rights status"}</span>
                  <span
                    className={styles.metaVal}
                    style={{ color: asset.rightsStatus === "confirmed" ? "#7dd181" : "#ff8b8b" }}
                  >
                    {asset.rightsStatus === "confirmed"
                      ? isZh ? "已确认" : "Confirmed"
                      : asset.rightsStatus === "unconfirmed"
                        ? isZh ? "未确认" : "Unconfirmed"
                        : isZh ? "不适用" : "Not applicable"}
                  </span>
                </div>
                {portraitWarn && (
                  <div className={styles.rightsBlock}>
                    <ShieldAlert size={12} style={{ display: "inline", marginRight: 4 }} />
                    {isZh
                      ? "肖像权利未确认：不得公开发布或商业授权。"
                      : "Rights unconfirmed: public release and commercial licensing are prohibited."}
                  </div>
                )}
              </>
            )}

            {/* 操作入口 */}
            <div className={styles.detailActions}>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={() => setUsageOpen(true)}
                disabled={!usable}
                title={!usable ? (isZh ? "资产当前状态不可调用" : "Asset not usable in current status") : ""}
              >
                {isZh ? "调用到项目" : "Use in project"}
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => setReported(true)}
                disabled={reported}
              >
                <Flag size={12} />
                {reported ? (isZh ? "已举报" : "Reported") : isZh ? "举报" : "Report"}
              </button>
              <button
                type="button"
                className={styles.buttonDanger}
                style={{ border: "1px solid rgba(255,139,139,0.4)", color: "#ff8b8b", borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer", background: "transparent" }}
                onClick={() => {
                  if (window.confirm(isZh ? "确认申请下架该资产？" : "Request takedown of this asset?")) {
                    alert(isZh ? "已提交下架申请，平台将审核。" : "Takedown request submitted for review.");
                  }
                }}
              >
                {isZh ? "申请下架" : "Request takedown"}
              </button>
            </div>

            {reported && (
              <div className={styles.noticeBox} style={{ marginTop: 10 }}>
                {isZh ? "已提交举报，平台将审核处理。" : "Report submitted for review."}
              </div>
            )}

            {/* 创建者信息 */}
            <h3 className={styles.sectionTitle}>{isZh ? "创建者信息" : "Creator info"}</h3>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>{isZh ? "名称" : "Name"}</span>
              <span className={styles.metaVal}>{asset.creator.name}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>{isZh ? "作品数" : "Works"}</span>
              <span className={styles.metaVal}>{asset.creator.worksCount}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>{isZh ? "被使用次数" : "Usage count"}</span>
              <span className={styles.metaVal}>{asset.creator.usageCount}</span>
            </div>
            {asset.creator.bio && (
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "8px 0 0", lineHeight: 1.5 }}>
                {asset.creator.bio}
              </p>
            )}

            {/* 资产元信息 */}
            <h3 className={styles.sectionTitle}>{isZh ? "资产信息" : "Asset info"}</h3>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>{isZh ? "类型" : "Type"}</span>
              <span className={styles.metaVal}>{assetTypeLabel(asset.type, locale)}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>{isZh ? "状态" : "Status"}</span>
              <span className={styles.metaVal}>{asset.status}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>{isZh ? "使用次数" : "Usage count"}</span>
              <span className={styles.metaVal}>{asset.usageCount}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>{isZh ? "评分" : "Rating"}</span>
              <span className={styles.metaVal}>{asset.rating} / 5</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>{isZh ? "创建时间" : "Created"}</span>
              <span className={styles.metaVal}>{new Date(asset.createdAt).toLocaleDateString()}</span>
            </div>

            {/* 隐私说明：不展示内部 Prompt、存储路径、敏感元数据 */}
            <div className={styles.noticeBox}>
              {isZh
                ? "本页面不展示内部 Prompt、存储路径与敏感元数据（PRD §9.4 强制）。"
                : "Internal prompts, storage paths and sensitive metadata are not exposed (PRD §9.4)."}
            </div>
          </div>
        </div>

        {/* 调用入口 Modal */}
        {usageOpen && (
          <UsageEntryModal
            asset={asset}
            onClose={() => setUsageOpen(false)}
            onConfirmed={() => {
              setUsageOpen(false);
              router.push("/business/marketplace");
            }}
          />
        )}
      </div>
    </main>
  );
}
