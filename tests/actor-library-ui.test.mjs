import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTOR_VIEW_PACKS,
  actorInitials,
  buildExportFileName,
  computeProfileCompleteness,
  filterActors,
  filterByStatus,
  filterByTag,
  groupVersionsByPack,
  markVersionPrimary,
  mergeVersions,
  normalizeActorDetail,
  normalizePortrayals,
  normalizeViewVersions,
  sortActors,
  toActorCard,
  toPortrayalCard,
} from "../components/actors/actor-view-model.ts";
import {
  REFERENCE_SHEET_HEIGHT,
  REFERENCE_SHEET_WIDTH,
  buildReferenceSheetPlan,
  coverFitRect,
  hasAnySheetImage,
  selectReferenceSheetImages,
} from "../components/actors/reference-sheet-plan.ts";

const LABELS = {
  main: "主视觉",
  threeViews: ["正面", "侧面", "背面"],
  expressions: ["表情 1", "表情 2", "表情 3", "表情 4", "表情 5", "表情 6", "表情 7", "表情 8", "表情 9"],
  details: ["细节 1", "细节 2"],
};

function version(pack, index) {
  return { versionId: `${pack}-${index}`, previewUrl: `https://cdn.example.com/${pack}/${index}.png`, pack };
}

test("视图包契约覆盖：两个三视图版本 + 表情组 + 身体细节", () => {
  assert.deepEqual(
    ACTOR_VIEW_PACKS.map((pack) => pack.id),
    ["three-view-casual", "three-view-swimwear", "expressions", "body-details"],
  );
});

test("normalizeViewVersions 宽松解析 generate-views 契约", () => {
  const payload = { success: true, versions: [{ versionId: "v1", previewUrl: "https://x/1.png", pack: "expressions" }] };
  const parsed = normalizeViewVersions(payload);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].versionId, "v1");
  // 垃圾输入一律降级为空数组，不抛错。
  assert.deepEqual(normalizeViewVersions(null), []);
  assert.deepEqual(normalizeViewVersions({ versions: "nope" }), []);
  assert.deepEqual(normalizeViewVersions({ versions: [{ versionId: "no-url" }] }), []);
  // 兼容 snake_case 字段。
  assert.equal(normalizeViewVersions({ versions: [{ preview_url: "https://x/2.png" }] }).length, 1);
});

test("mergeVersions 去重且新版本在前", () => {
  const existing = [version("expressions", 1), version("expressions", 2)];
  const incoming = [version("expressions", 3), version("expressions", 1)];
  const merged = mergeVersions(existing, incoming);
  assert.deepEqual(
    merged.map((item) => item.versionId),
    ["expressions-3", "expressions-1", "expressions-2"],
  );
});

test("groupVersionsByPack 按包分组", () => {
  const grouped = groupVersionsByPack([version("expressions", 1), version("three_view_casual", 1), version("expressions", 2)]);
  assert.equal(grouped.expressions.length, 2);
  assert.equal(grouped.three_view_casual.length, 1);
});

test("toActorCard 合并气质与可出演类型标签并去重截断", () => {
  const card = toActorCard({
    id: "a1",
    name: "Astra Lin",
    avatar_url: "https://x/a.png",
    temperament: ["冷静", "危险"],
    playable_roles: ["冷静", "反派", "白切黑", "狼人女主", "多余"],
    age_range: "20代后半",
    gender_expression: "冷感女性",
  });
  assert.deepEqual(card.tags, ["冷静", "危险", "反派", "白切黑"]);
  assert.equal(card.subtitle, "20代后半 · 冷感女性");
  assert.equal(card.visibility, "private");
});

test("toActorCard 无头像时给中文印章式首字", () => {
  assert.equal(actorInitials("林寒"), "寒");
  assert.equal(actorInitials("astra"), "A");
  assert.equal(actorInitials(""), "A");
});

test("filterActors 支持名字与标签搜索", () => {
  const actors = [
    { id: "1", name: "Astra", temperament: ["冷静"] },
    { id: "2", name: "Boris", playable_roles: ["狼人男主"] },
  ];
  assert.equal(filterActors(actors, "狼人")[0].id, "2");
  assert.equal(filterActors(actors, "ast")[0].id, "1");
  assert.equal(filterActors(actors, "").length, 2);
});

