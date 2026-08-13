"use client";

/**
 * KIIKIS 2.1 Phase 3 — Task 3.3 useKkRuntime hook
 *
 * 单一全站 KK runtime 访问 hook。
 * 必须在 <KkRuntimeProvider> 内部使用，否则返回 DEFAULT_KK_RUNTIME_CONTEXT。
 *
 * 设计：
 *   - 不抛错（避免破坏页面布局），未挂载时返回默认值
 *   - 调用方根据 connectionState / enabled / error 决定 UI 渲染
 */
import { useContext } from "react";
import {
  DEFAULT_KK_RUNTIME_CONTEXT,
  KkRuntimeContext,
  type KkRuntimeContextValue,
} from "./KkRuntimeProvider";

export function useKkRuntime(): KkRuntimeContextValue {
  return useContext(KkRuntimeContext) ?? DEFAULT_KK_RUNTIME_CONTEXT;
}

export type { KkRuntimeContextValue } from "./KkRuntimeProvider";
