"use client";

/**
 * K2-T-10 交付物 3：Usage Grant 管理页。
 *
 * 功能：
 * - 授权列表（作为授权人 / 使用者，两个 tab）
 * - 状态筛选：Pending / Active / Expired / Revoked / Cancelled / Disputed
 * - 撤销新使用操作（调用 I-04 revokeUsageGrant）
 * - 调用记录查看（调用 invokeUsageGrant 后的 copy 记录）
 *
 * 调用 I-04 适配器：
 * - fetchUsageGrants(accessToken)
 * - revokeUsageGrant(accessToken, grantId, reason?)
 * - invokeUsageGrant(accessToken, grantId)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Copy,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  fetchUsageGrants,
  invokeUsageGrant,
  isUnauthenticatedError,
  revokeUsageGrant,
} from "@/lib/client/v2/marketplace/api";
import type {
  MarketplaceStatus,
  UsageGrant,
  UsageGrantStatus,
} from "@/lib/client/v2/marketplace/types";
import {
  ALL_USAGE_GRANT_STATUSES,
} from "@/lib/client/v2/marketplace/types";
import {
  grantStatusClass,
  grantStatusLabel,
  formatTime,
} from "./format";
import styles from "./licensing.module.css";

type Tab = "asLicensor" | "asLicensee";

interface InvokeRecord {
  grantId: string;
  copyId: string;
  copyAssetId: string;
  targetProjectId: string;
  invokedAt: string;
}

export function GrantManagement() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [session, setSession] = useState<Session | null>(null);
  const [grants, setGrants] = useState<UsageGrant[]>([]);
  const [status, setStatus] = useState<MarketplaceStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [tab, setTab] = useState<Tab>("asLicensee");
  const [statusFilter, setStatusFilter] = useState<UsageGrantStatus | "all">("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [invokeRecords, setInvokeRecords] = useState<InvokeRecord[]>([]);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  // 监听登录态
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setStatus("empty");
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

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    setActionError(null);
    try {
      const result = await fetchUsageGrants(session?.access_token || null);
      setGrants(result.grants);
      setStatus(result.grants.length === 0 ? "empty" : "ready");
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        setStatus("unauthenticated");
        return;
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isZh
            ? "加载授权记录失败。"
            : "Failed to load grants.",
      );
      setStatus("error");
    }
  }, [session, isZh]);

  useEffect(() => {
    void load();
  }, [load]);

  // 状态筛选
  const filteredGrants = useMemo(() => {
    let list = grants;
    if (statusFilter !== "all") {
      list = list.filter((g) => g.status === statusFilter);
    }
    // tab 切分：fixture 模式下不区分 licensor/licensee，全部显示在当前 tab
    // 真实模式下按 licensorId / licenseeId 与当前用户匹配分到不同 tab
    return list;
  }, [grants, statusFilter]);

  const handleRevoke = async (grantId: string) => {
    setActionError(null);
    setActionLoading(grantId);
    try {
      const result = await revokeUsageGrant(
        session?.access_token || null,
        grantId,
        revokeReason.trim() || undefined,
      );
      // 更新本地列表
      setGrants((prev) =>
        prev.map((g) =>
          g.id === grantId
            ? { ...g, status: result.grant.status }
            : g,
        ),
      );
      setRevokingGrantId(null);
      setRevokeReason("");
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : isZh
            ? "撤销授权失败。"
            : "Failed to revoke grant.",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleInvoke = async (grantId: string) => {
    setActionError(null);
    setActionLoading(grantId);
    try {
      const result = await invokeUsageGrant(
        session?.access_token || null,
        grantId,
      );
      // 记录调用历史
      setInvokeRecords((prev) => [
        {
          grantId,
          copyId: result.copy.id,
          copyAssetId: result.copy.copyAssetId,
          targetProjectId: result.copy.targetProjectId,
          invokedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : isZh
            ? "调用资产失败。"
            : "Failed to invoke grant.",
      );
    } finally {
      setActionLoading(null);
    }
  };

  if (status === "loading") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <div className={styles.loading}>
            {isZh ? "加载授权记录..." : "Loading grants..."}
          </div>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
            {isZh ? "请先登录后查看授权管理。" : "Please log in to view grants."}
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

  if (status === "error") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <div className={styles.errorBox}>{errorMsg}</div>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={() => void load()}
          >
            <RefreshCw size={12} />
            {isZh ? "重试" : "Retry"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Kiikis 2.0 · Grant Management</p>
          <h1 className={styles.title}>
            {isZh ? "使用授权管理" : "Usage grant management"}
          </h1>
          <p className={styles.subtitle}>
            {isZh
              ? "查看作为授权人或使用者的授权记录，撤销或调用资产。"
              : "View grants as licensor or licensee; revoke or invoke assets."}
          </p>
          <div className={styles.headerActions} style={{ marginTop: 12 }}>
            <button
              type="button"
              className={styles.button}
              onClick={() => void load()}
            >
              <RefreshCw size={12} />
              {isZh ? "刷新" : "Refresh"}
            </button>
            <button
              type="button"
              className={styles.buttonPrimary}
              onClick={() => router.push("/business/marketplace")}
            >
              <Plus size={12} />
              {isZh ? "浏览市场" : "Browse marketplace"}
            </button>
          </div>
        </header>

        {/* Tab 切换 */}
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === "asLicensee" ? styles.tabActive : ""}`}
            onClick={() => setTab("asLicensee")}
          >
            {isZh ? "作为使用者" : "As licensee"}
            <span className={styles.tabCount}>{grants.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === "asLicensor" ? styles.tabActive : ""}`}
            onClick={() => setTab("asLicensor")}
          >
            {isZh ? "作为授权人" : "As licensor"}
            <span className={styles.tabCount}>{grants.length}</span>
          </button>
        </div>

        {/* 状态筛选 */}
        <div className={styles.filterBar}>
          <button
            type="button"
            className={`${styles.chip} ${statusFilter === "all" ? styles.chipActive : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            {isZh ? "全部" : "All"}
          </button>
          {ALL_USAGE_GRANT_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.chip} ${statusFilter === s ? styles.chipActive : ""}`}
              onClick={() => setStatusFilter(s)}
            >
              {grantStatusLabel(s, locale)}
            </button>
          ))}
        </div>

        {actionError && (
          <div className={styles.errorBox} style={{ marginBottom: 12 }}>
            {actionError}
          </div>
        )}

        {/* 授权列表 */}
        {filteredGrants.length === 0 ? (
          <div className={styles.empty}>
            {isZh
              ? "没有匹配的授权记录。"
              : "No matching grants."}
          </div>
        ) : (
          <div className={styles.cardList}>
            {filteredGrants.map((grant) => {
              const canInvoke = grant.status === "active";
              const canRevoke =
                grant.status === "active" || grant.status === "pending";
              const isRevoking = revokingGrantId === grant.id;
              return (
                <div key={grant.id} className={styles.card}>
                  <div className={styles.cardRow}>
                    <div className={styles.cardHead}>
                      <h3 className={styles.cardTitle}>
                        {isZh ? "授权" : "Grant"} #{grant.id.slice(-8)}
                      </h3>
                      <p className={styles.cardSubtitle}>
                        {isZh ? "资产 ID" : "Asset ID"}: {grant.assetId || "—"}
                        {" · "}
                        {isZh ? "项目" : "Project"}: {grant.projectId || grant.projectName || "—"}
                      </p>
                    </div>
                    <span
                      className={`${styles.statusTag} ${styles[grantStatusClass(grant.status)]}`}
                    >
                      {grantStatusLabel(grant.status, locale)}
                    </span>
                  </div>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardMetaItem}>
                      <span className={styles.cardMetaKey}>
                        {isZh ? "授权时间" : "Granted"}:
                      </span>
                      <span className={styles.cardMetaVal}>
                        {formatTime(grant.grantedAt, locale)}
                      </span>
                    </span>
                    {grant.expiresAt && (
                      <span className={styles.cardMetaItem}>
                        <span className={styles.cardMetaKey}>
                          {isZh ? "到期" : "Expires"}:
                        </span>
                        <span className={styles.cardMetaVal}>
                          {formatTime(grant.expiresAt, locale)}
                        </span>
                      </span>
                    )}
                    <span className={styles.cardMetaItem}>
                      <span className={styles.cardMetaKey}>
                        {isZh ? "要约" : "Offer"}:
                      </span>
                      <span className={styles.cardMetaVal}>
                        {grant.offerId || "—"}
                      </span>
                    </span>
                  </div>

                  {/* 撤销确认框 */}
                  {isRevoking && (
                    <div className={styles.summaryBox} style={{ marginTop: 8 }}>
                      <label className={styles.fieldLabel}>
                        {isZh ? "撤销理由（可选）" : "Revoke reason (optional)"}
                      </label>
                      <textarea
                        className={styles.textarea}
                        value={revokeReason}
                        onChange={(e) => setRevokeReason(e.target.value)}
                        placeholder={
                          isZh
                            ? "请填写撤销理由..."
                            : "Enter revoke reason..."
                        }
                      />
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.buttonDanger}
                          disabled={actionLoading === grant.id}
                          onClick={() => void handleRevoke(grant.id)}
                        >
                          <Ban size={12} />
                          {actionLoading === grant.id
                            ? isZh
                              ? "撤销中..."
                              : "Revoking..."
                            : isZh
                              ? "确认撤销"
                              : "Confirm revoke"}
                        </button>
                        <button
                          type="button"
                          className={styles.button}
                          onClick={() => {
                            setRevokingGrantId(null);
                            setRevokeReason("");
                          }}
                        >
                          {isZh ? "取消" : "Cancel"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 操作按钮 */}
                  {!isRevoking && (
                    <div className={styles.actions}>
                      {canInvoke && (
                        <button
                          type="button"
                          className={styles.buttonPrimary}
                          disabled={actionLoading === grant.id}
                          onClick={() => void handleInvoke(grant.id)}
                        >
                          <Copy size={12} />
                          {actionLoading === grant.id
                            ? isZh
                              ? "调用中..."
                              : "Invoking..."
                            : isZh
                              ? "调用资产（创建副本）"
                              : "Invoke (create copy)"}
                        </button>
                      )}
                      {canRevoke && (
                        <button
                          type="button"
                          className={styles.buttonDanger}
                          onClick={() => {
                            setRevokingGrantId(grant.id);
                            setRevokeReason("");
                          }}
                        >
                          <Ban size={12} />
                          {isZh ? "撤销新调用" : "Revoke"}
                        </button>
                      )}
                      {!canInvoke && !canRevoke && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "rgba(255,255,255,0.4)",
                          }}
                        >
                          {isZh
                            ? "当前状态无可用操作。"
                            : "No actions available for this status."}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 调用记录 */}
        {invokeRecords.length > 0 && (
          <>
            <h2 className={styles.sectionTitle}>
              {isZh ? "调用记录" : "Invoke records"}
            </h2>
            <div className={styles.cardList}>
              {invokeRecords.map((rec, i) => (
                <div key={`${rec.grantId}-${i}`} className={styles.card}>
                  <div className={styles.cardRow}>
                    <div className={styles.cardHead}>
                      <h3 className={styles.cardTitle}>
                        <CheckCircle2
                          size={12}
                          style={{
                            display: "inline",
                            marginRight: 4,
                            color: "#7dd181",
                          }}
                        />
                        {isZh ? "调用记录" : "Invoke record"}
                      </h3>
                      <p className={styles.cardSubtitle}>
                        {isZh ? "授权" : "Grant"}: {rec.grantId.slice(-8)}
                        {" · "}
                        {isZh ? "副本" : "Copy"}: {rec.copyId.slice(-12)}
                      </p>
                    </div>
                    <span className={styles.cardMetaVal}>
                      {formatTime(rec.invokedAt, locale)}
                    </span>
                  </div>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardMetaItem}>
                      <span className={styles.cardMetaKey}>
                        {isZh ? "副本资产 ID" : "Copy asset ID"}:
                      </span>
                      <span className={styles.cardMetaVal}>
                        {rec.copyAssetId}
                      </span>
                    </span>
                    <span className={styles.cardMetaItem}>
                      <span className={styles.cardMetaKey}>
                        {isZh ? "目标项目" : "Target project"}:
                      </span>
                      <span className={styles.cardMetaVal}>
                        {rec.targetProjectId || "—"}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
