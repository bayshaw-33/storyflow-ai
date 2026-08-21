import assert from "node:assert/strict";
import test from "node:test";

import {
  ScreenplayTrilogyService,
  ScreenplayTrilogyError,
  resolveTrilogyState,
} from "../../../lib/server/v2/screenplays/trilogy.ts";

function unit(type, overrides = {}) {
  return {
    id: `unit-${type}`,
    type,
    title: "",
    readiness: "empty",
    currentVersionId: null,
    finalizedVersionId: null,
    legacyId: null,
    ...overrides,
  };
}

test("a new screenplay is ready to generate the world document", () => {
  assert.deepEqual(resolveTrilogyState([]), {
    status: "ready",
    stage: "world",
    label: "生成背景及世界观",
  });
});

test("a generated world draft waits for user confirmation", () => {
  assert.deepEqual(
    resolveTrilogyState([unit("world", { readiness: "draft", currentVersionId: "world-v1" })]),
    {
      status: "waiting_confirmation",
      stage: "world",
      unitId: "unit-world",
      label: "查看并确认背景及世界观",
    },
  );
});

test("a confirmed world unlocks character bible generation", () => {
  assert.deepEqual(
    resolveTrilogyState([unit("world", { readiness: "finalized", currentVersionId: "world-v1", finalizedVersionId: "world-v1" })]),
    {
      status: "ready",
      stage: "character",
      label: "生成角色圣经",
    },
  );
});

test("a confirmed character bible unlocks plot outline generation", () => {
  assert.deepEqual(
    resolveTrilogyState([
      unit("world", { readiness: "finalized", currentVersionId: "world-v1", finalizedVersionId: "world-v1" }),
      unit("character", { title: "角色圣经", readiness: "finalized", currentVersionId: "character-v1", finalizedVersionId: "character-v1" }),
    ]),
    {
      status: "ready",
      stage: "outline",
      label: "生成剧情及大纲",
    },
  );
});

test("the trilogy is complete only after the outline is confirmed", () => {
  const titles = { world: "背景及世界观", character: "角色圣经", outline: "剧情及大纲" };
  const confirmed = (type) => unit(type, {
    title: titles[type],
    readiness: "finalized",
    currentVersionId: `${type}-v1`,
    finalizedVersionId: `${type}-v1`,
  });
  assert.deepEqual(resolveTrilogyState([confirmed("world"), confirmed("character"), confirmed("outline")]), {
    status: "complete",
    stage: null,
    label: "项目背景三件套已完成",
  });
});

test("an existing empty trilogy unit is generated before creating another identity", () => {
  assert.deepEqual(resolveTrilogyState([unit("world", { title: "背景及世界观" })]), {
    status: "ready",
    stage: "world",
    label: "生成背景及世界观",
    unitId: "unit-world",
  });
});

test("an adapted legacy character node is not mistaken for the complete character bible", () => {
  const world = unit("world", { title: "背景及世界观", readiness: "finalized", currentVersionId: "world-v1", finalizedVersionId: "world-v1" });
  const legacyCharacter = unit("character", { title: "阿仁", legacyId: "project-1:character:阿仁", readiness: "finalized", currentVersionId: "character-v1", finalizedVersionId: "character-v1" });

  assert.deepEqual(resolveTrilogyState([world, legacyCharacter]), {
    status: "ready",
    stage: "character",
    label: "生成角色圣经",
  });
});

