"use client";

import { BellOff, VolumeX, X } from "lucide-react";
import type { KkMessage, KkSettings, KkStats } from "@/lib/client/v2/kk/types";
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
  onClose: () => void;
  onRead: (id: string) => void;
  onChangeFrequency: (freq: KkFrequency) => void;
  onToggleDnd: () => void;
  onMuteMinutes: (minutes: number) => void;
}

export function KkPanel({
  open,
  messages,
  settings,
  stats,
  loading,
  onClose,
  onRead,
  onChangeFrequency,
  onToggleDnd,
  onMuteMinutes,
}: KkPanelProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const muted = isMuted(settings);

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
            {isZh ? "暂无消息" : "No messages"}
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
