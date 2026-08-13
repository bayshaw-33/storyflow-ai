"use client";

/**
 * KIIKIS 2.1 Phase 3 — Task 3.6 KK 装备库 (K21-KK-021/022)
 *
 * 职责：
 *   1. 展示当前净持有的 item/version 列表 (K21-KK-021)
 *   2. 允许用户从持有列表中选择装备 (K21-KK-022)
 *   3. 展示装备历史 (审计追溯)
 *   4. K21-KK-022: 用户只能装备 ledger 当前净持有的 item/version
 *   5. K21-KK-024: 不展示抽卡概率、付费按钮、市场价格、稀缺投资文案
 *
 * 数据流：
 *   - 从 useKkRuntime() 读取 entitlements (净持有) + profile.equippedItemId
 *   - 通过 equipKkItem() API 写回服务端 (服务端再次校验 ledger)
 *   - 通过 listEquipment() 拉取装备历史
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock, Package } from "lucide-react";
import type { KkNetEntitlement, KkEquipmentHistoryEntry } from "@/lib/contracts/v2/kk-profile";
import { equipKkItem, listEquipment } from "@/lib/client/v2/kk/api";
import { useI18n } from "@/lib/i18n/useI18n";
import { useKkRuntime } from "./useKkRuntime";
import styles from "./kk.module.css";

// ============================================================
// 国际化文案
// ============================================================

const COPY = {
  "zh-CN": {
    title: "装备库",
    subtitle: "你持有的物品，仅可在已持有范围内装备",
    holdingsHeader: "当前持有",
    equipBtn: "装备",
    equippedTag: "已装备",
    equipConfirm: "装备中…",
    empty: "暂无持有物品",
    historyHeader: "装备历史",
    historyEmpty: "暂无装备记录",
    historyActionEquip: "装备",
    historyActionUnequip: "卸下",
    errorEquip: "装备失败：",
    refreshError: "拉取装备历史失败",
    noTradeHint: "本应用不提供物品交易、市场价格或抽卡机制。",
    showHistory: "展开装备历史",
    hideHistory: "收起装备历史",
  },
  en: {
    title: "Inventory",
    subtitle: "Items you hold — equip only what you currently own",
    holdingsHeader: "Holdings",
    equipBtn: "Equip",
    equippedTag: "Equipped",
    equipConfirm: "Equipping…",
    empty: "No items held yet",
    historyHeader: "Equipment history",
    historyEmpty: "No equipment history yet",
    historyActionEquip: "Equip",
    historyActionUnequip: "Unequip",
    errorEquip: "Equip failed: ",
    refreshError: "Failed to load equipment history",
    noTradeHint: "This app does not provide trading, market prices, or draw mechanics.",
    showHistory: "Show equipment history",
    hideHistory: "Hide equipment history",
  },
} as const;

function useCopy() {
  const { locale } = useI18n();
  return COPY[locale === "zh-CN" ? "zh-CN" : "en"];
}

// ============================================================
// 安全类型转换
// ============================================================

function asNetEntitlements(raw: ReadonlyArray<unknown>): KkNetEntitlement[] {
  if (!Array.isArray(raw)) return [];
  const list: KkNetEntitlement[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const obj = r as Record<string, unknown>;
    const itemId = typeof obj.itemId === "string" ? obj.itemId : typeof obj.item_id === "string" ? obj.item_id : null;
    const itemVersion = typeof obj.itemVersion === "string" ? obj.itemVersion : typeof obj.item_version === "string" ? obj.item_version : null;
    const netCount = Number(obj.netCount ?? obj.net_count ?? 0);
    if (!itemId || !itemVersion || netCount <= 0) continue;
    list.push({ itemId, itemVersion, netCount });
  }
  return list;
}

function asEquipmentHistory(raw: ReadonlyArray<unknown>): KkEquipmentHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const list: KkEquipmentHistoryEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const obj = r as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id : null;
    const ownerId = typeof obj.ownerId === "string" ? obj.ownerId : typeof obj.owner_id === "string" ? obj.owner_id : null;
    const itemId = typeof obj.itemId === "string" ? obj.itemId : typeof obj.item_id === "string" ? obj.item_id : null;
    const itemVersion = typeof obj.itemVersion === "string" ? obj.itemVersion : typeof obj.item_version === "string" ? obj.item_version : null;
    if (!id || !ownerId || !itemId || !itemVersion) continue;
    const action = obj.action === "equip" || obj.action === "unequip" ? obj.action : "equip";
    list.push({
      id,
      ownerId,
      itemId,
      itemVersion,
      action,
      verifiedLedger: Boolean(obj.verifiedLedger ?? obj.verified_ledger ?? false),
      sourceType: obj.sourceType === "user" || obj.sourceType === "system_migration" ? obj.sourceType : "user",
      createdAt: typeof obj.createdAt === "string" ? obj.createdAt : typeof obj.created_at === "string" ? obj.created_at : "",
    });
  }
  return list;
}

function asEquippedItem(profile: unknown): { itemId: string; itemVersion: string } | null {
  if (!profile || typeof profile !== "object") return null;
  const p = profile as Record<string, unknown>;
  const itemId = (p.equippedItemId as string | null) ?? (p.equipped_item_id as string | null);
  const itemVersion = (p.equippedItemVersion as string | null) ?? (p.equipped_item_version as string | null);
  if (!itemId || !itemVersion) return null;
  return { itemId, itemVersion };
}

// ============================================================
// 主组件
// ============================================================

export interface KkInventoryProps {
  accessToken?: string | null;
  onError?: (message: string) => void;
  /** 装备成功后回调 (例如触发 runtime.refresh) */
  onEquipped?: () => void;
}