function makeTrilogyHarness(initialUnits = [], options = {}) {
  const units = structuredClone(initialUnits);
  const contentByUnit = new Map();
  const generated = [];
  const saved = [];
  const notices = [];
  const versionsByKey = new Map();
  let sequence = 0;
  const messages = options.messages ?? [
    { id: "msg-1", role: "user", content: "我要写一部发生在火星殖民城的科幻短剧。" },
    { id: "msg-2", role: "assistant", content: "主角与殖民城的核心矛盾是什么？" },
    { id: "msg-3", role: "user", content: "主角发现城市氧气配额被财团操控。" },
  ];
  const deps = {
    listUnits: async () => ({ units }),
    getUnit: async ({ unitId }) => ({
      unit: units.find((candidate) => candidate.id === unitId),
      content: contentByUnit.get(unitId) ?? null,
    }),
    createUnit: async ({ type, title, legacyId }) => {
      if (options.createCollision) {
        if (!units.some((candidate) => candidate.legacyId === legacyId)) {
          units.push(unit(type, { id: `winner-${type}`, title, legacyId }));
        }
        throw new Error("duplicate legacy identity");
      }
      const created = unit(type, { id: `created-${type}`, title, legacyId });
      units.push(created);
      return { unit: created };
    },
    saveUnitContent: async ({ unitId, content, source, sourceMessageIds, idempotencyKey, references }) => {
      const target = units.find((candidate) => candidate.id === unitId);
      const version = { id: `version-${++sequence}` };
      target.currentVersionId = version.id;
      target.readiness = "draft";
      contentByUnit.set(unitId, content);
      saved.push({ unitId, content, source, sourceMessageIds, idempotencyKey, references });
      versionsByKey.set(`${unitId}:${idempotencyKey}`, version);
      return { version, references };
    },
    findUnitVersionByIdempotencyKey: async ({ unitId, idempotencyKey }) => versionsByKey.get(`${unitId}:${idempotencyKey}`) ?? null,
    listMessages: async () => ({ messages }),
    appendAssistantMessage: async (params) => {
      if (options.noticeFailure) throw new Error("notice persistence unavailable");
      notices.push(params);
      return { id: "msg-notice", role: "assistant", content: params.content };
    },
    generateContent: async (payload) => {
      generated.push(payload);
      return { output: `生成的${payload.taskType}` };
    },
  };
  return { service: new ScreenplayTrilogyService(deps), units, contentByUnit, generated, saved, notices };
}

test("trilogy generation turns the conversation into a world draft without manual unit creation", async () => {
  const harness = makeTrilogyHarness();
  const result = await harness.service.generateNext({
    ownerId: "owner-1",
    workId: "work-1",
    conversationId: "conversation-1",
    idempotencyKey: "trilogy-world-1",
  });

  assert.equal(result.stage, "world");
  assert.equal(result.unit.id, "created-world");
  assert.equal(result.version.id, "version-1");
  assert.equal(harness.generated[0].taskType, "creation_background_world");
  assert.equal(harness.generated[0].options.contentMode, "screenplay");
  assert.match(harness.generated[0].input, /火星殖民城/);
  assert.match(harness.generated[0].input, /氧气配额/);
  assert.deepEqual(harness.saved[0].sourceMessageIds, ["msg-1", "msg-2", "msg-3"]);
  assert.equal(harness.saved[0].idempotencyKey, "trilogy-world-1:version");
  assert.equal(harness.saved[0].source, "ai");
  assert.equal(result.unit.legacyId, "kk-trilogy:world");
  assert.match(harness.notices[0].content, /背景及世界观草稿已生成/);
  assert.equal(result.nextState.status, "waiting_confirmation");
});

test("a completed request can be replayed with the same idempotency key", async () => {
  const harness = makeTrilogyHarness();
  const input = { ownerId: "owner-1", workId: "work-1", conversationId: "conversation-1", idempotencyKey: "same-request" };
  const first = await harness.service.generateNext(input);
  const replay = await harness.service.generateNext(input);

  assert.equal(replay.unit.id, first.unit.id);
  assert.equal(replay.version.id, first.version.id);
  assert.equal(harness.generated.length, 1);
  assert.equal(harness.saved.length, 1);
});

test("a concurrent stage identity winner prevents the losing request from saving another draft", async () => {
  const harness = makeTrilogyHarness([], { createCollision: true });

  await assert.rejects(
    () => harness.service.generateNext({ ownerId: "owner-1", workId: "work-1", conversationId: "conversation-1", idempotencyKey: "losing-request" }),
    (error) => error instanceof ScreenplayTrilogyError && error.code === "conflict",
  );
  assert.equal(harness.units.filter((candidate) => candidate.legacyId === "kk-trilogy:world").length, 1);
  assert.equal(harness.saved.length, 0);
});

