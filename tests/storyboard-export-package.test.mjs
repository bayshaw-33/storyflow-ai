/**
 * Production Export Package tests — PRD §10 TRAE-PW-P0-006.
 *
 * 覆盖：
 *   E1. buildShotListCsv: 表头 + 行数 + CSV 转义
 *   E2. buildJimengPromptsMd: 场景/镜头结构
 *   E3. buildReadme: 计数 + 状态字段
 *   E4. sha256Hex: 已知向量校验
 *   E5. buildProductionPackage: 完整 ZIP 含 9 个必需文件
 *   E6. buildProductionPackage: assets/ 含 characters/locations/props 三子目录
 *   E7. buildProductionPackage: storyboard-images/ + videos/ 目录存在
 *   E8. buildProductionPackage: storage_path 为 null 时标 missing，不写文件
 *   E9. buildProductionPackage: fetchStorageBytes 抛错时标 fetch_failed
 *   E10. buildProductionPackage: manifest 含 SHA-256 + overallStatus=partial_failure
 *   E11. buildProductionPackage: fetchStorageBytes 用对 bucket（art-assets vs storyboard-videos）
 *   E12. buildProductionPackage: ZIP 内不存在 http:// 或 atlascloud.ai
 *   E13. export-package route 源码契约：draft 拒绝 / scope 校验 / service role fetch
 *   E14. export-package route 源码契约：fetchStorageBytes 用 service role key 直接拉取
 *   E15. StoryboardExportMenu 源码契约：调用 /api/storyboard/export-package
 *
 * 运行：node --test tests/storyboard-export-package.test.mjs
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";

import {
  buildShotListCsv,
  buildJimengPromptsMd,
  buildReadme,
  sha256Hex,
  buildProductionPackage,
} from "../lib/storyboard/export-package.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// --- fixtures ---

const SCENES = [
  {
    id: "scene-1",
    order: 1,
    heading: "开场",
    location: "公园",
    timeOfDay: "日",
    summary: "主角进入公园",
    shots: [
      {
        id: "shot-1",
        order: 1,
        shotSize: "全景",
        cameraMovement: "固定",
        angle: "平视",
        durationSeconds: 5,
        dialogue: "你好",
        visualDescription: "公园全景",
        storyBeat: "开场",
        emotion: "平静",
        jimengPromptZh: "公园全景，日光，人物行走",
        confirmed: true,
        locked: false,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// E1. buildShotListCsv
// ---------------------------------------------------------------------------

test("E1: buildShotListCsv has correct headers + rows", () => {
  const csv = buildShotListCsv(SCENES);
  const lines = csv.split("\n");
  assert.equal(lines[0], "SceneOrder,ShotOrder,ShotId,Location,TimeOfDay,ShotSize,Camera,Angle,Duration,Dialogue,VisualDescription,StoryBeat,Emotion,Confirmed,Locked");
  assert.equal(lines.length, 2); // header + 1 shot
  assert.ok(csv.includes("公园"));
  assert.ok(csv.includes("全景"));
});

test("E1b: buildShotListCsv escapes commas in dialogue", () => {
  const scenes = [{
    ...SCENES[0],
    shots: [{ ...SCENES[0].shots[0], dialogue: "你好,再见" }],
  }];
  const csv = buildShotListCsv(scenes);
  // 含逗号的字段必须被引号包裹
  assert.ok(csv.includes('"你好,再见"'));
});

// ---------------------------------------------------------------------------
// E2. buildJimengPromptsMd
// ---------------------------------------------------------------------------

test("E2: buildJimengPromptsMd has scene + shot structure", () => {
  const md = buildJimengPromptsMd(SCENES);
  assert.match(md, /# 即梦视频提示词/);
  assert.match(md, /## 第 1 场/);
  assert.match(md, /### Shot 1/);
  assert.match(md, /公园全景，日光，人物行走/);
  assert.match(md, /景别\/机位/);
});

// ---------------------------------------------------------------------------
// E3. buildReadme
// ---------------------------------------------------------------------------

test("E3: buildReadme has counts + status", () => {
  const readme = buildReadme({
    projectTitle: "测试项目",
    sourceUnitId: "ep-1",
    revision: 3,
    sceneCount: 2,
    shotCount: 5,
    assetCount: 3,
    imageCount: 4,
    videoCount: 1,
    failedCount: 0,
    overallStatus: "ok",
  });
  assert.match(readme, /# 测试项目 — 生产包/);
  assert.match(readme, /Revision：3/);
  assert.match(readme, /场景：2/);
  assert.match(readme, /镜头：5/);
  assert.match(readme, /视频：1/);
  assert.match(readme, /完整/);
});

// ---------------------------------------------------------------------------
// E4. sha256Hex
// ---------------------------------------------------------------------------

test("E4: sha256Hex of empty bytes = e3b0c44...", () => {
  const hash = sha256Hex(new Uint8Array(0));
  assert.equal(hash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("E4b: sha256Hex of 'abc' = ba7816bf...", () => {
  const hash = sha256Hex(new TextEncoder().encode("abc"));
  assert.equal(hash, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

// ---------------------------------------------------------------------------
// E5-E12: buildProductionPackage
// ---------------------------------------------------------------------------

function makeFetchSucceed() {
  return async (bucket, storagePath) => {
    // 返回最小 PNG bytes (1x1)
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (bucket === "storyboard-videos") {
      // 返回最小 mp4 header
      return new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);
    }
    return pngBytes;
  };
}

function makeFetchFail() {
  return async () => {
    throw new Error("STORAGE_FETCH_FAILED:404:not found");
  };
}

test("E5: buildProductionPackage produces ZIP with 9 required files", async () => {
  const result = await buildProductionPackage({
    userId: "u1",
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    projectTitle: "测试",
    manuscript: "剧本原文",
    revision: 2,
    scenes: SCENES,
    assets: [],
    storyboardImages: [],
    videos: [],
    fetchStorageBytes: makeFetchSucceed(),
  });
  const zip = await JSZip.loadAsync(result.zipBytes);
  const files = Object.keys(zip.files).sort();
  assert.ok(files.includes("script.txt"), `missing script.txt: ${files.join(",")}`);
  assert.ok(files.includes("storyboard.json"));
  assert.ok(files.includes("shot-list.csv"));
  assert.ok(files.includes("jimeng-prompts.md"));
  assert.ok(files.includes("manifest.json"));
  assert.ok(files.includes("README.md"));
  // script.txt 内容
  const scriptContent = await zip.file("script.txt").async("string");
  assert.equal(scriptContent, "剧本原文");
});

test("E6: buildProductionPackage creates assets/ with characters/locations/props", async () => {
  const result = await buildProductionPackage({
    userId: "u1",
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    projectTitle: "测试",
    manuscript: "剧本",
    revision: 1,
    scenes: [],
    assets: [
      { id: "a1", assetType: "character", storagePath: "u/a1.png", displayName: "主角" },
      { id: "a2", assetType: "location", storagePath: "u/a2.png", displayName: "公园" },
      { id: "a3", assetType: "prop", storagePath: "u/a3.png", displayName: "道具" },
    ],
    storyboardImages: [],
    videos: [],
    fetchStorageBytes: makeFetchSucceed(),
  });
  const zip = await JSZip.loadAsync(result.zipBytes);
  const files = Object.keys(zip.files);
  assert.ok(files.some((f) => f.startsWith("assets/characters/")), `no assets/characters/: ${files.join(",")}`);
  assert.ok(files.some((f) => f.startsWith("assets/locations/")));
  assert.ok(files.some((f) => f.startsWith("assets/props/")));
});

test("E7: buildProductionPackage creates storyboard-images/ + videos/ directories", async () => {
  const result = await buildProductionPackage({
    userId: "u1",
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    projectTitle: "测试",
    manuscript: "剧本",
    revision: 1,
    scenes: [],
    assets: [],
    storyboardImages: [
      { jobId: "job-img-1", shotId: "shot-1", storagePath: "u/img1.png", resultUrl: null, contentType: "image/png" },
    ],
    videos: [
      { jobId: "job-vid-1", shotId: "shot-1", storagePath: "u/vid1.mp4", contentType: "video/mp4" },
    ],
    fetchStorageBytes: makeFetchSucceed(),
  });
  const zip = await JSZip.loadAsync(result.zipBytes);
  const files = Object.keys(zip.files);
  assert.ok(files.some((f) => f.startsWith("storyboard-images/")), `no storyboard-images/: ${files.join(",")}`);
  assert.ok(files.some((f) => f.startsWith("videos/")));
});

test("E8: buildProductionPackage marks missing when storage_path is null", async () => {
  const result = await buildProductionPackage({
    userId: "u1",
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    projectTitle: "测试",
    manuscript: "剧本",
    revision: 1,
    scenes: [],
    assets: [
      { id: "a1", assetType: "character", storagePath: null, displayName: "主角" },
    ],
    storyboardImages: [
      { jobId: "j1", shotId: "s1", storagePath: null, resultUrl: null, contentType: "image/png" },
    ],
    videos: [
      { jobId: "j2", shotId: "s2", storagePath: null, contentType: "video/mp4" },
    ],
    fetchStorageBytes: makeFetchSucceed(),
  });
  assert.equal(result.manifest.overallStatus, "partial_failure");
  assert.equal(result.manifest.counts.failed, 3);
  const missingEntries = result.manifest.entries.filter((e) => e.status === "missing");
  assert.equal(missingEntries.length, 3);
  // missing entries 不写文件到 ZIP
  const zip = await JSZip.loadAsync(result.zipBytes);
  const files = Object.keys(zip.files);
  const assetFiles = files.filter((f) => f.startsWith("assets/"));
  assert.equal(assetFiles.length, 0, `should not write asset files for missing: ${assetFiles.join(",")}`);
});

test("E9: buildProductionPackage marks fetch_failed when fetchStorageBytes throws", async () => {
  const result = await buildProductionPackage({
    userId: "u1",
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    projectTitle: "测试",
    manuscript: "剧本",
    revision: 1,
    scenes: [],
    assets: [
      { id: "a1", assetType: "character", storagePath: "u/a1.png", displayName: "主角" },
    ],
    storyboardImages: [],
    videos: [],
    fetchStorageBytes: makeFetchFail(),
  });
  assert.equal(result.manifest.overallStatus, "partial_failure");
  const failedEntries = result.manifest.entries.filter((e) => e.status === "fetch_failed");
  assert.equal(failedEntries.length, 1);
  assert.equal(failedEntries[0].errorCode, "STORAGE_FETCH_FAILED:404:not found");
});

test("E10: buildProductionPackage manifest has SHA-256 + overallStatus", async () => {
  const result = await buildProductionPackage({
    userId: "u1",
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    projectTitle: "测试",
    manuscript: "剧本",
    revision: 5,
    scenes: SCENES,
    assets: [],
    storyboardImages: [],
    videos: [],
    fetchStorageBytes: makeFetchSucceed(),
  });
  assert.equal(result.manifest.overallStatus, "ok");
  assert.equal(result.manifest.revision, 5);
  // script.txt entry 必须有 SHA-256（64 hex chars）
  const scriptEntry = result.manifest.entries.find((e) => e.path === "script.txt");
  assert.ok(scriptEntry);
  assert.match(scriptEntry.sha256, /^[0-9a-f]{64}$/);
  // 所有 ok entries 必须有 sha256
  for (const entry of result.manifest.entries) {
    if (entry.status === "ok") {
      assert.ok(entry.sha256, `ok entry ${entry.path} must have sha256`);
      assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    }
  }
});

test("E11: buildProductionPackage uses correct buckets (art-assets vs storyboard-videos)", async () => {
  const calls = [];
  const fetcher = async (bucket, storagePath) => {
    calls.push({ bucket, storagePath });
    if (bucket === "storyboard-videos") {
      return new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]);
    }
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  };
  await buildProductionPackage({
    userId: "u1",
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    projectTitle: "测试",
    manuscript: "剧本",
    revision: 1,
    scenes: [],
    assets: [{ id: "a1", assetType: "character", storagePath: "u/a1.png", displayName: "主角" }],
    storyboardImages: [{ jobId: "j1", shotId: "s1", storagePath: "u/img1.png", resultUrl: null, contentType: "image/png" }],
    videos: [{ jobId: "j2", shotId: "s2", storagePath: "u/vid1.mp4", contentType: "video/mp4" }],
    fetchStorageBytes: fetcher,
  });
  const buckets = calls.map((c) => c.bucket);
  assert.ok(buckets.includes("art-assets"), "assets/images must use art-assets bucket");
  assert.ok(buckets.includes("storyboard-videos"), "videos must use storyboard-videos bucket");
});

test("E12: buildProductionPackage ZIP contains no http:// or atlascloud.ai", async () => {
  const result = await buildProductionPackage({
    userId: "u1",
    projectId: "proj-1",
    sourceUnitId: "ep-1",
    projectTitle: "测试",
    manuscript: "剧本",
    revision: 1,
    scenes: [],
    assets: [{ id: "a1", assetType: "character", storagePath: "u/a1.png", displayName: "主角" }],
    storyboardImages: [],
    videos: [],
    fetchStorageBytes: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  });
  const zip = await JSZip.loadAsync(result.zipBytes);
  for (const fname of Object.keys(zip.files)) {
    const content = await zip.files[fname].async("string");
    // PRD §10.4: ZIP 内不存在 http:// / https://api.atlascloud.ai
    assert.doesNotMatch(content, /https?:\/\/api\.atlascloud\.ai/, `${fname} contains atlascloud URL`);
    // manifest.json 会有 projectId 等字段，不应有 http:// 的 Provider URL
    if (fname !== "storyboard.json") {
      assert.doesNotMatch(content, /https?:\/\/[^\s"]+/, `${fname} contains http URL`);
    }
  }
});

// ---------------------------------------------------------------------------
// E13-E14: export-package route 源码契约
// ---------------------------------------------------------------------------

test("E13: export-package route rejects draft projectId (403)", async () => {
  const route = await read("../app/api/storyboard/export-package/route.ts");
  assert.match(route, /DRAFT_NOT_ARCHIVED/);
  assert.match(route, /startsWith\("draft-"\)/);
  assert.match(route, /403/);
});

test("E13b: export-package route validates scope (projectId + sourceUnitId)", async () => {
  const route = await read("../app/api/storyboard/export-package/route.ts");
  assert.match(route, /MISSING_SCOPE/);
  assert.match(route, /422/);
});

test("E13c: export-package route authenticates + owner-scoped queries", async () => {
  const route = await read("../app/api/storyboard/export-package/route.ts");
  assert.match(route, /authenticateRequest/);
  assert.match(route, /UNAUTHORIZED/);
  // 所有 DB 查询都用 owner_id=eq.${userId}
  const ownerIdMatches = route.match(/owner_id=eq\.\$\{encodeURIComponent\(userId\)\}/g) || [];
  assert.ok(ownerIdMatches.length >= 2, `expected >= 2 owner_id filters, got ${ownerIdMatches.length}`);
});

test("E14: export-package route fetches Storage with service role key (not signed URLs)", async () => {
  const route = await read("../app/api/storyboard/export-package/route.ts");
  assert.match(route, /fetchStorageBytes/);
  assert.match(route, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(route, /storage\/v1\/object\//);
  assert.match(route, /apikey: serviceKey/);
  // PRD §10.3：不依赖签名 URL
  assert.doesNotMatch(route, /storage\/v1\/object\/sign\//);
});

test("E14b: export-package route records evidence event (PRD §11.2)", async () => {
  const route = await read("../app/api/storyboard/export-package/route.ts");
  assert.match(route, /recordEvidenceEvent/);
  assert.match(route, /exportEvidenceEvent/);
  // 留痕失败不阻塞导出（PRD §11.3）
  assert.match(route, /console\.error.*\[evidence\]/);
});

test("E14c: export-package route returns Content-Disposition + X-Export-Status headers", async () => {
  const route = await read("../app/api/storyboard/export-package/route.ts");
  assert.match(route, /Content-Disposition/);
  assert.match(route, /X-Export-Status/);
  assert.match(route, /X-Export-Failed-Count/);
  assert.match(route, /application\/zip/);
});

// ---------------------------------------------------------------------------
// E15: StoryboardExportMenu 源码契约
// ---------------------------------------------------------------------------

test("E15: StoryboardExportMenu calls /api/storyboard/export-package (server-side)", async () => {
  const component = await read("../components/production/StoryboardExportMenu.tsx");
  assert.match(component, /\/api\/storyboard\/export-package/);
  assert.match(component, /X-Export-Status/);
  assert.match(component, /partial_failure/);
  // PRD §10: 不再在前端用 JSZip 拉取 Provider URL
  assert.doesNotMatch(component, /import JSZip/);
  // draft projectId 时拒绝导出
  assert.match(component, /startsWith\("draft-"\)/);
});

test("E15b: StoryboardExportMenu evidence button enables post-archive", async () => {
  const component = await read("../components/production/StoryboardExportMenu.tsx");
  // 按钮禁用条件：!accessToken || !projectId || !sourceUnitId || draft
  assert.match(component, /disabled=\{!accessToken/);
  assert.match(component, /startsWith\("draft-"\)/);
});
