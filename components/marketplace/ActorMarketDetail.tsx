"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShoppingBag,
  Pencil,
  LogIn,
  Sparkles,
  Ban,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import type {
  ActorStats,
  BuyerStatus,
  Listing,
  MarketActorDetail,
  ProjectOption,
  PurchasePreview,
  ViewAsset,
} from "./types";
import { PriceBadge } from "./PriceBadge";
import { GrantTypeBadge } from "./GrantTypeBadge";
import { PurchaseDialog } from "./PurchaseDialog";
import styles from "./marketplace.module.css";

type ActorMarketDetailProps = {
  actor: MarketActorDetail;
  listing: Listing;
  stats: ActorStats;
  /** 创作者信息；若未传则从 actor.owner 取。 */
  owner?: MarketActorDetail["owner"];
  buyerStatus: BuyerStatus;
  isOwner: boolean;
  viewerLoggedIn: boolean;
  /** 当前用户可选项目列表（用于购买卡的项目下拉）。 */
  projects?: ProjectOption[];
  /** 购买成功后的回调（父组件刷新状态）。 */
  onPurchased?: () => void;
};

type Notice = { tone: "success" | "error"; text: string };

/**
 * 市场详情页主组件（客户端组件）。
 * 布局：左侧主视图 + 多视图缩略图行；右侧演员名/tagline/创作者/简介/标签/购买卡。
 */
