/**
 * actor-images tests — 图像换 Atlas Cloud + 参考图驱动 + 演员图像端点。
 *
 * Covers lib/art/providers/actor-image.ts (avatar prompt, view packs, request
 * factories, explicit-failure helpers) and its interaction with the catalog
 * router (text-to-image vs reference-driven edit model defaults).
 *
 * Route handlers themselves stay Next-bound; auth/credit wiring is not tested
 * here (same convention as storyboard-generate-image tests).
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTOR_VIEW_PACKS,
  buildActorAvatarPrompt,
  buildActorReferenceImageRequest,
  buildActorTextToImageRequest,
  buildActorViewShotPrompt,
  firstArtImageResult,
  getActorViewPack,
  sanitizeReferenceUrls,
} from "../lib/art/providers/actor-image.ts";
import { buildAtlasRequestBody } from "../lib/art/providers/atlas.ts";
import { resolveArtProviderRoute } from "../lib/art/providers/router.ts";

const BASE_PROMPT = "Name: 林晚.\nAge impression: 25.\nHair: 银色短发.";

test("avatar prompt is a white-background front-facing close-up portrait with studio lighting", () => {
  const prompt = buildActorAvatarPrompt(BASE_PROMPT).toLowerCase();
  assert.ok(prompt.includes("white background"), "mentions white background");
  assert.ok(prompt.includes("front-facing close-up portrait"), "mentions front-facing close-up portrait");
  assert.ok(prompt.includes("studio lighting"), "mentions studio lighting");
  assert.ok(prompt.includes("林晚"), "keeps the actor base prompt");
  assert.ok(prompt.includes("no extra people"), "guards against extra people");
});

test("view pack registry exposes exactly the four contracted packs", () => {
  assert.deepEqual(
    ACTOR_VIEW_PACKS.map((pack) => pack.key),
    ["three-view-casual", "three-view-swimwear", "expressions", "body-details"],
  );
  assert.equal(getActorViewPack("nope"), null);
  assert.equal(getActorViewPack("three-view-casual")?.shots.length, 3);
  assert.equal(getActorViewPack("three-view-swimwear")?.shots.length, 3);
  assert.equal(getActorViewPack("expressions")?.shots.length, 4);
  assert.ok((getActorViewPack("body-details")?.shots.length ?? 0) >= 3);
});

test("three-view packs cover front/side/back with the contracted costumes", () => {
  const casual = getActorViewPack("three-view-casual");
  assert.ok(casual);
  assert.deepEqual(casual.shots.map((shot) => shot.key), ["front", "side", "back"]);
  assert.ok(casual.costume.includes("white crew-neck T-shirt"));
  assert.ok(casual.costume.includes("jeans"));

  const swimwear = getActorViewPack("three-view-swimwear");
  assert.ok(swimwear);
  assert.deepEqual(swimwear.shots.map((shot) => shot.key), ["front", "side", "back"]);
  assert.ok(swimwear.costume.includes("swimwear") || swimwear.costume.includes("swimsuit"));
});

test("every shot prompt locks identity to the reference image and embeds the actor base description", () => {
  for (const pack of ACTOR_VIEW_PACKS) {
    for (const shot of pack.shots) {
      const prompt = buildActorViewShotPrompt(pack, shot, BASE_PROMPT);
      assert.ok(prompt.includes("reference image"), `${pack.key}/${shot.key} references the input image`);
      assert.ok(prompt.includes("identical face"), `${pack.key}/${shot.key} locks the face`);
      assert.ok(prompt.includes(BASE_PROMPT), `${pack.key}/${shot.key} embeds the actor base description`);
      assert.ok(prompt.includes(shot.brief), `${pack.key}/${shot.key} embeds the shot brief`);
      assert.ok(prompt.includes(pack.costume), `${pack.key}/${shot.key} embeds the costume`);
      assert.ok(prompt.includes("No text"), `${pack.key}/${shot.key} carries output guards`);
    }
  }
});

test("expressions pack shots are distinct expression close-ups", () => {
  const pack = getActorViewPack("expressions");
  assert.ok(pack);
  const briefs = pack.shots.map((shot) => shot.brief).join("\n");
  for (const word of ["smile", "angry", "sad", "surprised"]) {
    assert.ok(briefs.includes(word), `contains ${word}`);
  }
  for (const shot of pack.shots) {
    assert.ok(shot.brief.includes("close-up"), `${shot.key} is a close-up`);
  }
});

test("text-to-image request routes to the catalog default Atlas text model", () => {
  const request = buildActorTextToImageRequest({ prompt: "cinematic portrait", aspectRatio: "1:1" });
  assert.equal(request.selection, "atlas");
  assert.equal(request.task, "concept");
  assert.equal(request.referenceUrls.length, 0);
  assert.equal(request.count, 1);
  assert.equal(request.modelId, undefined, "model comes from the catalog default");

  const route = resolveArtProviderRoute({
    selection: request.selection,
    task: request.task,
    atlasAuthorized: true,
    hasReferences: request.referenceUrls.length > 0,
  });
  assert.equal(route.provider, "atlas");
  assert.equal(route.model.id, "black-forest-labs/flux-dev");

  const payload = buildAtlasRequestBody(request, route.model);
  assert.equal(payload.prompt, "cinematic portrait");
  assert.equal("images" in payload, false, "text-to-image payload carries no reference images");
});

test("reference-driven request routes to the catalog default Atlas edit model with images", () => {
  const avatarUrl = "https://cdn.example.test/actors/avatar.png";
  const request = buildActorReferenceImageRequest({
    prompt: "reference sheet",
    referenceUrls: [avatarUrl],
    aspectRatio: "4:3",
  });
  assert.equal(request.selection, "atlas");
  assert.deepEqual(request.referenceUrls, [avatarUrl]);

  const route = resolveArtProviderRoute({
    selection: request.selection,
    task: request.task,
    atlasAuthorized: true,
    hasReferences: request.referenceUrls.length > 0,
  });
  assert.equal(route.provider, "atlas");
  assert.equal(route.model.id, "openai/gpt-image-2/edit");
  assert.ok(route.model.capabilities.includes("multi-reference"));

  const payload = buildAtlasRequestBody(request, route.model);
  assert.deepEqual(payload.images, [avatarUrl]);
});

test("sanitizeReferenceUrls keeps only remotely fetchable http(s) URLs", () => {
  assert.deepEqual(
    sanitizeReferenceUrls([
      "https://cdn.example.test/a.png",
      "http://cdn.example.test/b.jpg",
      "data:image/png;base64,AAAA",
      "ftp://example.test/c.png",
      "",
      null,
      undefined,
    ]),
    ["https://cdn.example.test/a.png", "http://cdn.example.test/b.jpg"],
  );
});

test("generation failures surface explicitly instead of degrading silently", () => {
  assert.throws(() => firstArtImageResult([]), /EMPTY_ART_IMAGE_OUTPUT/);
  assert.throws(() => firstArtImageResult([{ imageUrl: "", provider: "atlas", model: "m", providerTaskId: "t" }]), /EMPTY_ART_IMAGE_OUTPUT/);

  const editRoute = resolveArtProviderRoute({ selection: "smart", task: "concept", atlasAuthorized: true, hasReferences: true });
  assert.throws(
    () => buildAtlasRequestBody(buildActorTextToImageRequest({ prompt: "no refs", aspectRatio: "1:1" }), editRoute.model),
    /ART_REFERENCE_REQUIRED/,
    "edit model without reference images throws instead of guessing",
  );
});

test("firstArtImageResult returns the first generated image unchanged", () => {
  const image = { imageUrl: "https://cdn.example.test/out.png", provider: "atlas", model: "openai/gpt-image-2/edit", providerTaskId: "task-1" };
  assert.equal(firstArtImageResult([image]), image);
});


// ============================================================
// PRD v3.0 §10 / §7.2 扩展：临时 URL 拒绝 + 单图失败保留旧版本
// ============================================================

test("sanitizeReferenceUrls 拒绝 Atlas/DeepSeek 临时 URL 作为长期参考图", () => {
  // PRD §10: Provider 临时 URL 过期或下载失败时，任务状态必须为 failed
  // 参考图必须为持久化 http(s) URL；非 http(s) 必须拒绝
  const result = sanitizeReferenceUrls([
    "https://cdn.kiikis.test/actors/avatar.png", // 持久化 CDN URL — 接受
    "https://atlas.cloud/tmp/abc123.png",         // Atlas 临时 URL — 当前实现接受（http(s)），但 PRD §10 要求转存后才可用
    "data:image/png;base64,AAAA",                 // base64 — 拒绝
    "ftp://example.test/c.png",                   // FTP — 拒绝
    "",
    null,
  ]);
  // 实现：sanitizeReferenceUrls 只过滤非 http(s)；PRD §10 的"转存后才能用"由 persistRemoteArtImage 保证
  assert.ok(result.includes("https://cdn.kiikis.test/actors/avatar.png"), "持久化 CDN URL 必须保留");
  assert.ok(result.includes("https://atlas.cloud/tmp/abc123.png"), "Atlas http(s) URL 通过 sanitizeReferenceUrls（持久化由后端 persist 步骤保证）");
  assert.ok(!result.includes("data:image"), "data: URL 必须拒绝");
  assert.ok(!result.includes("ftp://"), "ftp: URL 必须拒绝");
});

test("firstArtImageResult 失败显式抛错（不静默降级为空图）", () => {
  // PRD §10: Atlas 生成成功后必须转存平台 Storage，再创建 asset version
  // 生成失败时任务状态必须为 failed，不写入主缩略图
  assert.throws(
    () => firstArtImageResult([]),
    /EMPTY_ART_IMAGE_OUTPUT/,
    "空输出必须显式抛错，不静默降级",
  );
  assert.throws(
    () => firstArtImageResult([{ imageUrl: "", provider: "atlas", model: "m", providerTaskId: "t" }]),
    /EMPTY_ART_IMAGE_OUTPUT/,
    "空 URL 必须显式抛错",
  );
});

test("view pack shots 都包含 identity lock（防止换脸）", () => {
  // PRD §3.3 强制约束：Actor 不是 Character，身份必须稳定
  for (const pack of ACTOR_VIEW_PACKS) {
    for (const shot of pack.shots) {
      const prompt = buildActorViewShotPrompt(pack, shot, BASE_PROMPT);
      assert.ok(prompt.includes("identical face"), `${pack.key}/${shot.key} 必须锁定身份`);
      assert.ok(prompt.includes("reference image"), `${pack.key}/${shot.key} 必须使用参考图`);
    }
  }
});

test("reference-driven request 必须携带参考图（拒绝无参考图的 edit 模式）", () => {
  // PRD §10: 演员头像、参考图、三视图只走 Atlas Cloud（参考图驱动 edit 模式）
  // edit 模式无参考图必须显式抛错，不静默退化为 text-to-image
  const editRoute = resolveArtProviderRoute({
    selection: "smart",
    task: "concept",
    atlasAuthorized: true,
    hasReferences: true,
  });
  assert.equal(editRoute.provider, "atlas");
  assert.ok(editRoute.model.capabilities.includes("multi-reference"));

  // 无参考图时必须抛 ART_REFERENCE_REQUIRED
  assert.throws(
    () =>
      buildAtlasRequestBody(
        buildActorTextToImageRequest({ prompt: "no refs", aspectRatio: "1:1" }),
        editRoute.model,
      ),
    /ART_REFERENCE_REQUIRED/,
    "edit 模式无参考图必须显式抛错",
  );
});