test("selectReferenceSheetImages：头像主视觉，泳装补齐三视图缺位", () => {
  const selection = selectReferenceSheetImages({
    avatarUrl: "https://x/avatar.png",
    versionsByPack: {
      three_view_casual: [version("three_view_casual", 1), version("three_view_casual", 2)],
      three_view_swim: [version("three_view_swim", 1), version("three_view_swim", 2), version("three_view_swim", 3)],
      expressions: Array.from({ length: 12 }, (_, index) => version("expressions", index)),
      body_details: [version("body_details", 1)],
    },
  });
  assert.equal(selection.mainVisualUrl, "https://x/avatar.png");
  assert.equal(selection.threeViewUrls.length, 3);
  assert.equal(selection.threeViewUrls[2], "https://cdn.example.com/three_view_swim/3.png");
  assert.equal(selection.expressionUrls.length, 9);
  assert.equal(selection.detailUrls.length, 2);
  assert.equal(hasAnySheetImage(selection), true);
});

test("selectReferenceSheetImages：无头像时主视觉回退到三视图第一张", () => {
  const selection = selectReferenceSheetImages({
    avatarUrl: "",
    versionsByPack: { three_view_casual: [version("three_view_casual", 9)] },
  });
  assert.equal(selection.mainVisualUrl, "https://cdn.example.com/three_view_casual/9.png");
  assert.equal(hasAnySheetImage(selectReferenceSheetImages({ avatarUrl: "", versionsByPack: {} })), false);
});

test("buildReferenceSheetPlan：格子都在画布内且不越界", () => {
  const selection = selectReferenceSheetImages({
    avatarUrl: "https://x/a.png",
    versionsByPack: {
      three_view_casual: [version("three_view_casual", 1), version("three_view_casual", 2), version("three_view_casual", 3)],
      expressions: Array.from({ length: 9 }, (_, index) => version("expressions", index)),
      body_details: [version("body_details", 1), version("body_details", 2)],
    },
  });
  const plan = buildReferenceSheetPlan(selection, LABELS);
  assert.equal(plan.width, REFERENCE_SHEET_WIDTH);
  assert.equal(plan.height, REFERENCE_SHEET_HEIGHT);
  // 1 主视觉 + 2 细节 + 3 三视图 + 9 表情 = 15 格
  assert.equal(plan.cells.length, 15);
  for (const cell of plan.cells) {
    assert.ok(cell.x >= 0 && cell.y >= 0, cell.slotId);
    assert.ok(cell.w > 0 && cell.h > 0, cell.slotId);
    assert.ok(cell.x + cell.w <= plan.width, `${cell.slotId} 超出右边界`);
    assert.ok(cell.y + cell.h <= plan.height, `${cell.slotId} 超出下边界`);
    assert.ok(cell.y >= plan.header.y + plan.header.h, `${cell.slotId} 与头部重叠`);
  }
});

test("buildReferenceSheetPlan：格子两两不重叠", () => {
  const selection = selectReferenceSheetImages({ avatarUrl: "", versionsByPack: {} });
  const plan = buildReferenceSheetPlan(selection, LABELS);
  for (let i = 0; i < plan.cells.length; i += 1) {
    for (let j = i + 1; j < plan.cells.length; j += 1) {
      const a = plan.cells[i];
      const b = plan.cells[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `${a.slotId} 与 ${b.slotId} 重叠`);
    }
  }
});

test("coverFitRect：等比 cover 居中裁切", () => {
  // 宽图进方格：裁左右。
  const wide = coverFitRect(2000, 1000, 500, 500);
  assert.equal(wide.sh, 1000);
  assert.equal(wide.sw, 1000);
  assert.equal(wide.sx, 500);
  // 高图进方格：裁上下。
  const tall = coverFitRect(1000, 2000, 500, 500);
  assert.equal(tall.sw, 1000);
  assert.equal(tall.sy, 500);
  // 非法尺寸安全归零。
  assert.deepEqual(coverFitRect(0, 100, 500, 500), { sx: 0, sy: 0, sw: 0, sh: 0 });
});

