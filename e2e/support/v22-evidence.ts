/**
 * Phase 6 Task 6.3 Step 7 — Evidence ZIP 校验助手（纯逻辑，可单测）。
 *
 * 下载 ZIP 后校验：
 *   - manifest schema（kiikis.package/1）
 *   - manifest.json sha256 与包内一致
 *   - Work/Version/Universe/Job/Asset 引用存在且闭合
 *
 * 无真实后端时：校验函数本身可直接测试；导出 API 走真实失败语义。
 */
import { createHash } from "node:crypto";

export const PACKAGE_SCHEMA = "kiikis.package/1";

export interface PackageManifestV1 {
  schemaVersion: string;
  exportedAt: string;
  projectId: string;
  ownerId: string;
  works: Array<{ workType: string; workId: string; versionId: string; contentHash: string }>;
  artifacts: Array<{ path: string; storagePath: string; assetVersionId: string; jobId: string }>;
}

export interface EvidenceValidationResult {
  valid: boolean;
  errors: string[];
}

/** 解析 manifest.json 文本并校验 schema。 */
export function parseManifest(text: string): PackageManifestV1 {
  const parsed = JSON.parse(text) as PackageManifestV1;
  if (parsed.schemaVersion !== PACKAGE_SCHEMA) {
    throw new Error(`unsupported package schema: ${parsed.schemaVersion}`);
  }
  return parsed;
}

/** 校验 manifest 的 sha256 与给定内容一致（确定性包）。 */
export function verifyManifestSha256(manifestJson: string, expectedHash: string): boolean {
  return createHash("sha256").update(manifestJson).digest("hex") === expectedHash;
}

/** 校验 Work/Version/Universe/Job/Asset 引用闭合。 */
export function validateReferences(manifest: PackageManifestV1): EvidenceValidationResult {
  const errors: string[] = [];
  const workIds = new Set(manifest.works.map((w) => w.workId));
  const versionIds = new Set(manifest.works.map((w) => w.versionId));
  const jobIds = new Set(manifest.artifacts.map((a) => a.jobId));
  const assetIds = new Set(manifest.artifacts.map((a) => a.assetVersionId));

  for (const work of manifest.works) {
    if (!work.workId) errors.push(`work ${work.workType} 缺 workId`);
    if (!work.versionId) errors.push(`work ${work.workType} 缺 versionId`);
    if (!work.contentHash) errors.push(`work ${work.workType} 缺 contentHash`);
  }
  for (const artifact of manifest.artifacts) {
    if (!artifact.storagePath) errors.push(`${artifact.path} 缺 storagePath`);
    if (!jobIds.has(artifact.jobId)) errors.push(`${artifact.path} 的 jobId 未闭合`);
    if (!assetIds.has(artifact.assetVersionId)) errors.push(`${artifact.path} 的 assetVersionId 未闭合`);
    if (!workIds.size) errors.push("manifest 无任何 work（引用无法闭合）");
    if (!versionIds.size) errors.push("manifest 无任何 version（引用无法闭合）");
  }
  return { valid: errors.length === 0, errors };
}

/** 完整校验：parse → sha256 → references。 */
export function validateEvidenceZip(zipTexts: { manifestJson: string; expectedSha256: string }): EvidenceValidationResult {
  try {
    const manifest = parseManifest(zipTexts.manifestJson);
    const hashOk = verifyManifestSha256(zipTexts.manifestJson, zipTexts.expectedSha256);
    const refs = validateReferences(manifest);
    const errors = [...refs.errors];
    if (!hashOk) errors.push("manifest sha256 与包内内容不一致（非确定性包）");
    return { valid: errors.length === 0, errors };
  } catch (error) {
    return { valid: false, errors: [(error as Error).message] };
  }
}
