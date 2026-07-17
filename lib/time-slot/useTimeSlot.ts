/**
 * T01 六色三时 — 时段切换核心模块
 *
 * 时段规则（按本地小时）：
 *   08–16 gold（白天 · 草原金）
 *   17–19 purple（晨昏 · 房顶紫红）
 *   20–04 blue（夜晚 · 海边蓝）
 *   05–07 purple（晨曦 · 房顶紫红）
 *
 * 每分钟校准；用户手动切换后停止自动（localStorage 标记）。
 * 与 useI18n 同构：localStorage + CustomEvent 跨组件同步。
 */
"use client";

import { useCallback, useEffect, useState } from "react";

export type TimeSlot = "gold" | "blue" | "purple";

const STORAGE_KEY = "kiikis.time-slot";
const MANUAL_KEY = "kiikis.time-slot.manual";
const EVENT_NAME = "kiikis:time-slot-change";

export function slotFromHour(h: number): TimeSlot {
  if (h >= 8 && h < 17) return "gold";
  if (h >= 20 || h < 5) return "blue";
  return "purple";
}

export function slotFromNow(): TimeSlot {
  return slotFromHour(new Date().getHours());
}

function readStored(): TimeSlot | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "gold" || v === "blue" || v === "purple") return v;
  return null;
}

function readManual(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MANUAL_KEY) === "1";
}

export interface UseTimeSlotResult {
  slot: TimeSlot;
  manual: boolean;
  setSlot: (next: TimeSlot) => void;
  resetAuto: () => void;
}

export function useTimeSlot(): UseTimeSlotResult {
  const [slot, setSlotState] = useState<TimeSlot>(() => {
    if (typeof window === "undefined") return "gold";
    return readStored() ?? slotFromNow();
  });
  const [manual, setManual] = useState<boolean>(() => readManual());

  // 每分钟校准（非手动模式）
  useEffect(() => {
    if (manual) return;
    const tick = () => {
      const next = slotFromNow();
      setSlotState((prev) => (prev === next ? prev : next));
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [manual]);

  // 跨组件同步
  useEffect(() => {
    const onEvent = (e: Event) => {
      const ce = e as CustomEvent<{ slot: TimeSlot; manual: boolean }>;
      if (ce.detail) {
        setSlotState(ce.detail.slot);
        setManual(ce.detail.manual);
      } else {
        setSlotState(readStored() ?? slotFromNow());
        setManual(readManual());
      }
    };
    window.addEventListener(EVENT_NAME, onEvent as EventListener);
    window.addEventListener("storage", onEvent as EventListener);
    return () => {
      window.removeEventListener(EVENT_NAME, onEvent as EventListener);
      window.removeEventListener("storage", onEvent as EventListener);
    };
  }, []);

  const setSlot = useCallback((next: TimeSlot) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, next);
    window.localStorage.setItem(MANUAL_KEY, "1");
    setSlotState(next);
    setManual(true);
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { slot: next, manual: true } })
    );
  }, []);

  const resetAuto = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(MANUAL_KEY);
    window.localStorage.removeItem(STORAGE_KEY);
    const next = slotFromNow();
    setSlotState(next);
    setManual(false);
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { slot: next, manual: false } })
    );
  }, []);

  return { slot, manual, setSlot, resetAuto };
}

/**
 * 仅用于全局 sync 组件：把当前 slot 写到 <html data-time>。
 * 不订阅 manual 状态变化（订阅 slot 即可）。
 */
export function useTimeSlotSync(): void {
  useEffect(() => {
    const apply = () => {
      const stored = readStored();
      const slot = stored ?? slotFromNow();
      document.documentElement.dataset.time = slot;
    };
    apply();
    const onEvent = () => apply();
    window.addEventListener(EVENT_NAME, onEvent);
    window.addEventListener("storage", onEvent);
    // 每分钟校准（手动模式不影响 data-time，因为手动选择的 slot 已写入 storage）
    const id = window.setInterval(apply, 60_000);
    return () => {
      window.removeEventListener(EVENT_NAME, onEvent);
      window.removeEventListener("storage", onEvent);
      window.clearInterval(id);
    };
  }, []);
}