test("confirmed world content is included when generating the character bible", async () => {
  const world = unit("world", {
    readiness: "finalized",
    currentVersionId: "world-v1",
    finalizedVersionId: "world-v1",
  });
  const harness = makeTrilogyHarness([world]);
  harness.contentByUnit.set(world.id, { body: "火星城氧气由曙光财团垄断。" });

  const result = await harness.service.generateNext({
    ownerId: "owner-1",
    workId: "work-1",
    conversationId: "conversation-1",
    idempotencyKey: "trilogy-character-1",
  });

  assert.equal(result.stage, "character");
  assert.equal(harness.generated[0].taskType, "creation_character_bible");
  assert.match(harness.generated[0].context, /曙光财团/);
  assert.deepEqual(harness.saved[0].references, [{ unitId: world.id, unitVersionId: "world-v1" }]);
});

test("project, universe and screenplay settings are preserved in the trilogy generation prompt", async () => {
  const harness = makeTrilogyHarness();
  await harness.service.generateNext({
    ownerId: "owner-1",
    workId: "work-1",
    conversationId: "conversation-1",
    idempotencyKey: "context-request",
    projectContext: {
      projectTitle: "火星配额",
      universeName: "赤沙 Universe",
      market: "西班牙",
      genre: "科幻悬疑",
      screenplayLanguage: "西班牙语",
      dialogueLanguage: "西班牙语",
      screenplayFormat: "international_production",
    },
  });

  assert.equal(harness.generated[0].projectTitle, "火星配额");
  assert.equal(harness.generated[0].market, "西班牙");
  assert.equal(harness.generated[0].genre, "科幻悬疑");
  assert.equal(harness.generated[0].options.screenplayFormat, "international_production");
  assert.match(harness.generated[0].context, /赤沙 Universe/);
  assert.match(harness.generated[0].context, /剧本语言：西班牙语/);
});

test("long conversations keep the newest turns within a bounded generation context", async () => {
  const messages = Array.from({ length: 100 }, (_, index) => ({
    id: `msg-${index}`,
    role: index % 2 ? "assistant" : "user",
    content: `${index === 99 ? "LATEST-TURN" : `turn-${index}`} ${"x".repeat(1000)}`,
  }));
  const harness = makeTrilogyHarness([], { messages });

  await harness.service.generateNext({ ownerId: "owner-1", workId: "work-1", conversationId: "conversation-1", idempotencyKey: "long-chat" });

  assert.match(harness.generated[0].input, /LATEST-TURN/);
  assert.doesNotMatch(harness.generated[0].input, /turn-0 /);
  assert.ok(harness.generated[0].input.length <= 24_100);
});

test("a draft stage blocks downstream generation and never creates another unit", async () => {
  const harness = makeTrilogyHarness([
    unit("world", { readiness: "draft", currentVersionId: "world-v1" }),
  ]);

  await assert.rejects(
    () => harness.service.generateNext({
      ownerId: "owner-1",
      workId: "work-1",
      conversationId: "conversation-1",
      idempotencyKey: "trilogy-character-too-early",
    }),
    (error) => error instanceof ScreenplayTrilogyError && error.code === "conflict",
  );
  assert.equal(harness.units.length, 1);
  assert.equal(harness.generated.length, 0);
});

test("a saved trilogy draft still succeeds when the follow-up conversation notice cannot be persisted", async () => {
  const harness = makeTrilogyHarness([], { noticeFailure: true });

  const result = await harness.service.generateNext({
    ownerId: "owner-1",
    workId: "work-1",
    conversationId: "conversation-1",
    idempotencyKey: "trilogy-world-notice-failure",
  });

  assert.equal(result.unit.currentVersionId, "version-1");
  assert.equal(result.nextState.status, "waiting_confirmation");
  assert.equal(harness.saved.length, 1);
});
