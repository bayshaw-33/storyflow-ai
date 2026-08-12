"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, MessageSquare } from "lucide-react";
import { fetchKkMessages, updateKkSettings } from "@/lib/client/v2/kk/api";
import { computeStats } from "@/lib/client/v2/kk/filtering";
import type { KkFrequency, KkMessage, KkSettings, KkStats } from "@/lib/client/v2/kk/types";
import { useI18n } from "@/lib/i18n/useI18n";
import { KkPanel } from "./KkPanel";
import styles from "./kk.module.css";

/**
 * KK 全局助手 - 反馈与交互层。
 *
 * 悬浮入口（FAB）+ 展开面板，推送任务关键消息与待确认提醒。
 * 不遮挡关键操作：右下角固定，z-index 40（低于 modal）。
 * 不替用户做决定：所有动作都是"跳转到对应页面让用户处理"。
 */
export function KkCompanion() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<KkMessage[]>([]);
  const [settings, setSettings] = useState<KkSettings>({
    frequency: "key_only",
    doNotDisturb: false,
    mutedUntil: null,
  });
  const [stats, setStats] = useState<KkStats>({ total: 0, unread: 0, bySeverity: { info: 0, success: 0, warning: 0, error: 0 } });
  const [loading, setLoading] = useState(true);

  // 加载消息与设置
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchKkMessages(null);
      setMessages(result.messages);
      setSettings(result.settings);
      setStats(result.stats);
    } catch {
      // 静默失败：KK 不应因加载失败阻塞主界面
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 标记已读
  const handleRead = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, read: true } : m)),
    );
  }, []);

  // 切换频率
  const handleChangeFrequency = useCallback(
    async (freq: KkFrequency) => {
      const next = { ...settings, frequency: freq };
      setSettings(next);
      try {
        await updateKkSettings(next, null);
      } catch {
        // 静默失败：本地状态已更新
      }
    },
    [settings],
  );

  // 切换勿扰
  const handleToggleDnd = useCallback(async () => {
    const next = { ...settings, doNotDisturb: !settings.doNotDisturb };
    setSettings(next);
    try {
      await updateKkSettings(next, null);
    } catch {
      // 静默失败
    }
  }, [settings]);

  // 临时静音 N 分钟
  const handleMuteMinutes = useCallback(
    async (minutes: number) => {
      const until = new Date(Date.now() + minutes * 60_000).toISOString();
      const next = { ...settings, mutedUntil: until };
      setSettings(next);
      try {
        await updateKkSettings(next, null);
      } catch {
        // 静默失败
      }
    },
    [settings],
  );

  // 未读数（用于 FAB 徽标）
  const unread = stats.unread;

  return (
    <>
      <button
        type="button"
        className={`${styles.fab} ${open ? styles.fabActive : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={isZh ? "打开 KK 反馈" : "Open KK feedback"}
        title={isZh ? "KK 反馈助手" : "KK feedback"}
      >
        {open ? <MessageSquare size={22} /> : <Bell size={22} />}
        {!open && unread > 0 && (
          <span className={styles.badge}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      <KkPanel
        open={open}
        messages={messages}
        settings={settings}
        stats={stats}
        loading={loading}
        onClose={() => setOpen(false)}
        onRead={handleRead}
        onChangeFrequency={handleChangeFrequency}
        onToggleDnd={handleToggleDnd}
        onMuteMinutes={handleMuteMinutes}
      />
    </>
  );
}
