import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMMUNITY_SECTIONS,
  getCommunityContentKind,
  getCommunityContentLabel,
  getPublicationObjectHref,
} from "../lib/client/v2/community/view-model.ts";

test("C0 exposes stable community sections in product order", () => {
  assert.deepEqual(
    COMMUNITY_SECTIONS.map((section) => section.id),
    ["recommended", "following", "universes", "works", "actors", "assets", "saved"],
  );
});

test("C0 groups publication sources into user-facing content kinds", () => {
  assert.equal(getCommunityContentKind("universe"), "universe");
  assert.equal(getCommunityContentKind("project"), "work");
  assert.equal(getCommunityContentKind("episode"), "work");
  assert.equal(getCommunityContentKind("scene"), "work");
  assert.equal(getCommunityContentKind("actor"), "actor");
  assert.equal(getCommunityContentKind("asset"), "asset");
});

test("C0 labels content kinds in both supported locales", () => {
  assert.equal(getCommunityContentLabel("universe", "zh-CN"), "Universe");
  assert.equal(getCommunityContentLabel("work", "zh-CN"), "作品");
  assert.equal(getCommunityContentLabel("actor", "en-US"), "Actor");
  assert.equal(getCommunityContentLabel("asset", "en-US"), "Asset");
});

test("C0 only emits known same-origin object routes", () => {
  assert.equal(
    getPublicationObjectHref({ sourceType: "universe", sourceId: "u-1" }),
    "/universes/u-1",
  );
  assert.equal(
    getPublicationObjectHref({ sourceType: "actor", sourceId: "actor-1" }),
    "/actors/actor-1",
  );
  assert.equal(
    getPublicationObjectHref({ sourceType: "asset", sourceId: "asset-1" }),
    "/business/marketplace/asset-1",
  );
  assert.equal(
    getPublicationObjectHref({ sourceType: "project", sourceId: "project-1" }),
    "/projects/project-1",
  );
  assert.equal(
    getPublicationObjectHref({ sourceType: "scene", sourceId: "scene-1" }),
    null,
  );
});