export function ActorMarketDetail({
  actor,
  listing,
  stats,
  owner,
  buyerStatus,
  isOwner,
  viewerLoggedIn,
  projects = [],
  onPurchased,
}: ActorMarketDetailProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const creator = owner ?? actor.owner;
  const actorName = actor.name?.trim() || (isZh ? "未命名演员" : "Untitled actor");
  const initials = (actor.name?.trim()?.slice(0, 2) || "·").toUpperCase();
  const creatorDisplayName =
    creator.display_name?.trim() ||
    creator.username?.trim() ||
    (isZh ? "匿名创作者" : "Anonymous creator");
  const creatorInitial = creatorDisplayName.slice(0, 1).toUpperCase();
  const creatorHref = creator.username ? `/u/${creator.username}` : null;

  const isFree = listing.price_kk === null || listing.price_kk === 0;
  const isListed = listing.status === "listed";
  const isDelisted = listing.status === "delisted" || listing.status === "removed";

  // 多视图：优先 actor.view_assets；无则只展示 primary_asset_url
  const views: ViewAsset[] =
    actor.view_assets && actor.view_assets.length > 0
      ? actor.view_assets
      : actor.primary_asset_url
        ? [
            {
              id: "primary",
              url: actor.primary_asset_url,
              label_zh: "正面",
              label_en: "Front",
            },
          ]
        : [];

  const [activeViewId, setActiveViewId] = useState<string>(views[0]?.id ?? "primary");
  useEffect(() => {
    // 切换演员时重置到首个视图
    setActiveViewId(views[0]?.id ?? "primary");
  }, [actor.id]);

  const activeView = views.find((v) => v.id === activeViewId) ?? views[0] ?? null;

  // 购买流程状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preview, setPreview] = useState<PurchasePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(""); // "" = 通用授权

  // 页面级 notice
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function fetchPreview() {
    setPreviewLoading(true);
    setDialogError(null);
    try {
      const projectId = selectedProjectId || null;
      const response = await fetchWithAuthRetry(`/api/actors/${actor.id}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ project_id: projectId, preview_only: true }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { preview?: PurchasePreview; error?: string; code?: string }
        | null;
      if (!response.ok || !payload?.preview) {
        throw new Error(payload?.error || (isZh ? "获取费用摘要失败" : "Failed to load preview"));
      }
      setPreview(payload.preview);
      setDialogOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "preview failed";
      setNotice({ tone: "error", text: isZh ? `无法获取费用摘要：${message}` : `Preview failed: ${message}` });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirmPurchase() {
    if (!preview) return;
    setConfirmLoading(true);
    setDialogError(null);
    try {
      const projectId = preview.grant_type === "project" ? preview.project_id : null;
      const response = await fetchWithAuthRetry(`/api/actors/${actor.id}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ project_id: projectId, preview_only: false }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { order?: unknown; error?: string; code?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || (isZh ? "购买失败" : "Purchase failed"));
      }
      setDialogOpen(false);
      setPreview(null);
      setNotice({
        tone: "success",
        text: isFree
          ? isZh ? "已添加到你的演员库" : "Added to your library"
          : isZh ? "购买成功，演员已加入你的演员库" : "Purchase successful",
      });
      onPurchased?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "purchase failed";
      setDialogError(isZh ? `购买失败：${message}` : `Purchase failed: ${message}`);
    } finally {
      setConfirmLoading(false);
    }
  }

  function closeDialog() {
    if (confirmLoading) return;
    setDialogOpen(false);
    setPreview(null);
    setDialogError(null);
  }

  // ===== 购买卡渲染逻辑 =====
  function renderPurchaseCard() {
    // 本人（所有者）
    if (isOwner) {
      return (
        <div className={styles.purchaseCard}>
          <div className={styles.ownerRowInline}>
            <Sparkles size={14} />
            {isZh ? "这是你的演员" : "This is your actor"}
          </div>
          <Link href={`/actors/${actor.id}/edit`} className={styles.purchaseSecondary}>
            <Pencil size={14} />
            {isZh ? "编辑上架" : "Edit listing"}
          </Link>
        </div>
      );
    }

    // 已购买
    if (buyerStatus.hasPurchased) {
      return (
        <div className={styles.purchaseCard}>
          <div className={styles.purchasedRow}>
            <CheckCircle2 size={14} />
            {isZh ? "已购 ✓" : "Purchased ✓"}
            {buyerStatus.grantType ? (
              <GrantTypeBadge
                grantType={buyerStatus.grantType}
                projectTitle={buyerStatus.projectTitle ?? null}
              />
            ) : null}
          </div>
          <Link href={`/actors/${actor.id}/use`} className={styles.purchasePrimary}>
            <ShoppingBag size={14} />
            {isZh ? "使用此演员" : "Use this actor"}
          </Link>
        </div>
      );
    }

    // 已下架且未购买
    if (isDelisted) {
      return (
        <div className={styles.purchaseCard}>
          <div className={styles.delistedNotice}>
            <Ban size={14} />
            {isZh ? "该演员已下架，暂不可购买" : "This actor has been delisted and is no longer for sale"}
          </div>
          <div className={styles.statBlock}>
            <div className={styles.statItem}>
              <span className={styles.statItemValue}>{stats.sales_count}</span>
              <span className={styles.statItemLabel}>{isZh ? "销量" : "Sales"}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statItemValue}>{stats.usage_count}</span>
              <span className={styles.statItemLabel}>{isZh ? "被使用" : "Used"}</span>
            </div>
          </div>
        </div>
      );
    }

    // 未上架（理论上市场详情页不应该出现，兜底）
    if (!isListed) {
      return (
        <div className={styles.purchaseCard}>
          <div className={styles.delistedNotice}>
            <Ban size={14} />
            {isZh ? "该演员暂未上架" : "This actor is not listed"}
          </div>
        </div>
      );
    }

    // 未登录
    if (!viewerLoggedIn) {
      return (
        <div className={styles.purchaseCard}>
          <div className={styles.purchaseHead}>
            <div className={styles.purchasePriceBlock}>
              <span className={styles.purchasePriceLabel}>
                {isZh ? "价格" : "Price"}
              </span>
              <span className={`${styles.purchasePriceValue} ${isFree ? styles.purchasePriceFree : ""}`}>
                {isFree ? (isZh ? "免费" : "Free") : `${listing.price_kk} KK`}
              </span>
            </div>
          </div>
          <Link href="/login" className={styles.purchasePrimary}>
            <LogIn size={14} />
            {isZh ? "登录后购买" : "Sign in to purchase"}
          </Link>
          <div className={styles.statBlock}>
            <div className={styles.statItem}>
              <span className={styles.statItemValue}>{stats.sales_count}</span>
              <span className={styles.statItemLabel}>{isZh ? "销量" : "Sales"}</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statItemValue}>{stats.usage_count}</span>
              <span className={styles.statItemLabel}>{isZh ? "被使用" : "Used"}</span>
            </div>
          </div>
        </div>
      );
    }

    // 已登录未购买：显示价格 + 项目选择 + 购买按钮（免费演员显示"添加到我的演员库"）
    return (
      <div className={styles.purchaseCard}>
        <div className={styles.purchaseHead}>
          <div className={styles.purchasePriceBlock}>
            <span className={styles.purchasePriceLabel}>
              {isZh ? "价格" : "Price"}
            </span>
            <span className={`${styles.purchasePriceValue} ${isFree ? styles.purchasePriceFree : ""}`}>
              {isFree ? (isZh ? "免费" : "Free") : `${listing.price_kk} KK`}
            </span>
          </div>
          <PriceBadge priceKk={listing.price_kk} variant="muted" />
        </div>

        {/* 免费演员不需要选项目，直接领取（通用授权） */}
        {!isFree ? (
          <div className={styles.purchaseField}>
            <label className={styles.purchaseFieldLabel} htmlFor="purchase-project">
              {isZh ? "授权范围" : "License scope"}
            </label>
            <select
              id="purchase-project"
              className={styles.purchaseSelect}
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              disabled={previewLoading || confirmLoading}
            >
              <option value="">
                {isZh ? "通用授权（任意项目可用）" : "Global license (any project)"}
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {isZh ? "项目" : "Project"}: {project.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <button
          type="button"
          className={styles.purchasePrimary}
          onClick={() => void fetchPreview()}
          disabled={previewLoading}
        >
          {previewLoading ? <Loader2 size={14} className="spin" /> : isFree ? <ShoppingBag size={14} /> : <ShoppingBag size={14} />}
          {previewLoading
            ? isZh ? "加载中…" : "Loading…"
            : isFree
              ? isZh ? "添加到我的演员库" : "Add to my library"
              : isZh ? "立即购买" : "Purchase now"}
        </button>

        <div className={styles.statBlock}>
          <div className={styles.statItem}>
            <span className={styles.statItemValue}>{stats.sales_count}</span>
            <span className={styles.statItemLabel}>{isZh ? "销量" : "Sales"}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statItemValue}>{stats.usage_count}</span>
            <span className={styles.statItemLabel}>{isZh ? "被使用" : "Used"}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.detailLayout}>
      {/* 左侧：主视图 + 多视图缩略图行 */}
      <div className={styles.detailLeft}>
        <div className={styles.detailMainVisual}>
          <div className={styles.detailMainPriceWrap}>
            <PriceBadge priceKk={listing.price_kk} />
          </div>
          {activeView?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={activeView.url} alt={actorName} />
          ) : (
            <span className={styles.detailMainInitials}>{initials}</span>
          )}
        </div>
        {views.length > 1 ? (
          <div className={styles.viewStrip} role="tablist" aria-label={isZh ? "多视图预览" : "Multi-view preview"}>
            {views.map((view) => {
              const isActive = view.id === activeViewId;
              return (
                <button
                  key={view.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`${styles.viewThumb} ${isActive ? styles.viewThumbActive : ""}`}
                  onClick={() => setActiveViewId(view.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={view.url} alt={isZh ? view.label_zh : view.label_en} loading="lazy" />
                  <span className={styles.viewThumbLabel}>{isZh ? view.label_zh : view.label_en}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* 右侧：信息 + 购买卡 */}
      <div className={styles.detailRight}>
        <div className={styles.detailHeader}>
          <h1 className={styles.detailName}>{actorName}</h1>
          {actor.tagline ? <p className={styles.detailTagline}>{actor.tagline}</p> : null}
        </div>

        {creatorHref ? (
          <Link href={creatorHref} className={styles.ownerRow}>
            {creator.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creator.avatar_url} alt={creatorDisplayName} className={styles.ownerAvatar} loading="lazy" />
            ) : (
              <span className={styles.ownerAvatarFallback}>{creatorInitial}</span>
            )}
            <span className={styles.ownerName}>{creatorDisplayName}</span>
          </Link>
        ) : (
          <span className={styles.ownerRow}>
            {creator.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creator.avatar_url} alt={creatorDisplayName} className={styles.ownerAvatar} loading="lazy" />
            ) : (
              <span className={styles.ownerAvatarFallback}>{creatorInitial}</span>
            )}
            <span className={styles.ownerName}>{creatorDisplayName}</span>
          </span>
        )}

        {actor.bio ? <p className={styles.detailBio}>{actor.bio}</p> : null}

        {actor.tags && actor.tags.length > 0 ? (
          <div className={styles.detailTags}>
            {actor.tags.map((tag) => (
              <span key={tag} className={styles.detailTag}>{tag}</span>
            ))}
          </div>
        ) : null}

        {notice ? (
          <div
            className={
              notice.tone === "success"
                ? `${styles.purchasedRow}`
                : `${styles.delistedNotice}`
            }
            role="status"
          >
            {notice.tone === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {notice.text}
          </div>
        ) : null}

        {renderPurchaseCard()}
      </div>

      <PurchaseDialog
        open={dialogOpen}
        actor={actor}
        preview={preview}
        onConfirm={() => void confirmPurchase()}
        onClose={closeDialog}
        loading={confirmLoading}
        error={dialogError}
      />
    </div>
  );
}