export function KkInventory({ accessToken = null, onError, onEquipped }: KkInventoryProps) {
  const runtime = useKkRuntime();
  const c = useCopy();

  const entitlements = useMemo(() => asNetEntitlements(runtime.entitlements), [runtime.entitlements]);
  const equipped = useMemo(() => asEquippedItem(runtime.profile), [runtime.profile]);

  const [equippingKey, setEquippingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<KkEquipmentHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!accessToken) return;
    try {
      const resp = await listEquipment(accessToken, { limit: 30 });
      setHistory(asEquipmentHistory(resp.equipmentHistory));
      setHistoryError(null);
    } catch {
      setHistoryError(c.refreshError);
    }
  }, [accessToken, c.refreshError]);

  useEffect(() => {
    if (historyOpen && accessToken) {
      loadHistory();
    }
  }, [historyOpen, accessToken, loadHistory]);

  const handleEquip = useCallback(
    async (itemId: string, itemVersion: string) => {
      if (!accessToken) return;
      const key = `${itemId}::${itemVersion}`;
      setEquippingKey(key);
      setError(null);
      try {
        await equipKkItem(accessToken, itemId, itemVersion);
        onEquipped?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(c.errorEquip + msg);
        onError?.(msg);
      } finally {
        setEquippingKey(null);
      }
    },
    [accessToken, c.errorEquip, onError, onEquipped],
  );

  return (
    <section className={styles.inventoryCard} aria-label={c.title}>
      <header className={styles.inventoryHeader}>
        <div>
          <h3 className={styles.inventoryTitle}>{c.title}</h3>
          <p className={styles.inventorySubtitle}>{c.subtitle}</p>
        </div>
        <Package size={18} className={styles.inventoryIcon} />
      </header>

      {/* 持有列表 */}
      <div className={styles.inventoryBlock}>
        <h4 className={styles.inventoryBlockTitle}>{c.holdingsHeader}</h4>
        {entitlements.length === 0 ? (
          <p className={styles.inventoryEmpty}>{c.empty}</p>
        ) : (
          <ul className={styles.holdingsList}>
            {entitlements.map((e) => {
              const isEquipped =
                equipped?.itemId === e.itemId && equipped?.itemVersion === e.itemVersion;
              const key = `${e.itemId}::${e.itemVersion}`;
              const isEquipping = equippingKey === key;
              return (
                <li key={key} className={styles.holdingItem}>
                  <div className={styles.holdingInfo}>
                    <div className={styles.holdingId}>
                      <code>{e.itemId}</code>
                    </div>
                    <div className={styles.holdingVer}>
                      <span>v</span>
                      <code>{e.itemVersion}</code>
                      <span className={styles.holdingCount}>×{e.netCount}</span>
                    </div>
                  </div>
                  {isEquipped ? (
                    <span className={styles.equippedBadge}>
                      <Check size={12} />
                      {c.equippedTag}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.equipBtn}
                      onClick={() => handleEquip(e.itemId, e.itemVersion)}
                      disabled={isEquipping || !accessToken}
                      aria-label={`${c.equipBtn} ${e.itemId}`}
                    >
                      {isEquipping ? c.equipConfirm : c.equipBtn}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {error ? <p className={styles.inventoryError}>{error}</p> : null}

        {/* K21-KK-024: 显式声明无交易/抽卡 */}
        <p className={styles.noTradeHint}>{c.noTradeHint}</p>
      </div>

      {/* 装备历史 (可展开) */}
      <div className={styles.inventoryBlock}>
        <button
          type="button"
          className={styles.historyToggle}
          onClick={() => setHistoryOpen((v) => !v)}
          aria-expanded={historyOpen}
        >
          <Clock size={14} />
          <span>{historyOpen ? c.hideHistory : c.showHistory}</span>
        </button>

        {historyOpen ? (
          <div className={styles.historyList}>
            {historyError ? (
              <p className={styles.inventoryError}>{historyError}</p>
            ) : history.length === 0 ? (
              <p className={styles.inventoryEmpty}>{c.historyEmpty}</p>
            ) : (
              <ul>
                {history.map((h) => (
                  <li key={h.id} className={styles.historyItem}>
                    <div className={styles.historyAction}>
                      <span
                        className={`${styles.historyActionTag} ${
                          h.action === "equip" ? styles.historyActionEquip : styles.historyActionUnequip
                        }`}
                      >
                        {h.action === "equip" ? c.historyActionEquip : c.historyActionUnequip}
                      </span>
                      <code className={styles.historyItemId}>{h.itemId}</code>
                      <span className={styles.historyItemVer}>v{h.itemVersion}</span>
                    </div>
                    <time className={styles.historyTime}>{h.createdAt}</time>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export { asNetEntitlements, asEquipmentHistory };
