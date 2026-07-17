/**
 * KM-G0-002C 发布链测试：stage → promote → bind → signDownload + rollback/sweep。
 * 内存假后端模拟 Supabase Storage/PostgREST，含失败注入（部分失败补偿验证）。
 * 运行：node tests/export-release.test.mjs
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { sha256Hex } from "../lib/compliance/manifest.ts";
import { createRestClient, createStorageClient } from "../lib/release/storage-rest.ts";
import { bind, promote, release, rollback, signDownload, stage, sweepOrphans } from "../lib/release/release.ts";
import { ReleaseError } from "../lib/release/types.ts";

const OWNER = "user-owner-1";
const OTHER = "user-owner-2";
const TABLE = "storyflow_export_artifacts";

// ---------- 内存假后端 ----------

function makeBackend() {
  const objects = new Map(); // "bucket/path" -> { bytes, contentType, createdAt }
  const rows = new Map(); // id -> row
  const failures = []; // { predicate, status, body } —— 命中即消费一次
  const counts = { uploads: 0, downloads: 0, signs: 0, deletes: 0 };

  const json = (payload, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

  const parseQuery = (query) =>
    (query ?? "").split("&").filter(Boolean).map((part) => {
      const [col, rest] = part.split("=", 2);
      const [op, ...valueParts] = rest.split(".");
      return { col, op, value: decodeURIComponent(valueParts.join(".")) };
    });

  const matchRows = (query) => {
    const conds = parseQuery(query);
    return [...rows.values()].filter((row) =>
      conds.every(({ col, op, value }) => {
        if (op === "eq") return String(row[col]) === value;
        if (op === "lt") return String(row[col]) < value;
        return false;
      }),
    );
  };

  const fetchImpl = async (url, init = {}) => {
    const method = init.method ?? "GET";
    for (let i = 0; i < failures.length; i += 1) {
      if (failures[i].predicate(method, url)) {
        const [{ status, body }] = failures.splice(i, 1);
        return new Response(body, { status });
      }
    }

    if (url.startsWith("mem://storage/object/")) {
      const rest = url.slice("mem://storage/object/".length);
      if (rest.startsWith("delete/")) {
        const bucket = rest.slice("delete/".length);
        const { prefixes } = JSON.parse(init.body);
        for (const p of prefixes) objects.delete(`${bucket}/${p}`);
        counts.deletes += prefixes.length;
        return json({});
      }
      if (rest.startsWith("list/")) {
        const bucket = rest.slice("list/".length);
        const { prefix } = JSON.parse(init.body);
        const out = [];
        for (const [key, value] of objects) {
          if (!key.startsWith(`${bucket}/${prefix}`)) continue;
          const name = key.slice(`${bucket}/${prefix}`.length);
          if (name.includes("/")) continue;
          out.push({ name, created_at: value.createdAt });
        }
        return json(out);
      }
      if (rest.startsWith("sign/")) {
        const [, bucket, ...pathParts] = rest.match(/^sign\/([^/]+)\/(.+)$/);
        const path = pathParts.join("/");
        if (!objects.has(`${bucket}/${path}`)) return json({ error: "not found" }, 404);
        counts.signs += 1;
        return json({ signedURL: `/object/sign/${bucket}/${path}?token=tok-${counts.signs}` });
      }
      const slash = rest.indexOf("/");
      const bucket = rest.slice(0, slash);
      const path = rest.slice(slash + 1);
      if (method === "POST") {
        if (objects.has(`${bucket}/${path}`) && init.headers?.["x-upsert"] === "false") {
          return new Response("The resource already exists", { status: 400 });
        }
        objects.set(`${bucket}/${path}`, {
          bytes: new Uint8Array(init.body),
          contentType: init.headers?.["Content-Type"] ?? "application/octet-stream",
          createdAt: new Date().toISOString(),
        });
        counts.uploads += 1;
        return json({ Key: `${bucket}/${path}` });
      }
      if (method === "GET") {
        const hit = objects.get(`${bucket}/${path}`);
        if (!hit) return json({ error: "not found" }, 404);
        counts.downloads += 1;
        return new Response(hit.bytes, { status: 200 });
      }
    }

    if (url.startsWith("mem://rest/")) {
      const withoutBase = url.slice("mem://rest/".length);
      const [table, query] = withoutBase.split("?", 2);
      assert.equal(table, TABLE);
      if (method === "POST") {
        const row = JSON.parse(init.body);
        for (const existing of rows.values()) {
          if (existing.owner_id === row.owner_id && existing.idempotency_key === row.idempotency_key) {
            return json([]); // resolution=ignore-duplicates
          }
        }
        const stored = {
          id: row.id ?? randomUUID(),
          created_at: row.created_at ?? new Date().toISOString(),
          updated_at: row.updated_at ?? new Date().toISOString(),
          final_bucket: null,
          final_key: null,
          bound_export_id: null,
          label_record_id: null,
          metadata: {},
          ...row,
        };
        rows.set(stored.id, stored);
        return json([structuredClone(stored)]);
      }
      if (method === "PATCH") {
        const found = matchRows(query);
        if (found.length === 0) return json([]);
        const patch = JSON.parse(init.body);
        Object.assign(found[0], patch);
        return json([structuredClone(found[0])]);
      }
      if (method === "GET") return json(matchRows(query).map((r) => structuredClone(r)));
    }

    return json({ error: `unhandled ${method} ${url}` }, 500);
  };

  return {
    fetchImpl,
    objects,
    rows,
    counts,
    queueFailure(predicate, status = 500, body = "injected failure") {
      failures.push({ predicate, status, body });
    },
    putObject(bucket, path, bytes, createdAt) {
      objects.set(`${bucket}/${path}`, { bytes, contentType: "application/octet-stream", createdAt });
    },
  };
}

function makeStore(backend) {
  return {
    storage: createStorageClient("mem://storage", backend.fetchImpl),
    rest: createRestClient("mem://rest", backend.fetchImpl),
  };
}

const BYTES = new TextEncoder().encode("KIIKIS release-chain payload v1");
const BYTES_2 = new TextEncoder().encode("KIIKIS release-chain payload v2");

// ---------- 测试 ----------

test("happy chain: stage → release(promote+bind) → gated signDownload", async () => {
  const backend = makeBackend();
  const store = makeStore(backend);

  const staged = await stage(
    { ownerId: OWNER, idempotencyKey: "exp-1", bytes: BYTES, contentType: "video/mp4", metadata: { client_sha256: "deadbeef" } },
    store,
  );
  assert.equal(staged.status, "staged");
  assert.equal(staged.sha256, sha256Hex(BYTES), "sha256 必须服务端计算，不采信 client_sha256");
  assert.equal(staged.staging_bucket, "export-quarantine");
  assert.ok(backend.objects.has(`export-quarantine/${staged.staging_path}`), "staging 对象已写入隔离区");

  const released = await release({ artifactId: staged.id, ownerId: OWNER, exportId: "export-100" }, store);
  assert.equal(released.status, "released");
  assert.equal(released.bound_export_id, "export-100");
  assert.equal(released.final_key, `${OWNER}/artifacts/${sha256Hex(BYTES)}`);
  assert.ok(backend.objects.has(`export-artifacts/${released.final_key}`), "final 对象已就位");
  assert.ok(!backend.objects.has(`export-quarantine/${staged.staging_path}`), "staging 已清理");

  const signed = await signDownload({ artifactId: staged.id, requesterId: OWNER, ttlSeconds: 60 }, store);
  assert.equal(signed.expiresIn, 60);
  assert.match(signed.url, /export-artifacts/);
  assert.match(signed.url, /token=/);
});

test("idempotent stage: 同 idempotencyKey 重放返回同一 artifact，不重复上传", async () => {
  const backend = makeBackend();
  const store = makeStore(backend);
  const first = await stage({ ownerId: OWNER, idempotencyKey: "exp-1", bytes: BYTES }, store);
  const second = await stage({ ownerId: OWNER, idempotencyKey: "exp-1", bytes: BYTES_2 }, store);
  assert.equal(second.id, first.id);
  assert.equal(second.sha256, first.sha256);
  assert.equal(backend.counts.uploads, 1);
});

test("idempotent release 重放：重复 release 不产生副作用", async () => {
  const backend = makeBackend();
  const store = makeStore(backend);
  const staged = await stage({ ownerId: OWNER, idempotencyKey: "exp-1", bytes: BYTES }, store);
  const r1 = await release({ artifactId: staged.id, ownerId: OWNER, exportId: "e-1" }, store);
  const uploadsAfterFirst = backend.counts.uploads;
  const r2 = await release({ artifactId: staged.id, ownerId: OWNER, exportId: "e-1" }, store);
  assert.equal(r2.id, r1.id);
  assert.equal(r2.status, "released");
  assert.equal(backend.counts.uploads, uploadsAfterFirst);
});

test("内容寻址不可变：两个 artifact 同字节 → 同一 final_key，正式区仅一份", async () => {
  const backend = makeBackend();
  const store = makeStore(backend);
  const a = await stage({ ownerId: OWNER, idempotencyKey: "exp-a", bytes: BYTES }, store);
  const b = await stage({ ownerId: OWNER, idempotencyKey: "exp-b", bytes: BYTES }, store);
  const ra = await release({ artifactId: a.id, ownerId: OWNER, exportId: "e-a" }, store);
  const rb = await release({ artifactId: b.id, ownerId: OWNER, exportId: "e-b" }, store);
  assert.equal(ra.final_key, rb.final_key);
  const finalObjects = [...backend.objects.keys()].filter((k) => k.startsWith("export-artifacts/"));
  assert.equal(finalObjects.length, 1);
});

test("bind 冲突：已 released 的 artifact 不得绑定到另一个 export", async () => {
  const backend = makeBackend();
  const store = makeStore(backend);
  const staged = await stage({ ownerId: OWNER, idempotencyKey: "exp-1", bytes: BYTES }, store);
  await release({ artifactId: staged.id, ownerId: OWNER, exportId: "e-1" }, store);
  await assert.rejects(
    () => bind({ artifactId: staged.id, ownerId: OWNER, exportId: "e-2" }, store),
    (error) => error instanceof ReleaseError && error.code === "ALREADY_BOUND",
  );
});

test("部分失败：bind DB 写失败 → bind_failed + final 保留可重试；rollback 删除 final", async () => {
  const backend = makeBackend();
  const store = makeStore(backend);
  const staged = await stage({ ownerId: OWNER, idempotencyKey: "exp-1", bytes: BYTES }, store);
  await promote(staged.id, OWNER, store);
  const finalKey = `${OWNER}/artifacts/${sha256Hex(BYTES)}`;
  assert.ok(backend.objects.has(`export-artifacts/${finalKey}`));

  backend.queueFailure((method, url) => method === "PATCH" && url.includes(TABLE));
  await assert.rejects(() => bind({ artifactId: staged.id, ownerId: OWNER, exportId: "e-1" }, store));
  const failedRow = [...backend.rows.values()][0];
  assert.equal(failedRow.status, "bind_failed");
  assert.ok(backend.objects.has(`export-artifacts/${finalKey}`), "final 保留，可重试 bind");

  const rebound = await bind({ artifactId: staged.id, ownerId: OWNER, exportId: "e-1" }, store);
  assert.equal(rebound.status, "released", "故障恢复后 bind 重试成功");
});

test("rollback：bind_failed 回滚删除 final；staged 回滚删除 staging；released 拒绝回滚", async () => {
  const backend = makeBackend();
  const store = makeStore(backend);

  const s1 = await stage({ ownerId: OWNER, idempotencyKey: "exp-1", bytes: BYTES }, store);
  const rolled = await rollback(s1.id, OWNER, store);
  assert.equal(rolled.status, "rolled_back");
  assert.ok(!backend.objects.has(`export-quarantine/${s1.staging_path}`));

  const s2 = await stage({ ownerId: OWNER, idempotencyKey: "exp-2", bytes: BYTES }, store);
  await promote(s2.id, OWNER, store);
  backend.queueFailure((method, url) => method === "PATCH" && url.includes(TABLE));
  await assert.rejects(() => bind({ artifactId: s2.id, ownerId: OWNER, exportId: "e-2" }, store));
  const rolled2 = await rollback(s2.id, OWNER, store);
  assert.equal(rolled2.status, "rolled_back");
  assert.ok(![...backend.objects.keys()].some((k) => k.startsWith("export-artifacts/")), "final 已删除");

  const s3 = await stage({ ownerId: OWNER, idempotencyKey: "exp-3", bytes: BYTES }, store);
  await release({ artifactId: s3.id, ownerId: OWNER, exportId: "e-3" }, store);
  await assert.rejects(
    () => rollback(s3.id, OWNER, store),
    (error) => error instanceof ReleaseError && error.code === "INVALID_STATE",
  );
});

test("download 门控：非 owner 拒签 / 未 released 拒签 / authorize 否决 / TTL 封顶 300s", async () => {
  const backend = makeBackend();
  const store = makeStore(backend);
  const staged = await stage({ ownerId: OWNER, idempotencyKey: "exp-1", bytes: BYTES }, store);

  await assert.rejects(
    () => signDownload({ artifactId: staged.id, requesterId: OWNER }, store),
    (error) => error instanceof ReleaseError && error.code === "DOWNLOAD_NOT_RELEASED",
  );

  await release({ artifactId: staged.id, ownerId: OWNER, exportId: "e-1" }, store);

  await assert.rejects(
    () => signDownload({ artifactId: staged.id, requesterId: OTHER }, store),
    (error) => error instanceof ReleaseError && error.code === "DOWNLOAD_FORBIDDEN",
  );
  await assert.rejects(
    () => signDownload({ artifactId: staged.id, requesterId: OWNER, authorize: async () => false }, store),
    (error) => error instanceof ReleaseError && error.code === "DOWNLOAD_FORBIDDEN",
  );

  const clamped = await signDownload({ artifactId: staged.id, requesterId: OWNER, ttlSeconds: 9999 }, store);
  assert.equal(clamped.expiresIn, 300);
  const withHook = await signDownload({ artifactId: staged.id, requesterId: OWNER, authorize: async (row) => row.bound_export_id === "e-1" }, store);
  assert.ok(withHook.url.length > 0);
});

test("sweepOrphans：超期 staging 对象删除；对象缺失的 staged 行标记 cleaned", async () => {
  const backend = makeBackend();
  const store = makeStore(backend);
  const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  // 超期 staging 对象（无对应行）
  backend.putObject("export-quarantine", `${OWNER}/staging/old-obj-1`, BYTES, old);
  // 超期 staged 行且 staging 对象缺失
  await store.rest.insertRow(TABLE, {
    owner_id: OWNER,
    idempotency_key: "stale-row",
    status: "staged",
    sha256: sha256Hex(BYTES),
    byte_length: BYTES.length,
    content_type: "application/octet-stream",
    staging_bucket: "export-quarantine",
    staging_path: `${OWNER}/staging/missing-obj`,
    quarantine_source: "provider",
    metadata: {},
    created_at: old,
  });
  // 新鲜 staged 行 + 对象（不应被动）
  const fresh = await stage({ ownerId: OWNER, idempotencyKey: "fresh", bytes: BYTES_2 }, store);

  const result = await sweepOrphans(OWNER, store);
  assert.equal(result.sweptObjects, 1);
  assert.equal(result.markedCleaned, 1);
  assert.deepEqual(result.errors, []);
  assert.ok(!backend.objects.has(`export-quarantine/${OWNER}/staging/old-obj-1`));
  assert.ok(backend.objects.has(`export-quarantine/${fresh.staging_path}`), "fresh staging 保留");
  const freshRow = [...backend.rows.values()].find((r) => r.id === fresh.id);
  assert.equal(freshRow.status, "staged");
});

test("空负载拒绝 stage", async () => {
  const backend = makeBackend();
  const store = makeStore(backend);
  await assert.rejects(
    () => stage({ ownerId: OWNER, idempotencyKey: "exp-0", bytes: new Uint8Array(0) }, store),
    (error) => error instanceof ReleaseError && error.code === "EMPTY_PAYLOAD",
  );
});

test("stage 上传后 DB 插入失败传播；孤儿由 sweeper 语义兜底", async () => {
  const backend = makeBackend();
  const store = makeStore(backend);
  backend.queueFailure((method, url) => method === "POST" && url.startsWith("mem://rest/"));
  await assert.rejects(
    () => stage({ ownerId: OWNER, idempotencyKey: "exp-x", bytes: BYTES }, store),
    (error) => error instanceof ReleaseError && error.code === "DB_INSERT_FAILED",
  );
  // 对象已上传（先存储后 DB 的必然窗口），sweeper 负责后续收敛
  assert.equal(backend.counts.uploads, 1);
});