test("normalizePortrayals：解析参演作品并容忍垃圾数据", () => {
  const parsed = normalizePortrayals({
    portrayals: [
      { id: "p1", portrayal_name: "狼人女主", project_id: "proj-1", reference_image_url: "https://x/p.png" },
      { noId: true },
      "garbage",
    ],
  });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].portrayal_name, "狼人女主");
  assert.deepEqual(normalizePortrayals(undefined), []);
});

test("buildExportFileName：文件名清洗", () => {
  assert.equal(buildExportFileName("Astra Lin"), "astra-lin-reference-sheet.png");
  assert.equal(buildExportFileName("林寒 / 狼人"), "林寒-狼人-reference-sheet.png");
  assert.equal(buildExportFileName(""), "actor-reference-sheet.png");
});


// ============================================================
// PRD v3.0 扩展：markVersionPrimary / normalizeActorDetail / toPortrayalCard
// ============================================================

test("markVersionPrimary 切换主版本并清掉其他主版本标记", () => {
  const versions = [
    { versionId: "v1", previewUrl: "https://x/1.png", pack: "expressions", isPrimary: true },
    { versionId: "v2", previewUrl: "https://x/2.png", pack: "expressions", isPrimary: false },
    { versionId: "v3", previewUrl: "https://x/3.png", pack: "expressions", isPrimary: false },
  ];
  const next = markVersionPrimary(versions, "v2");
  assert.equal(next.find((v) => v.versionId === "v2")?.isPrimary, true);
  assert.equal(next.find((v) => v.versionId === "v1")?.isPrimary, false, "原主版本必须取消");
  assert.equal(next.find((v) => v.versionId === "v3")?.isPrimary, false);
});

test("markVersionPrimary versionId 不存在时不修改原数组", () => {
  const versions = [
    { versionId: "v1", previewUrl: "https://x/1.png", pack: "expressions", isPrimary: true },
  ];
  const next = markVersionPrimary(versions, "v-missing");
  // 不存在时回退：把第一个标为主版本（保持至少一个主版本的不变式）
  assert.equal(next[0].isPrimary, true);
});

test("normalizeActorDetail 解析 imagePackCompleteness 和 portrayalCount", () => {
  const detail = normalizeActorDetail({
    actor: {
      id: "a1",
      name: "Astra",
      avatar_url: "https://x/a.png",
      temperament: ["冷静"],
      status: "ready",
      updated_at: "2026-07-18T00:00:00.000Z",
      imagePackCompleteness: {
        avatar: true,
        threeViewCasual: false,
        threeViewSwimwear: true,
        expressions: false,
        bodyDetails: true,
      },
      portrayalCount: 5,
    },
  });
  assert.ok(detail);
  assert.equal(detail.id, "a1");
  assert.equal(detail.portrayalCount, 5);
  assert.equal(detail.imagePackCompleteness?.avatar, true);
  assert.equal(detail.imagePackCompleteness?.threeViewCasual, false);
  assert.equal(detail.imagePackCompleteness?.threeViewSwimwear, true);
});

test("normalizeActorDetail 坏数据返回 null", () => {
  assert.equal(normalizeActorDetail(null), null);
  assert.equal(normalizeActorDetail({}), null);
  assert.equal(normalizeActorDetail({ actor: null }), null);
  assert.equal(normalizeActorDetail({ actor: { id: "" } }), null);
});

test("toPortrayalCard 不暴露 project_id，使用语义化字段", () => {
  const card = toPortrayalCard(
    {
      id: "pt-1",
      workTitle: "陨神第一季",
      universeName: "陨神之墓",
      characterName: "Alice",
      costumeDirection: "白裙",
      visualPrompt: "prompt",
      referenceImageUrl: "https://x/a.png",
      isReusable: true,
      updated_at: "2026-07-18T00:00:00.000Z",
    },
    { untitledWork: "未关联作品", untitledCharacter: "未命名角色" },
  );
  assert.equal(card.workTitle, "陨神第一季");
  assert.equal(card.universeName, "陨神之墓");
  assert.equal(card.characterName, "Alice");
  assert.equal(card.projectId, undefined, "PortrayalCard 类型不得包含 projectId");
});

