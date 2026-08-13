/**
 * KIIKIS 2.1 Phase 2 — Handoff 内容 hash (K21-HO-004)
 *
 * 计算源内容 hash，用于：
 * 1. 判断上游是否修改 (相同内容 → 相同 hash)
 * 2. 幂等创建 handoff (相同 sourceHash → 不创建新版本)
 *
 * 设计：
 * - 规范化 JSON key 顺序后再 hash，保证字段顺序不影响结果
 * - sourceHash / confirmedBy / createdAt 不参与 hash (派生/元数据字段)
 */

import { createHash } from "node:crypto";

/** 不参与内容 hash 的字段 (派生或元数据)。 */
const EXCLUDED_FROM_HASH = new Set(["sourceHash", "confirmedBy", "createdAt"]);

/**
 * 递归规范化对象/数组的 key 顺序，返回稳定字符串。
 * 排除 EXCLUDED_FROM_HASH 中的字段。
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => !EXCLUDED_FROM_HASH.has(k))
    .sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]));
  return "{" + pairs.join(",") + "}";
}

/**
 * 计算 handoff 内容 hash。
 * 相同内容 (忽略 sourceHash/confirmedBy/createdAt 与 key 顺序) → 相同 hash。
 */
export async function hashHandoffContent(input: unknown): Promise<string> {
  const canonical = canonicalize(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hashHex}`;
}

/** 同步版本 (使用 node:crypto，测试与 Node 运行时用)。 */
export function hashHandoffContentSync(input: unknown): string {
  const canonical = canonicalize(input);
  const hash = createHash("sha256").update(canonical).digest("hex");
  return `sha256:${hash}`;
}
