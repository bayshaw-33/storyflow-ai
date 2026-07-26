/**
 * TRAE-V2-07 Production Package 与资产清单
 * Manifest 生成与哈希计算
 *
 * 规则：
 *   - 每个文件用 SHA-256 计算 hash
 *   - manifest.packageHash = SHA-256(所有 entry 的 hash 串联)
 *   - missing 文件不创建空内容，hash 为空字符串
 *   - 失败项不能伪造空文件
 */

import { createHash } from "node:crypto";
import type {
  ManifestEntry,
  ProductionManifest,
} from "./types";

// ============================================================
// 哈希工具
// ============================================================

export function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * 计算整包 hash
 * 输入：所有 entries 按 path 排序后的 hash 串联
 * 输出：SHA-256 hex
 */
export function computePackageHash(entries: ManifestEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const concat = sorted.map((e) => `${e.path}:${e.hash}`).join("\n");
  return sha256Hex(concat);
}

// ============================================================
// Manifest Entry 构造
// ============================================================

export function okEntry(path: string, content: string): ManifestEntry {
  return {
    path,
    hash: sha256Hex(content),
    size: Buffer.byteLength(content, "utf8"),
    status: "ok",
  };
}

export function missingEntry(path: string, reason: string): ManifestEntry {
  return {
    path,
    hash: "",
    size: 0,
    status: "missing",
    reason,
  };
}

export function emptyEntry(path: string, reason: string): ManifestEntry {
  return {
    path,
    hash: sha256Hex(""),
    size: 0,
    status: "empty",
    reason,
  };
}

export function failedEntry(path: string, reason: string): ManifestEntry {
  return {
    path,
    hash: "",
    size: 0,
    status: "failed",
    reason,
  };
}

// ============================================================
// Manifest 装配
// ============================================================

export function buildManifest(params: {
  projectId: string;
  sourceUnitId: string;
  universeId: string | null;
  productionProjectId: string | null;
  exportedByUserId: string;
  entries: ManifestEntry[];
}): ProductionManifest {
  const summary = {
    totalFiles: params.entries.length,
    okFiles: params.entries.filter((e) => e.status === "ok").length,
    missingFiles: params.entries.filter((e) => e.status === "missing").length,
    failedFiles: params.entries.filter((e) => e.status === "failed").length,
  };

  return {
    schemaVersion: "kiikis.production-package/1",
    exportedAt: new Date().toISOString(),
    exportedBy: params.exportedByUserId.slice(0, 8),
    projectId: params.projectId,
    sourceUnitId: params.sourceUnitId,
    universeId: params.universeId,
    productionProjectId: params.productionProjectId,
    entries: params.entries,
    packageHash: computePackageHash(params.entries),
    summary,
    redacted: {
      apiKeys: true,
      providerRawErrors: true,
      signedUrls: true,
    },
  };
}
