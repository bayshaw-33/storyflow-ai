import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  getPublicationContext,
  parsePublication,
  toCommunityFeedProjection,
} from "../lib/contracts/v2/community.ts";
import { listCommunityFeed } from "../lib/server/v2/community/discovery.ts";
import {
  getCommunityContentKind,
  getCommunityContentLabel,
  getPublicationObjectHref,
} from "../lib/client/v2/community/view-model.ts";

const baseRow = {
  id: "pub-1",
  source_type: "episode",
  source_id: "episode-1",
  source_version: "v2",
  publisher_id: "user-1",
  title: "第一集",
  summary: "公开作品",
  cover_url: null,
  visibility: "public",
  status: "active",
  invite_token_hash: null,
  created_at: "2026-08-28T00:00:00Z",
  updated_at: "2026-08-28T00:00:00Z",
  idempotency_key: "pub-1",
  follow_count: 0,
  reaction_count: 0,
  bookmark_count: 0,
  comment_count: 0,
};

test("COM20-CARD-001: semantic subject type covers all six public classes", () => {
  assert.equal(getCommunityContentKind("work"), "work");
  assert.equal(getCommunityContentKind("universe"), "universe");
  assert.equal(getCommunityContentKind("actor"), "actor");
  assert.equal(getCommunityContentKind("asset"), "asset");
  assert.equal(getCommunityContentKind("milestone"), "milestone");
  assert.equal(getCommunityContentKind("kk_showcase"), "kk_showcase");
  assert.equal(getCommunityContentLabel("milestone", "zh-CN"), "里程碑");
  assert.equal(getCommunityContentLabel("kk_showcase", "en-US"), "KK Showcase");
});

test("COM20-CARD-004: feed projection carries workbench, rights, and contribution summaries", () => {
  const row = {
    ...baseRow,
    source_workbench: "作品工作台",
    rights_summary: "作者保留署名权",
    contribution_summary: "AI 起稿，作者完成修订",
    work_id: "work-1",
    universe_id: "universe-1",
  };
  const projection = toCommunityFeedProjection(
    parsePublication(row),
    null,
    getPublicationContext(row),
  );

  assert.equal(projection.subjectType, "work");
  assert.equal(projection.sourceWorkbench, "作品工作台");
  assert.equal(projection.rightsSummary, "作者保留署名权");
  assert.equal(projection.contributionSummary, "AI 起稿，作者完成修订");
  assert.equal(projection.workId, "work-1");
  assert.equal(projection.universeId, "universe-1");
});

test("COM20-CARD-004: legacy rows receive explicit non-claiming context fallbacks", () => {
  const projection = toCommunityFeedProjection(parsePublication(baseRow), null);
  assert.equal(projection.subjectType, "work");
  assert.equal(projection.sourceWorkbench, "作品工作台");
  assert.equal(projection.rightsSummary, "权利状态待确认");
  assert.equal(projection.contributionSummary, "AI / 人工贡献待标注");
});

test("COM20-NAV-001: episode and scene publications link to the resolved Work", () => {
  assert.equal(
    getPublicationObjectHref({
      sourceType: "episode",
      sourceId: "episode-1",
      subjectType: "work",
      workId: "work-1",
    }),
    "/projects/work-1",
  );
  assert.equal(
    getPublicationObjectHref({
      sourceType: "scene",
      sourceId: "scene-1",
      subjectType: "work",
      workId: "work-1",
    }),
    "/projects/work-1",
  );
});

test("COM20-CARD-004: publication card renders the context summaries", async () => {
  const source = await readFile(new URL("../components/v2/community/PublicationCard.tsx", import.meta.url), "utf8");
  assert.match(source, /sourceWorkbench/);
  assert.match(source, /rightsSummary/);
  assert.match(source, /contributionSummary/);
  assert.match(source, /subjectType/);
});

test("COM20-NAV-001: feed resolves episode ownership to the real Work route", async () => {
  const calls = [];
  const episodeRow = { ...baseRow, subject_type: "work" };
  const fetcher = async (url) => {
    calls.push(url);
    if (url.includes("storyflow_episodes")) return [{ id: "episode-1", project_id: "work-1" }];
    return [episodeRow];
  };

  const [item] = await listCommunityFeed(fetcher, { section: "works" });
  assert.equal(item.workId, "work-1");
  assert.equal(getPublicationObjectHref(item), "/projects/work-1");
  assert.ok(calls.some((url) => url.includes("storyflow_episodes")));
});

test("COM20-CARD-004: migration adds publication context without changing source_type semantics", async () => {
  const { readdir, readFile: read } = await import("node:fs/promises");
  const files = await readdir(new URL("../supabase/migrations/", import.meta.url));
  const migration = files.find((file) => file.includes("community_card_context"));
  assert.ok(migration, "community context migration must exist");
  const sql = await read(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8");
  assert.match(sql, /subject_type/);
  assert.match(sql, /source_workbench/);
  assert.match(sql, /rights_summary/);
  assert.match(sql, /contribution_summary/);
  assert.match(sql, /work_id/);
  assert.doesNotMatch(sql, /source_type[^\n]*milestone/);
  assert.doesNotMatch(sql, /source_type[^\n]*kk_showcase/);
});
