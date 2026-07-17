/**
 * KM-G0-002C — 导出 artifact 发布链状态机。
 *
 * 链路：stage (private quarantine) → promote (immutable, content-addressed)
 *       → bind (atomic DB bind) → signDownload (gated, short-lived)
 * 补偿：rollback (staged / bind_failed) · sweepOrphans (孤儿 staging 收敛)
 *
 * 不变量：
 *   1. 先写对象存储，后写数据库；DB 失败 → 尽力清理刚上传的对象。
 *   2. final key = <owner>/artifacts/<sha256>：内容寻址、不可变、天然幂等。
 *   3. sha256 一律服务端计算；客户端提交的 hash 仅作参考存入 metadata.client_sha256。
 *   4. 同一 (owner, idempotency_key) 重放返回同一 artifact，不重复上传/绑定。
 *   5. released 不可变：修复 = 发布新 artifact；rollback 只覆盖 staged/bind_failed。
 */

import { randomUUID } from "node:crypto";

import { sha256Hex } from "../compliance/manifest.ts";
import type { RestClient, StorageClient } from "./storage-rest.ts";
import {
  ARTIFACTS_BUCKET,
  DEFAULT_DOWNLOAD_TTL_SECONDS,
  MAX_DOWNLOAD_TTL_SECONDS,
  QUARANTINE_BUCKET,
  ReleaseError,
  STAGING_ORPHAN_AFTER_MS,
} from "./types.ts";
import type {
  ExportArtifactRow,
  ReleaseInput,
  SignDownloadInput,
  SignedDownload,
  StageInput,
  SweepResult,
} from "./types.ts";

export interface ReleaseStore {
  storage: StorageClient;
  rest: RestClient;
  now?: () => Date;
}

const TABLE = "storyflow_export_artifacts";

function nowIso(store: ReleaseStore): string {
  return (store.now?.() ?? new Date()).toISOString();
}

async function getArtifact(store: ReleaseStore, artifactId: string, ownerId: string): Promise<ExportArtifactRow> {
  const row = await store.rest.getRow(
    TABLE,
    `id=eq.${encodeURIComponent(artifactId)}&owner_id=eq.${encodeURIComponent(ownerId)}`,
  );
  if (!row) throw new ReleaseError("ARTIFACT_NOT_FOUND", `${artifactId} (owner ${ownerId})`);
  return row as unknown as ExportArtifactRow;
}

/** 尽力而为的清理：永不抛出（孤儿由 sweeper 兜底）。 */
async function bestEffortDelete(store: ReleaseStore, bucket: string, paths: string[]): Promise<void> {
  try {
    await store.storage.deleteObjects(bucket, paths);
  } catch {
    // orphan objects are converged by sweepOrphans()
  }
}

/**
 * Stage：上传私有隔离区 → 插入 artifact 行（status=staged）。
 * 幂等：同 (ownerId, idempotencyKey) 重放 → 返回既有行，不重复上传。
 */
export async function stage(input: StageInput, store: ReleaseStore): Promise<ExportArtifactRow> {
  if (input.bytes.byteLength === 0) throw new ReleaseError("EMPTY_PAYLOAD", "artifact bytes must be non-empty");
  const sha256 = sha256Hex(input.bytes);
  const stagingPath = `${input.ownerId}/staging/${randomUUID()}-${sha256.slice(0, 12)}`;

  const existing = (await store.rest.getRow(
    TABLE,
    `owner_id=eq.${encodeURIComponent(input.ownerId)}&idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}`,
  )) as unknown as ExportArtifactRow | null;
  if (existing) return existing;

  // 1. 先写对象存储（x-upsert=false，staging 对象永不覆盖）
  await store.storage.uploadObject(
    QUARANTINE_BUCKET,
    stagingPath,
    input.bytes,
    input.contentType ?? "application/octet-stream",
  );

  // 2. 后写数据库；冲突（并发同键）→ 读回既有行并清理本次上传
  const inserted = await store.rest.insertRow(TABLE, {
    owner_id: input.ownerId,
    idempotency_key: input.idempotencyKey,
    status: "staged",
    sha256,
    byte_length: input.bytes.byteLength,
    content_type: input.contentType ?? "application/octet-stream",
    staging_bucket: QUARANTINE_BUCKET,
    staging_path: stagingPath,
    quarantine_source: input.source ?? "provider",
    metadata: input.metadata ?? {},
  });
  if (!inserted) {
    await bestEffortDelete(store, QUARANTINE_BUCKET, [stagingPath]);
    const winner = (await store.rest.getRow(
      TABLE,
      `owner_id=eq.${encodeURIComponent(input.ownerId)}&idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}`,
    )) as unknown as ExportArtifactRow | null;
    if (winner) return winner;
    throw new ReleaseError("DB_INSERT_FAILED", "idempotency conflict but no existing row readable");
  }
  return inserted as unknown as ExportArtifactRow;
}

