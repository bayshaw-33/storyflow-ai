import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTOR_VIEW_PACKS,
  actorInitials,
  buildExportFileName,
  filterActors,
  groupVersionsByPack,
  mergeVersions,
  normalizePortrayals,
  normalizeViewVersions,
  toActorCard,
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
    ["three_view_casual", "three_view_swim", "expressions", "body_details"],
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
