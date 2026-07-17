/**
 * KM-G0-002C — Supabase Storage / PostgREST 薄客户端。
 *
 * 所有 HTTP 经注入的 fetch 实现发出（与 lib/compliance/log-writer.ts 的
 * sink 注入同一模式）：生产用注入 serviceFetch，测试用内存假实现，
 * 模块本身不 import 任何项目服务端单例。
 */

import { ReleaseError } from "./types.ts";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface StorageClient {
  uploadObject(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  downloadObject(bucket: string, path: string): Promise<Uint8Array>;
  deleteObjects(bucket: string, paths: string[]): Promise<void>;
  listObjects(bucket: string, prefix: string): Promise<Array<{ name: string; created_at?: string }>>;
  signObjectUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
}

export interface RestClient {
  /** Prefer: resolution=ignore-duplicates — 冲突时返回 null（由调用方读回胜者行）。 */
  insertRow(table: string, row: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  updateRow(table: string, matchColumn: string, matchValue: string, patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  getRow(table: string, query: string): Promise<Record<string, unknown> | null>;
  getRows(table: string, query: string): Promise<Array<Record<string, unknown>>>;
}

async function expectOk(response: Response, code: string, action: string): Promise<Response> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ReleaseError(code, `${action} failed: HTTP ${response.status} ${body.slice(0, 200)}`);
  }
  return response;
}

/** 基于注入 fetch 的 Storage 客户端。baseUrl 形如 `${SUPABASE_URL}/storage/v1`。 */
export function createStorageClient(baseUrl: string, fetchImpl: FetchLike): StorageClient {
  return {
    async uploadObject(bucket, path, bytes, contentType) {
      const response = await fetchImpl(`${baseUrl}/object/${bucket}/${path}`, {
        method: "POST",
        headers: { "Content-Type": contentType, "x-upsert": "false" },
        body: bytes as unknown as BodyInit,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        // 内容寻址 key 的重放冲突由调用方按幂等成功处理
        if (response.status === 409 || /already exists|duplicate/i.test(body)) {
          throw new ReleaseError("STORAGE_OBJECT_EXISTS", `${bucket}/${path} already exists`);
        }
        throw new ReleaseError("STORAGE_UPLOAD_FAILED", `upload ${bucket}/${path}: HTTP ${response.status} ${body.slice(0, 200)}`);
      }
    },

    async downloadObject(bucket, path) {
      const response = await fetchImpl(`${baseUrl}/object/${bucket}/${path}`, { method: "GET" });
      await expectOk(response, "STORAGE_DOWNLOAD_FAILED", `download ${bucket}/${path}`);
      return new Uint8Array(await response.arrayBuffer());
    },

    async deleteObjects(bucket, paths) {
      if (paths.length === 0) return;
      const response = await fetchImpl(`${baseUrl}/object/delete/${bucket}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      });
      await expectOk(response, "STORAGE_DELETE_FAILED", `delete ${bucket} ×${paths.length}`);
    },

    async listObjects(bucket, prefix) {
      const response = await fetchImpl(`${baseUrl}/object/list/${bucket}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 1000 }),
      });
      await expectOk(response, "STORAGE_LIST_FAILED", `list ${bucket}/${prefix}`);
      return (await response.json()) as Array<{ name: string; created_at?: string }>;
    },

    async signObjectUrl(bucket, path, expiresInSeconds) {
      const response = await fetchImpl(`${baseUrl}/object/sign/${bucket}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      });
      await expectOk(response, "STORAGE_SIGN_FAILED", `sign ${bucket}/${path}`);
      const payload = (await response.json()) as { signedURL?: string; signedUrl?: string };
      const signed = payload.signedURL ?? payload.signedUrl;
      if (!signed) throw new ReleaseError("STORAGE_SIGN_FAILED", "sign response missing signedURL");
      return signed.startsWith("http") ? signed : `${baseUrl.replace(/\/storage\/v1$/, "")}/storage/v1${signed}`;
    },
  };
}

/** 基于注入 fetch 的 PostgREST 客户端。baseUrl 形如 `${SUPABASE_URL}/rest/v1`。 */
export function createRestClient(baseUrl: string, fetchImpl: FetchLike): RestClient {
  return {
    async insertRow(table, row) {
      const response = await fetchImpl(`${baseUrl}/${table}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation,resolution=ignore-duplicates" },
        body: JSON.stringify(row),
      });
      await expectOk(response, "DB_INSERT_FAILED", `insert ${table}`);
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      return rows[0] ?? null;
    },

    async updateRow(table, matchColumn, matchValue, patch) {
      const response = await fetchImpl(`${baseUrl}/${table}?${matchColumn}=eq.${encodeURIComponent(matchValue)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(patch),
      });
      await expectOk(response, "DB_UPDATE_FAILED", `update ${table}`);
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      if (!rows[0]) throw new ReleaseError("DB_UPDATE_FAILED", `update ${table}: no row matched`);
      return rows[0];
    },

    async getRow(table, query) {
      const response = await fetchImpl(`${baseUrl}/${table}?${query}`, { method: "GET" });
      await expectOk(response, "DB_READ_FAILED", `read ${table}`);
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      return rows[0] ?? null;
    },

    async getRows(table, query) {
      const response = await fetchImpl(`${baseUrl}/${table}?${query}`, { method: "GET" });
      await expectOk(response, "DB_READ_FAILED", `read ${table}`);
      return (await response.json()) as Array<Record<string, unknown>>;
    },
  };
}