/**
 * Promote：staging → final（内容寻址 key），更新行，删 staging。
 * 幂等：已 released → 直接返回；final 已存在（同 sha256 同 key）→ 复制安全重放。
 */
export async function promote(artifactId: string, ownerId: string, store: ReleaseStore): Promise<ExportArtifactRow> {
  const row = await getArtifact(store, artifactId, ownerId);
  if (row.status === "released") return row;
  if (row.status !== "staged" && row.status !== "bind_failed") {
    throw new ReleaseError("INVALID_STATE", `cannot promote from status ${row.status}`);
  }

  const finalKey = `${ownerId}/artifacts/${row.sha256}`;
  if (!row.final_key) {
    // 跨桶 promote = 读 quarantine 字节 → 写 artifacts（内容寻址 key）。
    // key 即内容 sha256：STORAGE_OBJECT_EXISTS 意味着同一内容已在正式区，按幂等成功处理。
    const bytes = await store.storage.downloadObject(row.staging_bucket, row.staging_path);
    try {
      await store.storage.uploadObject(ARTIFACTS_BUCKET, finalKey, bytes, row.content_type);
    } catch (error) {
      if (!(error instanceof ReleaseError && error.code === "STORAGE_OBJECT_EXISTS")) throw error;
    }
  }

  const updated = await store.rest.updateRow(TABLE, "id", row.id, {
    final_bucket: ARTIFACTS_BUCKET,
    final_key: finalKey,
    updated_at: nowIso(store),
  });

  // staging 已完成使命；删除失败由 sweeper 收敛
  await bestEffortDelete(store, QUARANTINE_BUCKET, [row.staging_path]);
  return updated as unknown as ExportArtifactRow;
}

/** Bind：把已 promote 的 artifact 原子绑定到 export 记录（status=released）。 */
export async function bind(input: ReleaseInput, store: ReleaseStore): Promise<ExportArtifactRow> {
  const row = await getArtifact(store, input.artifactId, input.ownerId);
  if (row.status === "released") {
    if (row.bound_export_id === input.exportId) return row;
    throw new ReleaseError("ALREADY_BOUND", `artifact bound to ${row.bound_export_id}`);
  }
  if (!row.final_key) throw new ReleaseError("INVALID_STATE", "bind requires promote first");

  try {
    const updated = await store.rest.updateRow(TABLE, "id", row.id, {
      status: "released",
      bound_export_id: input.exportId,
      label_record_id: input.labelRecordId ?? row.label_record_id,
      updated_at: nowIso(store),
    });
    return updated as unknown as ExportArtifactRow;
  } catch (error) {
    // 绑定失败：final 保留供重试；行状态标记 bind_failed（尽力）
    try {
      await store.rest.updateRow(TABLE, "id", row.id, { status: "bind_failed", updated_at: nowIso(store) });
    } catch {
      // even the marker failed; row stays staged — safe to retry
    }
    throw error instanceof ReleaseError ? error : new ReleaseError("BIND_FAILED", String(error));
  }
}

/** Release = promote + bind（卡片定义的完整发布动作）。 */
export async function release(input: ReleaseInput, store: ReleaseStore): Promise<ExportArtifactRow> {
  await promote(input.artifactId, input.ownerId, store);
  return bind(input, store);
}

/**
 * Rollback：仅覆盖未完成发布（staged / bind_failed）。
 * staged → 删 staging；bind_failed → 删 final。released 不可回滚（不可变发布）。
 */
