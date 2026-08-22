"use client";

import { BellOff, RefreshCw, VolumeX, X, WifiOff } from "lucide-react";
import type {
  KkConnectionState,
  KkMessage,
  KkSettings,
  KkStats,
} from "@/lib/client/v2/kk/types";
import { ALL_FREQUENCIES, type KkFrequency } from "@/lib/client/v2/kk/types";
import { frequencyLabel, isMuted } from "@/lib/client/v2/kk/filtering";
import { useI18n } from "@/lib/i18n/useI18n";
import { KkMessageItem } from "./KkMessageItem";
import styles from "./kk.module.css";

interface KkPanelProps {
  open: boolean;
  messages: KkMessage[];
  settings: KkSettings;
  stats: KkStats;
  loading: boolean;
  /** K21-KK-003 连接状态（Phase 3 新增；不传时视为 live） */
  connectionState?: KkConnectionState;
  /** K21-KK-002 启动错误信息（offline 时展示给用户） */
  errorMessage?: string | null;
  /** P1-03：稳定错误码 —— unauthenticated 与服务故障的文案分开 */
  errorCode?: string | null;
  /** P1-03：最近一次成功同步的时间戳（ms） */
  lastSuccessAt?: number | null;
  onClose: () => void;
  onRead: (id: string) => void;
  onChangeFrequency: (freq: KkFrequency) => void;
  onToggleDnd: () => void;
  onMuteMinutes: (minutes: number) => void;
  /** 用户主动触发重连（断线恢复后） */
  onRefresh?: () => void;
}

export function KkPanel({
  open,
  messages,
  settings,
  stats,
  loading,
  connectionState = "live",
  errorMessage,
  errorCode = null,
  lastSuccessAt = null,
  onClose,
  onRead,
  onChangeFrequency,
  onToggleDnd,
  onMuteMinutes,
  onRefresh,
}: KkPanelProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const muted = isMuted(settings);

  // K21-KK-003: 根据 connectionState 显示状态条
  // P1-03：降噪 + 准确 —— 未登录与故障分开；说明受影响能力与最近成功时间
  const showOfflineBar = connectionState === "offline" || connectionState === "reconnecting";
  const unauthenticated = errorCode === "unauthenticated";
  const lastSuccessLabel = lastSuccessAt
    ? new Date(lastSuccessAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;
  const showPollingBar = connectionState === "polling";

  return (
    <div
      className={`${styles.panel} ${open ? styles.panelOpen : ""}`}
      role="dialog"
      aria-label={isZh ? "KK 反馈面板" : "KK feedback panel"}
      aria-hidden={!open}
    >
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div>
            <p className={styles.headerTitle}>
              {isZh ? "KK 反馈" : "KK Feedback"}
            </p>
            <p className={styles.headerSub}>
              {isZh ? "未读" : "Unread"} <strong style={{ color: "#6de7df" }}>{stats.unread}</strong>
              {" / "}
              {isZh ? "共" : "Total"} <strong style={{ color: "#f4f7f8" }}>{stats.total}</strong>
            </p>
          </div>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={isZh ? "关闭" : "Close"}
        >
          <X size={16} />
        </button>
      </div>

      {/* 连接状态条 */}
      {showOfflineBar && (
        <div className={styles.connectionBar} role="status">
          {unauthenticated ? (
            <>
              <WifiOff size={12} />
              <span>{isZh ? "请先登录后使用 KK（实时推送需要登录）" : "Sign in to use KK realtime"}</span>
            </>
          ) : (
            <>
              <WifiOff size={12} />
              <span>
                {connectionState === "offline"
                  ? (isZh ? "实时推送暂停" : "Realtime paused")
                  : (isZh ? "正在重连..." : "Reconnecting...")}
                {isZh ? "，历史消息仍可查看" : ""}
                {lastSuccessLabel ? (isZh ? ` · 最近成功 ${lastSuccessLabel}` : ` · last ok ${lastSuccessLabel}`) : ""}
              </span>
            </>
          )}
          {errorMessage && (
            <span className={styles.connectionError} title={errorMessage}>
              {isZh ? "（点击刷新重试）" : " (click refresh to retry)"}
            </span>
          )}
          {onRefresh && (
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={onRefresh}
              aria-label={isZh ? "刷新" : "Refresh"}
              title={isZh ? "重新拉取 KK runtime" : "Re-fetch KK runtime"}
            >
              <RefreshCw size={12} />
            </button>
          )}
        </div>
      )}
      {showPollingBar && (
        <div className={`${styles.connectionBar} ${styles.connectionBarPolling}`} role="status">
          <RefreshCw size={12} />
          <span>{isZh ? "实时断线，正在轮询补拉..." : "Realtime offline, polling..."}</span>
        </div>
      )}

      {/* 设置栏：频率 / 勿扰 / 静音 */}
      <div className={styles.settings}>
        <div className={styles.freqGroup} role="group" aria-label={isZh ? "播报频率" : "Frequency"}>
          {ALL_FREQUENCIES.map((freq) => (
            <button
              key={freq}
              type="button"
              className={`${styles.freqBtn} ${settings.frequency === freq ? styles.freqBtnActive : ""}`}
              onClick={() => onChangeFrequency(freq)}
              title={frequencyLabel(freq, locale)}
            >
              {frequencyLabel(freq, locale)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`${styles.iconBtn} ${settings.doNotDisturb ? styles.iconBtnActive : ""}`}
          onClick={onToggleDnd}
          title={isZh ? "勿扰模式" : "Do not disturb"}
        >
          <BellOff size={12} />
          {isZh ? "勿扰" : "DND"}
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${muted ? styles.iconBtnActiveMute : ""}`}
          onClick={() => onMuteMinutes(30)}
          title={isZh ? "静音 30 分钟" : "Mute 30 min"}
          disabled={muted}
        >
          <VolumeX size={12} />
          {isZh ? "静音" : "Mute"}
        </button>
        {muted && (
          <span className={styles.mutedHint}>
            {isZh ? "已静音" : "muted"}
          </span>
        )}
      </div>

      {/* 消息列表 */}
      <div className={styles.list}>
        {loading ? (
          <div className={styles.loading}>
            {isZh ? "加载中..." : "Loading..."}
          </div>
        ) : messages.length === 0 ? (
          <div className={styles.empty}>
            {connectionState === "offline" && errorMessage
              ? (isZh ? "KK 服务暂不可用" : "KK service unavailable")
              : (isZh ? "暂无消息" : "No messages")}
          </div>
        ) : (
          messages.map((msg) => (
            <KkMessageItem key={msg.id} message={msg} onRead={onRead} />
          ))
        )}
      </div>

      {/* 页脚：KK 不替用户做决定 */}
      <div className={styles.footer}>
        {isZh
          ? "KK 只反馈任务信息，不替你确认结果或修改 Canon"
          : "KK only reports task info; it never confirms results or edits Canon"}
      </div>
    </div>
  );
}
