"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Upload,
  Ban,
  Tag,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { ListingStatus } from "@/components/marketplace/types";
import styles from "./listing.module.css";

type ListingEditorProps = {
  actorId: string;
  currentStatus: ListingStatus;
  /** 当前价格（KK 币）；null=免费。 */
  currentPrice: number | null;
  /** 销量统计（只读展示）。 */
  salesCount?: number;
  totalRevenueKk?: number;
  onSaved: () => void;
};

type Notice = { tone: "success" | "error"; text: string };

type Action = "publish" | "delist" | "update_price";

/**
 * 上架/定价编辑组件。
 * - 显示当前状态（未上架/已上架/已下架/平台下架）
 * - 价格输入（数字，整数，留空=免费）
 * - 上架按钮（unlisted/delisted → listed）
 * - 下架按钮（listed → delisted）
 * - 改价按钮（listed 状态下）
 * - 销量统计（只读）
 *
 * 调用 API: PATCH /api/actors/[actorId]/listing
 */
export function ListingEditor({
  actorId,
  currentStatus,
  currentPrice,
  salesCount,
  totalRevenueKk,
  onSaved,
}: ListingEditorProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [priceInput, setPriceInput] = useState<string>(
    currentPrice === null || currentPrice === 0 ? "" : String(currentPrice),
  );
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // 外部 currentPrice 变化时重置输入
  useEffect(() => {
    setPriceInput(currentPrice === null || currentPrice === 0 ? "" : String(currentPrice));
  }, [currentPrice]);

  // notice 5s 自动消失
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const isListed = currentStatus === "listed";
  const isDelisted = currentStatus === "delisted";
  const isUnlisted = currentStatus === "unlisted";
  const isRemoved = currentStatus === "removed";

  function isValidPrice(): boolean {
    const trimmed = priceInput.trim();
    if (!trimmed) return true; // 空白=免费，合法
    const num = Number(trimmed);
    return Number.isFinite(num) && num >= 0 && Number.isInteger(num);
  }

  function parsePrice(): number | null {
    const trimmed = priceInput.trim();
    if (!trimmed) return null; // 留空=免费
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
      // 不可达分支：调用方先用 isValidPrice 校验。返回 null 作为兜底。
      return null;
    }
    return num;
  }

  async function callListingApi(action: Action, priceKk: number | null) {
    const response = await fetch(`/api/actors/${actorId}/listing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action, price_kk: priceKk }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { listing?: unknown; error?: string; code?: string }
      | null;
    if (!response.ok) {
      throw new Error(payload?.error || "listing update failed");
    }
  }

  async function handleAction(action: Action) {
    if (saving) return;

    // 改价/上架需要校验价格输入
    if (action === "publish" || action === "update_price") {
      if (!isValidPrice()) {
        setNotice({
          tone: "error",
          text: isZh ? "价格必须是非负整数（留空=免费）" : "Price must be a non-negative integer (blank = free)",
        });
        return;
      }
    }

    const priceKk = action === "delist" ? currentPrice : parsePrice();

    setSaving(true);
    setSavingAction(action);
    setNotice(null);
    try {
      await callListingApi(action, priceKk);
      const successText = (() => {
        if (isZh) {
          switch (action) {
            case "publish": return "已上架，演员进入市场。";
            case "delist": return "已下架，新买家无法购买。";
            case "update_price": return "价格已更新。";
          }
        }
        switch (action) {
          case "publish": return "Listed. Your actor is now on the marketplace.";
          case "delist": return "Delisted. New buyers can no longer purchase.";
          case "update_price": return "Price updated.";
        }
      })();
      setNotice({ tone: "success", text: successText });
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "listing update failed";
      setNotice({
        tone: "error",
        text: isZh ? `操作失败：${message}` : `Action failed: ${message}`,
      });
    } finally {
      setSaving(false);
      setSavingAction(null);
    }
  }

  function statusLabel(): string {
    if (isZh) {
      switch (currentStatus) {
        case "listed": return "已上架";
        case "delisted": return "已下架";
        case "removed": return "平台下架";
        case "unlisted": return "未上架";
      }
    }
    switch (currentStatus) {
      case "listed": return "Listed";
      case "delisted": return "Delisted";
      case "removed": return "Removed";
      case "unlisted": return "Unlisted";
    }
  }

  function statusCls(): string {
    switch (currentStatus) {
      case "listed": return styles.statusListed;
      case "delisted": return styles.statusDelisted;
      case "removed": return styles.statusRemoved;
      case "unlisted": return styles.statusUnlisted;
    }
  }

  const showPriceField = !isRemoved;
  const canPublish = isUnlisted || isDelisted;
  const canDelist = isListed;
  const canUpdatePrice = isListed;

  return (
    <div className={styles.editor}>
      {/* 当前状态 */}
      <div className={styles.statusBlock}>
        <span className={styles.statusLabel}>
          {isZh ? "当前状态" : "Current status"}
        </span>
        <span className={`${styles.statusBadge} ${statusCls()}`}>
          {statusLabel()}
        </span>
        {isRemoved ? (
          <span className={styles.hint} style={{ marginLeft: "auto" }}>
            {isZh ? "平台已下架，请联系管理员" : "Removed by admin. Please contact support."}
          </span>
        ) : null}
      </div>

      {/* 价格输入 */}
      {showPriceField ? (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="listing-price">
            {isZh ? "价格（KK 币）" : "Price (KK)"}
            <span className={styles.labelHint}>
              {isZh ? "非负整数，留空=免费" : "Non-negative integer, blank = free"}
            </span>
          </label>
          <div className={styles.priceInputSuffix}>
            <input
              id="listing-price"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              className={styles.priceInput}
              value={priceInput}
              placeholder={isZh ? "留空 = 免费" : "Blank = free"}
              onChange={(event) => setPriceInput(event.target.value)}
              disabled={saving || isRemoved}
            />
            <span className={styles.suffixLabel}>KK</span>
          </div>
          <p className={styles.hint}>
            {isZh
              ? "平台抽成 1%，每月 1 号结算上月收益。改价不影响已售订单。"
              : "Platform fee is 1%. Revenue settles on the 1st of each month. Price changes do not affect existing orders."}
          </p>
        </div>
      ) : null}

      {/* 销量统计（只读） */}
      {(typeof salesCount === "number" || typeof totalRevenueKk === "number") ? (
        <div className={styles.statsBlock}>
          <div className={styles.statItem}>
            <span className={styles.statItemValue}>{salesCount ?? 0}</span>
            <span className={styles.statItemLabel}>{isZh ? "销量" : "Sales"}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statItemValue}>{totalRevenueKk ?? 0} KK</span>
            <span className={styles.statItemLabel}>{isZh ? "总收益" : "Revenue"}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statItemValue}>
              {currentPrice === null || currentPrice === 0
                ? isZh ? "免费" : "Free"
                : `${currentPrice} KK`}
            </span>
            <span className={styles.statItemLabel}>{isZh ? "当前定价" : "Price"}</span>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div
          className={`${styles.notice} ${notice.tone === "success" ? styles.noticeSuccess : styles.noticeError}`}
        >
          {notice.tone === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {notice.text}
        </div>
      ) : null}

      {/* 操作按钮 */}
      {showPriceField ? (
        <div className={styles.actions}>
          {canPublish ? (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleAction("publish")}
              disabled={saving}
            >
              {savingAction === "publish" ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
              {savingAction === "publish"
                ? isZh ? "上架中…" : "Listing…"
                : isZh ? "上架" : "Publish"}
            </button>
          ) : null}

          {canDelist ? (
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => void handleAction("delist")}
              disabled={saving}
            >
              {savingAction === "delist" ? <Loader2 size={14} className="spin" /> : <Ban size={14} />}
              {savingAction === "delist"
                ? isZh ? "下架中…" : "Delisting…"
                : isZh ? "下架" : "Delist"}
            </button>
          ) : null}

          {canUpdatePrice ? (
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleAction("update_price")}
              disabled={saving || !isValidPrice()}
            >
              {savingAction === "update_price" ? <Loader2 size={14} className="spin" /> : <Tag size={14} />}
              {savingAction === "update_price"
                ? isZh ? "更新中…" : "Updating…"
                : isZh ? "更新价格" : "Update price"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