export async function rollback(artifactId: string, ownerId: string, store: ReleaseStore): Promise<ExportArtifactRow> {
  const row = await getArtifact(store, artifactId, ownerId);
  if (row.status === "staged") {
    await bestEffortDelete(store, QUARANTINE_BUCKET, [row.staging_path]);
  } else if (row.status === "bind_failed") {
    if (row.final_bucket && row.final_key) await bestEffortDelete(store, row.final_bucket, [row.final_key]);
  } else {
    throw new ReleaseError("INVALID_STATE", `cannot rollback status ${row.status}`);
  }
  const updated = await store.rest.updateRow(TABLE, "id", row.id, {
    status: "rolled_back",
    updated_at: nowIso(store),
  });
  return updated as unknown as ExportArtifactRow;
}

/**
 * Gated short-lived download：owner 校验 + authorize 钩子 + ≤300s 签名 URL。
 */
export async function signDownload(input: SignDownloadInput, store: ReleaseStore): Promise<SignedDownload> {
  const row = await getArtifact(store, input.artifactId, input.requesterId).catch(async (error) => {
    if (error instanceof ReleaseError && error.code === "ARTIFACT_NOT_FOUND") {
      // 统一口径：非 owner 与不存在一样，不泄露存在性
      throw new ReleaseError("DOWNLOAD_FORBIDDEN", "artifact not accessible");
    }
    throw error;
  });
  if (row.owner_id !== input.requesterId) throw new ReleaseError("DOWNLOAD_FORBIDDEN", "not the artifact owner");
  if (row.status !== "released" || !row.final_bucket || !row.final_key) {
    throw new ReleaseError("DOWNLOAD_NOT_RELEASED", `artifact status is ${row.status}`);
  }
  if (input.authorize && !(await input.authorize(row))) {
    throw new ReleaseError("DOWNLOAD_FORBIDDEN", "authorize hook rejected the download");
  }
  const ttl = Math.max(1, Math.min(input.ttlSeconds ?? DEFAULT_DOWNLOAD_TTL_SECONDS, MAX_DOWNLOAD_TTL_SECONDS));
  const url = await store.storage.signObjectUrl(row.final_bucket, row.final_key, ttl);
  return { url, expiresIn: ttl, artifact: row };
}

/**
 * 孤儿清理：quarantine 中超过阈值的 staging 对象删除；
 * 对应 staged 行且 staging 已不存在的 → status=cleaned。
 */
export async function sweepOrphans(ownerId: string, store: ReleaseStore, olderThanMs = STAGING_ORPHAN_AFTER_MS): Promise<SweepResult> {
  const result: SweepResult = { sweptObjects: 0, markedCleaned: 0, errors: [] };
  const cutoff = (store.now?.() ?? new Date()).getTime() - olderThanMs;

  const objects = await store.storage.listObjects(QUARANTINE_BUCKET, `${ownerId}/staging/`);
  const stale = objects.filter((object) => {
    if (!object.created_at) return false;
    const created = Date.parse(object.created_at);
    return Number.isFinite(created) && created < cutoff;
  });
  if (stale.length > 0) {
    try {
      await store.storage.deleteObjects(QUARANTINE_BUCKET, stale.map((object) => `${ownerId}/staging/${object.name}`));
      result.sweptObjects = stale.length;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const staleRows = await store.rest.getRows(
    TABLE,
    `owner_id=eq.${encodeURIComponent(ownerId)}&status=eq.staged&created_at=lt.${encodeURIComponent(new Date(cutoff).toISOString())}`,
  );
  const remaining = new Set(objects.filter((o) => !stale.includes(o)).map((o) => `${ownerId}/staging/${o.name}`));
  for (const raw of staleRows) {
    const row = raw as unknown as ExportArtifactRow;
    if (remaining.has(row.staging_path)) continue; // 对象仍在 → 由调用方继续 release，不动
    try {
      await store.rest.updateRow(TABLE, "id", row.id, { status: "cleaned", updated_at: nowIso(store) });
      result.markedCleaned += 1;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return result;
}
