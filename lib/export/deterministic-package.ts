/**
 * KIIKIS V2.2 确定性导出包 — Phase 5 Task 5.6.
 *
 * 同一输入 → 同一 manifestHash 与 sha256；媒体只从持久 storagePath 引用
 * （Provider 临时 URL 绝不进包）；manifest 可反查每个成果的来源。
 * 独立文件（无 @/ 别名依赖），供 node --test 直接测试。
 */

import { createHash } from "node:crypto";

export interface DeterministicPackageInput {
  ownerId: string;
  projectId: string;
  works: Array<{ workType: string; workId: string; versionId: string; contentHash: string }>;
  artifacts: Array<{ path: string; storagePath: string; assetVersionId: string; jobId: string }>;
  now?: Date;
}

export interface DeterministicPackageArtifact {
  path: string;
  storagePath: string;
  assetVersionId: string;
  jobId: string;
}

export interface DeterministicPackage {
  manifestHash: string;
  package: {
    sha256: string;
    files: Array<{ path: string; content: string; mimeType: string }>;
  };
  artifacts: DeterministicPackageArtifact[];
}

export function buildDeterministicPackage(input: DeterministicPackageInput): DeterministicPackage {
  const now = (input.now ?? new Date()).toISOString();
  const works = [...input.works].sort((a, b) => a.workId.localeCompare(b.workId));
  const artifacts = [...input.artifacts].sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    schemaVersion: "kiikis.package/1",
    exportedAt: now,
    projectId: input.projectId,
    ownerId: input.ownerId,
    works: works.map((w) => ({ workType: w.workType, workId: w.workId, versionId: w.versionId, contentHash: w.contentHash })),
    artifacts: artifacts.map((a) => ({ path: a.path, storagePath: a.storagePath, assetVersionId: a.assetVersionId, jobId: a.jobId })),
  };
  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestHash = createHash("sha256").update(manifestJson).digest("hex");
  const files = [
    { path: "manifest.json", content: manifestJson, mimeType: "application/json" },
    ...artifacts.map((a) => ({ path: a.path, content: JSON.stringify({ storagePath: a.storagePath }), mimeType: "application/json" })),
  ];
  const sha256 = createHash("sha256")
    .update(files.map((f) => `${f.path}\n${f.content}`).join("\n---\n"))
    .digest("hex");
  return { manifestHash, package: { sha256, files }, artifacts };
}

export interface PackageManifestView {
  artifacts: Array<{ path: string; storagePath: string; assetVersionId: string; jobId: string }>;
  works: Array<{ workType: string; workId: string; versionId: string }>;
}

export function packageManifest(pkg: DeterministicPackage): PackageManifestView {
  const parsed = JSON.parse(pkg.package.files[0].content) as {
    artifacts: Array<{ path: string; storagePath: string; assetVersionId: string; jobId: string }>;
    works: Array<{ workType: string; workId: string; versionId: string }>;
  };
  return { artifacts: parsed.artifacts, works: parsed.works };
}

export function resolveArtifactOrigin(
  artifact: { path: string; assetVersionId: string; jobId: string },
  manifest: PackageManifestView,
): { workId: string; workVersionId: string; assetVersionId: string; jobId: string } {
  const work = manifest.works.find((w) => artifact.path.startsWith(`${w.workType}/`)) ?? manifest.works[0];
  return {
    workId: work?.workId ?? "unknown",
    workVersionId: work?.versionId ?? "unknown",
    assetVersionId: artifact.assetVersionId,
    jobId: artifact.jobId,
  };
}
