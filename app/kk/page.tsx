import { KkRuntimeStatusClient } from "./KkRuntimeStatusClient";

/**
 * /kk — K21-KK-001 单一全站 KK runtime 状态页。
 *
 * 不再重定向首页；与 /companions 读取同一 runtime（由 app/layout.tsx 的 KkRuntimeProvider 提供）。
 * 用于调试 KK 连接状态、profile、task projection、pending confirmations。
 */
export default function KkRuntimeStatusPage() {
  return <KkRuntimeStatusClient />;
}
