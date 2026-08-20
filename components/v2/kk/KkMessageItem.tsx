"use client";

import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  Lock,
  XCircle,
} from "lucide-react";
import type { KkMessage, KkSeverity } from "@/lib/client/v2/kk/types";
import { SEVERITY_COLORS, messageTypeLabel } from "@/lib/client/v2/kk/filtering";
import { resolveJobResultUrl } from "@/lib/client/v2/navigation/resolver";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./kk.module.css";

// 严重性 -> 图标组件
function severityIcon(severity: KkSeverity, color: string) {
  const props = { size: 16, color, strokeWidth: 2 };
  switch (severity) {
    case "success":
      return <CheckCircle2 {...props} />;
    case "error":
      return <XCircle {...props} />;
    case "warning":
      return <AlertTriangle {...props} />;
    case "info":
    default:
      return <Info {...props} />;
  }
}

// 格式化时间为简短相对时间
function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return locale === "zh-CN" ? "刚刚" : "just now";
  if (min < 60) return locale === "zh-CN" ? `${min} 分钟前` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return locale === "zh-CN" ? `${hr} 小时前` : `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return locale === "zh-CN" ? `${day} 天前` : `${day}d ago`;
}

interface KkMessageItemProps {
  message: KkMessage;
  onRead: (id: string) => void;
}

export function KkMessageItem({ message, onRead }: KkMessageItemProps) {
  const router = useRouter();
  const { locale } = useI18n();
  const color = SEVERITY_COLORS[message.severity];

  // Phase 0 Task 0.4：actionUrl 必须是同源应用路由，外部 URL 不传给 router.push
  // （防开放重定向，PRD §6.1）。只显示进度文本而无合法目标时，按钮禁用并展示原因。
  const hasLabel = Boolean(message.actionLabel);
  const safeUrl = resolveJobResultUrl({ resultUrl: message.actionUrl });
  const actionDisabled = hasLabel && !safeUrl;

  // 跳转动作：跳到对应页面让用户处理，不代为确认
  const handleAction = () => {
    onRead(message.id);
    if (safeUrl) {
      router.push(safeUrl);
    }
  };

  return (
    <div
      className={`${styles.msg} ${message.read ? "" : styles.msgUnread}`}
      onClick={() => onRead(message.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRead(message.id);
        }
      }}
    >
      <span className={styles.msgIcon} style={{ color }}>
        {severityIcon(message.severity, color)}
      </span>
      <div className={styles.msgBody}>
        <p className={styles.msgTitle}>
          {!message.read && <span className={styles.unreadDot} aria-label="unread" />}
          {message.title}
        </p>
        <p className={styles.msgText}>{message.body}</p>
        <div className={styles.msgMeta}>
          <span className={styles.msgTime}>
            <span className={styles.msgTypeTag}>{messageTypeLabel(message.type, locale)}</span>
            {" "}
            {formatTime(message.createdAt, locale)}
          </span>
          {message.actionLabel && safeUrl && (
            <button
              type="button"
              className={styles.msgAction}
              onClick={(e) => {
                e.stopPropagation();
                handleAction();
              }}
            >
              {message.actionLabel}
              <ChevronRight size={12} />
            </button>
          )}
          {actionDisabled && (
            <span
              className={styles.msgActionDisabled}
              title={message.actionDisabledReason ?? (locale === "zh-CN" ? "暂无可用目标" : "No target available")}
              aria-disabled="true"
            >
              <Lock size={11} />
              {locale === "zh-CN" ? "暂不可跳转" : "Unavailable"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
