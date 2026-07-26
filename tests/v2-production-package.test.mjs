/**
 * TRAE-V2-07 Production Package
 * Manifest 哈希计算 + Entry 构造 + 容错策略测试
 *
 * PRD §10.1 单元/契约测试要求：哈希确定性、缺失素材标记、不伪造空文件
 *
 * 验证目标：
 *   1. sha256Hex 计算正确（与已知值对比）
 *   2. computePackageHash 排序后串联（确定性 + 顺序无关）
 *   3. okEntry / missingEntry / emptyEntry / failedEntry 构造
 *   4. buildManifest summary 统计正确
 *   5. missing entry hash 为空字符串（不伪造）
 *   6. failed entry hash 为空字符串
 *   7. empty entry hash = sha256("")
 *   8. redacted 标记固定为 true
 *   9. packageHash 与 entries 顺序无关
 *  10. exportedBy 脱敏（保留前 8 位）
 *
 * 运行：node --test tests/v2-production-package.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  sha256Hex,
  computePackageHash,
  okEntry,
  missingEntry,
  emptyEntry,
  failedEntry,
  buildManifest,
} from "../lib/export/manifest.ts";

const packageBuilderSource = readFileSync("lib/export/package-builder.ts", "utf8");

// ============================================================
// 1. sha256Hex 计算正确
// ============================================================

test("sha256Hex 空字符串返回已知哈希", () => {
  const result = sha256Hex("");
  const expected = createHash("sha256").update("", "utf8").digest("hex");
  assert.equal(result, expected);
  assert.equal(result, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("sha256Hex 'hello' 返回已知哈希", () => {
  const result = sha256Hex("hello");
  assert.equal(result, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

test("sha256Hex '中文' 返回 UTF-8 编码哈希", () => {
  const result = sha256Hex("中文");
  const expected = createHash("sha256").update("中文", "utf8").digest("hex");
  assert.equal(result, expected);
});

test("sha256Hex 相同输入产生相同输出（确定性）", () => {
  assert.equal(sha256Hex("test"), sha256Hex("test"));
});

// ============================================================
// 2. computePackageHash 排序后串联
// ============================================================

test("computePackageHash 按 path 排序后串联", () => {
  const entries = [
    { path: "z.json", hash: "hashZ", size: 100, status: "ok" },
    { path: "a.json", hash: "hashA", size: 50, status: "ok" },
    { path: "m.json", hash: "hashM", size: 75, status: "ok" },
  ];
  const result = computePackageHash(entries);
  // 期望：按 path 排序后 a.json:m.json:z.json 串联
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const concat = sorted.map((e) => `${e.path}:${e.hash}`).join("\n");
  const expected = sha256Hex(concat);
  assert.equal(result, expected);
});

test("computePackageHash 顺序无关（同一组 entries 任意顺序结果相同）", () => {
  const entries1 = [
    { path: "a.json", hash: "hashA", size: 50, status: "ok" },
    { path: "b.json", hash: "hashB", size: 60, status: "ok" },
    { path: "c.json", hash: "hashC", size: 70, status: "ok" },
  ];
  const entries2 = [
    { path: "c.json", hash: "hashC", size: 70, status: "ok" },
    { path: "a.json", hash: "hashA", size: 50, status: "ok" },
    { path: "b.json", hash: "hashB", size: 60, status: "ok" },
  ];
  assert.equal(computePackageHash(entries1), computePackageHash(entries2));
});

test("computePackageHash 空数组返回空字符串的哈希", () => {
  const result = computePackageHash([]);
  // 空数组 → concat = "" → sha256("")
  assert.equal(result, sha256Hex(""));
});

test("computePackageHash 单个 entry 计算正确", () => {
  const entries = [{ path: "only.json", hash: "hashOnly", size: 10, status: "ok" }];
  const result = computePackageHash(entries);
  const expected = sha256Hex("only.json:hashOnly");
  assert.equal(result, expected);
});

// ============================================================
// 3. okEntry 构造
// ============================================================

test("okEntry 生成正确的 hash + size + status", () => {
  const content = '{"key":"value"}';
  const entry = okEntry("test.json", content);
  assert.equal(entry.path, "test.json");
  assert.equal(entry.hash, sha256Hex(content));
  assert.equal(entry.size, Buffer.byteLength(content, "utf8"));
  assert.equal(entry.status, "ok");
  assert.ok(!entry.reason, "ok entry 不应有 reason");
});

test("okEntry 中文字节数按 UTF-8 计算", () => {
  const content = "你好"; // 6 bytes in UTF-8
  const entry = okEntry("cn.txt", content);
  assert.equal(entry.size, 6);
});

// ============================================================
// 4. missingEntry 构造
// ============================================================

test("missingEntry hash 为空字符串（不伪造）", () => {
  const entry = missingEntry("missing.json", "数据不存在");
  assert.equal(entry.path, "missing.json");
  assert.equal(entry.hash, "", "missing entry hash 必须为空字符串");
  assert.equal(entry.size, 0);
  assert.equal(entry.status, "missing");
  assert.equal(entry.reason, "数据不存在");
});

test("missingEntry 不创建空内容", () => {
  // 静态契约：missing 不应有 content（在 package-builder 中 toEntryAndFile 不返回 file）
  const entry = missingEntry("x.json", "不存在");
  assert.equal(entry.status, "missing");
  assert.equal(entry.size, 0);
});

// ============================================================
// 5. emptyEntry 构造
// ============================================================

test("emptyEntry hash = sha256('')（合法空文件）", () => {
  const entry = emptyEntry("empty.json", "空数据");
  assert.equal(entry.path, "empty.json");
  assert.equal(entry.hash, sha256Hex(""));
  assert.equal(entry.size, 0);
  assert.equal(entry.status, "empty");
  assert.equal(entry.reason, "空数据");
});

test("emptyEntry 与 missingEntry hash 不同", () => {
  const empty = emptyEntry("e.json", "空");
  const missing = missingEntry("m.json", "缺");
  assert.notEqual(empty.hash, missing.hash, "empty 应有 sha256('')，missing 应为空字符串");
  assert.equal(empty.hash, sha256Hex(""));
  assert.equal(missing.hash, "");
});

// ============================================================
// 6. failedEntry 构造
// ============================================================

test("failedEntry hash 为空字符串（不伪造）", () => {
  const entry = failedEntry("failed.json", "Provider 错误");
  assert.equal(entry.path, "failed.json");
  assert.equal(entry.hash, "", "failed entry hash 必须为空字符串");
  assert.equal(entry.size, 0);
  assert.equal(entry.status, "failed");
  assert.equal(entry.reason, "Provider 错误");
});

test("failedEntry reason 保留错误信息（供排查）", () => {
  const entry = failedEntry("x.json", "TTS_PROVIDER_TIMEOUT");
  assert.equal(entry.reason, "TTS_PROVIDER_TIMEOUT");
});

// ============================================================
// 7. buildManifest summary 统计
// ============================================================

test("buildManifest 统计 ok/missing/failed 数量", () => {
  const entries = [
    okEntry("a.json", "{}"),
    okEntry("b.json", "{}"),
    missingEntry("c.json", "缺"),
    failedEntry("d.json", "失败"),
    emptyEntry("e.json", "空"),
  ];
  const manifest = buildManifest({
    projectId: "p1",
    sourceUnitId: "u1",
    universeId: null,
    productionProjectId: null,
    exportedByUserId: "12345678-90ab-cdef-1234-567890abcdef",
    entries,
  });
  assert.equal(manifest.summary.totalFiles, 5);
  assert.equal(manifest.summary.okFiles, 2); // a, b
  assert.equal(manifest.summary.missingFiles, 1); // c
  assert.equal(manifest.summary.failedFiles, 1); // d
  // empty 不计入 ok/missing/failed
});

test("buildManifest 空 entries summary 全为 0", () => {
  const manifest = buildManifest({
    projectId: "p1",
    sourceUnitId: "u1",
    universeId: null,
    productionProjectId: null,
    exportedByUserId: "user1234",
    entries: [],
  });
  assert.equal(manifest.summary.totalFiles, 0);
  assert.equal(manifest.summary.okFiles, 0);
  assert.equal(manifest.summary.missingFiles, 0);
  assert.equal(manifest.summary.failedFiles, 0);
});

// ============================================================
// 8. packageHash 计算正确
// ============================================================

test("buildManifest packageHash = computePackageHash(entries)", () => {
  const entries = [
    okEntry("a.json", '{"x":1}'),
    missingEntry("b.json", "缺"),
  ];
  const manifest = buildManifest({
    projectId: "p1",
    sourceUnitId: "u1",
    universeId: null,
    productionProjectId: null,
    exportedByUserId: "user1234",
    entries,
  });
  assert.equal(manifest.packageHash, computePackageHash(entries));
});

test("buildManifest packageHash 与 entries 顺序无关", () => {
  const entries1 = [okEntry("a.json", "1"), okEntry("b.json", "2")];
  const entries2 = [okEntry("b.json", "2"), okEntry("a.json", "1")];
  const m1 = buildManifest({
    projectId: "p", sourceUnitId: "u", universeId: null,
    productionProjectId: null, exportedByUserId: "u1", entries: entries1,
  });
  const m2 = buildManifest({
    projectId: "p", sourceUnitId: "u", universeId: null,
    productionProjectId: null, exportedByUserId: "u1", entries: entries2,
  });
  assert.equal(m1.packageHash, m2.packageHash);
});

// ============================================================
// 9. redacted 标记
// ============================================================

test("buildManifest redacted 标记全部为 true", () => {
  const manifest = buildManifest({
    projectId: "p", sourceUnitId: "u", universeId: null,
    productionProjectId: null, exportedByUserId: "u1", entries: [],
  });
  assert.equal(manifest.redacted.apiKeys, true);
  assert.equal(manifest.redacted.providerRawErrors, true);
  assert.equal(manifest.redacted.signedUrls, true);
});

// ============================================================
// 10. exportedBy 脱敏
// ============================================================

test("buildManifest exportedBy 保留前 8 位", () => {
  const fullUserId = "12345678-90ab-cdef-1234-567890abcdef";
  const manifest = buildManifest({
    projectId: "p", sourceUnitId: "u", universeId: null,
    productionProjectId: null, exportedByUserId: fullUserId, entries: [],
  });
  assert.equal(manifest.exportedBy, "12345678");
  assert.ok(manifest.exportedBy.length <= 8);
  assert.ok(!manifest.exportedBy.includes(fullUserId.slice(8)));
});

test("buildManifest exportedBy 短 id 保留原样", () => {
  const shortId = "abc123";
  const manifest = buildManifest({
    projectId: "p", sourceUnitId: "u", universeId: null,
    productionProjectId: null, exportedByUserId: shortId, entries: [],
  });
  assert.equal(manifest.exportedBy, "abc123");
});

// ============================================================
// 11. schemaVersion 契约
// ============================================================

test("buildManifest schemaVersion = kiikis.production-package/1", () => {
  const manifest = buildManifest({
    projectId: "p", sourceUnitId: "u", universeId: null,
    productionProjectId: null, exportedByUserId: "u1", entries: [],
  });
  assert.equal(manifest.schemaVersion, "kiikis.production-package/1");
});

test("buildManifest exportedAt 是合法 ISO 时间", () => {
  const manifest = buildManifest({
    projectId: "p", sourceUnitId: "u", universeId: null,
    productionProjectId: null, exportedByUserId: "u1", entries: [],
  });
  const date = new Date(manifest.exportedAt);
  assert.ok(!isNaN(date.getTime()), "exportedAt 应是合法 ISO 时间");
  // 接近当前时间（1 分钟内）
  const now = Date.now();
  assert.ok(Math.abs(now - date.getTime()) < 60_000);
});

// ============================================================
// 12. 完整 Manifest 字段契约
// ============================================================

test("buildManifest 包含所有必需字段", () => {
  const manifest = buildManifest({
    projectId: "p1",
    sourceUnitId: "u1",
    universeId: "uni-1",
    productionProjectId: "pp-1",
    exportedByUserId: "user1234",
    entries: [okEntry("a.json", "{}")],
  });
  const requiredFields = [
    "schemaVersion",
    "exportedAt",
    "exportedBy",
    "projectId",
    "sourceUnitId",
    "universeId",
    "productionProjectId",
    "entries",
    "packageHash",
    "summary",
    "redacted",
  ];
  for (const field of requiredFields) {
    assert.ok(field in manifest, `Manifest 必须包含字段 ${field}`);
  }
  assert.equal(manifest.projectId, "p1");
  assert.equal(manifest.sourceUnitId, "u1");
  assert.equal(manifest.universeId, "uni-1");
  assert.equal(manifest.productionProjectId, "pp-1");
});

// ============================================================
// 13. 容错策略契约（package-builder 静态检查）
// ============================================================

test("package-builder safeRun 失败返回 failed，不抛出", () => {
  
  assert.ok(packageBuilderSource.includes("safeRun"), "必须有 safeRun 函数");
  assert.ok(packageBuilderSource.includes('kind: "failed"'), "失败必须返回 failed 而非抛出");
  assert.ok(packageBuilderSource.includes("catch (err)"), "必须用 try-catch 容错");
});

test("package-builder 不伪造空文件（missing/failed 不生成 file）", () => {
  
  // toEntryAndFile 中 missing/failed 不返回 file
  assert.ok(packageBuilderSource.includes('case "missing"'), "必须有 missing 分支");
  assert.ok(packageBuilderSource.includes('case "failed"'), "必须有 failed 分支");
  // missing 和 failed 分支不应返回 file
  const missingIdx = packageBuilderSource.indexOf('case "missing"');
  const failedIdx = packageBuilderSource.indexOf('case "failed"');
  const okIdx = packageBuilderSource.indexOf('case "ok"');
  // missing 和 failed 的返回值不应包含 file: 字段
  const missingBlock = packageBuilderSource.slice(missingIdx, packageBuilderSource.indexOf("}", missingIdx) + 1);
  const failedBlock = packageBuilderSource.slice(failedIdx, packageBuilderSource.indexOf("}", failedIdx) + 1);
  assert.ok(!missingBlock.includes("file:"), "missing 分支不应返回 file");
  assert.ok(!failedBlock.includes("file:"), "failed 分支不应返回 file");
  // ok 分支应返回 file
  const okBlock = packageBuilderSource.slice(okIdx, packageBuilderSource.indexOf("}", okIdx) + 1);
  assert.ok(okBlock.includes("file:"), "ok 分支应返回 file");
});

test("package-builder manifest 作为包内第一个文件", () => {
  
  assert.ok(
    packageBuilderSource.includes('[manifestFile, ...files]'),
    "manifest.json 必须作为包内第一个文件",
  );
  assert.ok(
    packageBuilderSource.includes('path: "manifest.json"'),
    "manifest 文件路径必须为 manifest.json",
  );
});

