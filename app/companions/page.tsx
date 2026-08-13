import { KkRuntimeStatusClient } from "../kk/KkRuntimeStatusClient";

/**
 * /companions — K21-KK-001 (Phase 3) 不再重定向首页。
 *
 * 与 /kk 读取同一 runtime（由 app/layout.tsx 的 KkRuntimeProvider 提供）。
 * 旧视觉组件可作为 skin renderer，但不得保留独立状态真相。
 */
export default function CompanionsPage() {
  return <KkRuntimeStatusClient />;
}
