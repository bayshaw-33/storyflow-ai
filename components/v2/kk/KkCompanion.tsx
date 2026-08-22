"use client";

import { useCallback, useState } from "react";
import { Bell, MessageSquare } from "lucide-react";
import type { KkFrequency, KkMessage, KkSettings, KkStats } from "@/lib/client/v2/kk/types";
import { useI18n } from "@/lib/i18n/useI18n";
import { useKkRuntime } from "./useKkRuntime";
import { KkPanel } from "./KkPanel";
import styles from "./kk.module.css";

/**
 * KK 全局助手 - 反馈与交互层。
 *
 * K21-KK-001 (Phase 3 改造)：
 *   - 不再自己 fetch；改为从全站唯一 KkRuntimeProvider 读 messages/stats/settings
 *   - 旧 updateKkSettings 持久化由 Task 3.6 (profile PATCH) 接管，此处只更新本地状态
 *   - connectionState=offline 时仍可点击打开面板查看历史消息
 *
 * 悬浮入口（FAB）+ 展开面板，推送任务关键消息与待确认提醒。
 * 不遮挡关键操作：右下角固定，z-index 40（低于 modal）。
 * 不替用户做决定：所有动作都是"跳转到对应页面让用户处理"。
 */
export function KkCompanion() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const runtime = useKkRuntime();
  const [open, setOpen] = useState(false);

  // 旧 settings 持久化由本地状态承担（2.1 不再写服务端）
  const [localSettings, setLocalSettings] = useState<KkSettings>({
    frequency: "key_only",
    doNotDisturb: false,
    mutedUntil: null,
  });

  // 标记已读：调用 runtime 的 markMessageRead
  const handleRead = useCallback(
    (id: string) => {
      runtime.markMessageRead(id);
    },
    [runtime],
  );

  // 切换频率（仅本地状态，2.1 通过 useKkRuntime 暴露给 KkPanel）
  const handleChangeFrequency = useCallback((freq: KkFrequency) => {
    setLocalSettings((prev) => ({ ...prev, frequency: freq }));
  }, []);

  // 切换勿扰
  const handleToggleDnd = useCallback(() => {
    setLocalSettings((prev) => ({ ...prev, doNotDisturb: !prev.doNotDisturb }));
  }, []);

  // 临时静音 N 分钟
  const handleMuteMinutes = useCallback((minutes: number) => {
    const until = new Date(Date.now() + minutes * 60_000).toISOString();
    setLocalSettings((prev) => ({ ...prev, mutedUntil: until }));
  }, []);

  // 强制重拉 runtime（断线恢复时用户主动触发）
  const handleRefresh = useCallback(() => {
    void runtime.refresh();
  }, [runtime]);

  // 兼容 KkPanel 期望的 props（messages/stats/settings/loading）
  const messages = runtime.messages as KkMessage[];
  const stats = runtime.stats as KkStats;
  const settings = localSettings;
  const loading =
    runtime.connectionState === "connecting" ||
    (runtime.connectionState === "reconnecting" && messages.length === 0);
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
        connectionState={runtime.connectionState}
        errorMessage={runtime.error?.message ?? null}
        errorCode={runtime.error?.code ?? null}
        lastSuccessAt={runtime.lastSuccessAt}
        onClose={() => setOpen(false)}
        onRead={handleRead}
        onChangeFrequency={handleChangeFrequency}
        onToggleDnd={handleToggleDnd}
        onMuteMinutes={handleMuteMinutes}
        onRefresh={handleRefresh}
      />
    </>
  );
}
