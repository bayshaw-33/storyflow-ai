"use client";

import { useEffect } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { MarketActorCard, PurchasePreview } from "./types";
import { GrantTypeBadge } from "./GrantTypeBadge";
import styles from "./marketplace.module.css";

type PurchaseDialogProps = {
  open: boolean;
  actor: MarketActorCard;
  preview: PurchasePreview | null;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
  /** 调用 preview/confirm 时的错误信息（由父组件传入）。 */
  error?: string | null;
};

/**
 * 购买确认弹窗。
 * 显示：演员名 + 缩略图 + 授权范围 + 价格 + 当前余额 + 购买后余额。
 * 暗色玻璃风格（用 --glass-fill, --glass-border）。
 */
export function PurchaseDialog({
  open,
  actor,
  preview,
  onConfirm,
  onClose,
  loading,
  error,
}: PurchaseDialogProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, loading, onClose]);

  // 弹窗打开时锁 body 滚动
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const actorName = actor.name?.trim() || (isZh ? "未命名演员" : "Untitled actor");
  const ownerName =
    actor.owner.display_name?.trim() ||
    actor.owner.username?.trim() ||
    (isZh ? "匿名创作者" : "Anonymous creator");
  const initials = (actor.name?.trim()?.slice(0, 2) || "·").toUpperCase();

  const isFree = preview?.price_kk === 0;
  const insufficient =
    preview !== null && !isFree && preview.balance_after_kk < 0;

  return (
    <div
      className={styles.dialogBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-dialog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div className={styles.dialog}>
        <div className={styles.dialogHead}>
          <h2 id="purchase-dialog-title" className={styles.dialogTitle}>
            {isFree ? (isZh ? "添加到演员库" : "Add to library") : (isZh ? "确认购买" : "Confirm purchase")}
          </h2>
          <button
            type="button"
            className={styles.dialogClose}
            onClick={onClose}
            disabled={loading}
            aria-label={isZh ? "关闭" : "Close"}
          >
            <X size={16} />
          </button>
        </div>

        <div className={styles.dialogActor}>
          <div className={styles.dialogActorThumb}>
            {actor.primary_asset_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={actor.primary_asset_url} alt={actorName} />
            ) : (
              <span className={styles.dialogActorInitials}>{initials}</span>
            )}
          </div>
          <div className={styles.dialogActorMeta}>
            <p className={styles.dialogActorName}>{actorName}</p>
            <span className={styles.dialogActorOwner}>
              {isZh ? "创作者" : "Creator"}: {ownerName}
            </span>
            {preview ? (
              <GrantTypeBadge
                grantType={preview.grant_type}
                projectTitle={preview.project_title ?? null}
              />
            ) : null}
          </div>
        </div>

        {preview ? (
          <div className={styles.dialogSummary}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>
                {isZh ? "授权价格" : "Price"}
              </span>
              <span className={styles.summaryValue}>
                {isFree ? (isZh ? "免费" : "Free") : `${preview.price_kk} KK`}
              </span>
            </div>
            {!isFree ? (
              <>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>
                    {isZh ? "平台抽成" : "Platform fee"}
                  </span>
                  <span className={styles.summaryValue}>{preview.platform_fee_kk} KK</span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>
                    {isZh ? "创作者收益" : "Creator revenue"}
                  </span>
                  <span className={styles.summaryValue}>
                    <strong>{preview.seller_revenue_kk}</strong> KK
                  </span>
                </div>
                <div className={styles.summaryDivider} />
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>
                    {isZh ? "当前余额" : "Current balance"}
                  </span>
                  <span className={styles.summaryValue}>{preview.balance_kk} KK</span>
                </div>
                <div className={`${styles.summaryRow} ${insufficient ? styles.summaryInsufficient : ""}`}>
                  <span className={styles.summaryLabel}>
                    {isZh ? "购买后余额" : "Balance after"}
                  </span>
                  <span className={styles.summaryValue}>
                    {insufficient ? (
                      <strong>{isZh ? "余额不足" : "Insufficient"}</strong>
                    ) : (
                      `${preview.balance_after_kk} KK`
                    )}
                  </span>
                </div>
              </>
            ) : (
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>
                  {isZh ? "说明" : "Note"}
                </span>
                <span className={styles.summaryValue}>
                  {isZh ? "免费演员，无需扣费" : "Free actor, no charge"}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.dialogSummary}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>
                {isZh ? "正在加载费用摘要…" : "Loading summary…"}
              </span>
            </div>
          </div>
        )}

        {error ? (
          <div className={styles.dialogError}>
            <AlertCircle size={13} />
            {error}
          </div>
        ) : null}

        <div className={styles.dialogFoot}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
            disabled={loading}
          >
            {isZh ? "取消" : "Cancel"}
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={onConfirm}
            disabled={loading || !preview || insufficient}
          >
            {loading ? <Loader2 size={14} className="spin" /> : null}
            {loading
              ? isZh ? "处理中…" : "Processing…"
              : isFree
                ? isZh ? "确认添加" : "Confirm add"
                : isZh ? "确认购买" : "Confirm purchase"}
          </button>
        </div>
      </div>
    </div>
  );
}