test("toPortrayalCard 旧 raw 行 fallback 到 portrayal_name", () => {
  const card = toPortrayalCard(
    {
      id: "pt-2",
      portrayal_name: "Alice 形象",
      project_id: "proj-x",  // legacy 字段，不应出现在 card
      reference_image_url: "https://x/b.png",
      is_reusable: false,
      updated_at: "2026-07-18T00:00:00.000Z",
    },
    { untitledWork: "未关联作品", untitledCharacter: "未命名角色" },
  );
  // 旧 raw 行没 workTitle → fallback 到 portrayal_name → 兜底 "未关联作品"
  assert.equal(card.workTitle, "Alice 形象");
  assert.equal(card.characterName, "Alice 形象");
  assert.equal(card.referenceImageUrl, "https://x/b.png");
  assert.equal(card.isReusable, false);
  assert.equal(card.projectId, undefined, "PortrayalCard 不得保留 project_id");
});

test("computeProfileCompleteness 计算身份完成度", () => {
  const result = computeProfileCompleteness({
    avatar_url: "https://x/a.png",
    age_range: "20代",
    gender_expression: "女性",
    ethnicity_style: "东亚",
    face_description: "瓜子脸",
    hair_description: "长发",
    body_description: "苗条",
    temperament: ["冷静"],
    playable_roles: ["反派"],
    bio: "演员简介",
  });
  assert.equal(result.filled, 10);
  assert.equal(result.total, 10);
  assert.equal(result.percent, 100);
});

test("computeProfileCompleteness 空数据返回 0%", () => {
  const result = computeProfileCompleteness({});
  assert.equal(result.filled, 0);
  assert.equal(result.percent, 0);
});

test("filterByStatus 按 ready/draft 筛选", () => {
  const actors = [
    { id: "1", status: "ready" },
    { id: "2", status: "draft" },
  ];
  assert.equal(filterByStatus(actors, "ready").length, 1);
  assert.equal(filterByStatus(actors, "draft").length, 1);
  assert.equal(filterByStatus(actors, "all").length, 2);
});

test("filterByTag 按标签筛选（大小写不敏感）", () => {
  const actors = [
    { id: "1", temperament: ["冷静"] },
    { id: "2", temperament: ["危险"] },
  ];
  assert.equal(filterByTag(actors, "冷静").length, 1);
  assert.equal(filterByTag(actors, "冷").length, 0, "标签必须精确匹配，不模糊匹配");
});

test("sortActors 按 portrayals 数倒序", () => {
  const actors = [
    { id: "1", portrayalCount: 5, updated_at: "2026-07-18T00:00:00.000Z" },
    { id: "2", portrayalCount: 10, updated_at: "2026-07-18T00:00:00.000Z" },
  ];
  const sorted = sortActors(actors, "portrayals");
  assert.equal(sorted[0].id, "2");
  assert.equal(sorted[1].id, "1");
});

test("mergeVersions 单张失败保留旧版本（incoming 为空时 existing 不丢失）", () => {
  const existing = [
    { versionId: "v1", previewUrl: "https://x/1.png", pack: "expressions", isPrimary: true },
  ];
  // 模拟新生成失败：incoming 为空数组
  const merged = mergeVersions(existing, []);
  assert.equal(merged.length, 1, "incoming 空时 existing 必须保留");
  assert.equal(merged[0].versionId, "v1");
});

test("mergeVersions incoming isPrimary=true 时清掉旧主版本", () => {
  const existing = [
    { versionId: "v1", previewUrl: "https://x/1.png", pack: "expressions", isPrimary: true },
  ];
  const incoming = [
    { versionId: "v2", previewUrl: "https://x/2.png", pack: "expressions", isPrimary: true },
  ];
  const merged = mergeVersions(existing, incoming);
  assert.equal(merged.find((v) => v.versionId === "v2")?.isPrimary, true);
  assert.equal(merged.find((v) => v.versionId === "v1")?.isPrimary, false, "新主版本出现时旧的必须取消");
});

test("mergeVersions 无任何 isPrimary 时自动标第一个为主版本", () => {
  const merged = mergeVersions(
    [],
    [{ versionId: "v1", previewUrl: "https://x/1.png", pack: "expressions" }],
  );
  assert.equal(merged[0].isPrimary, true);
});
