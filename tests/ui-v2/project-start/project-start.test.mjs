/**
 * tests/ui-v2/project-start/project-start.test.mjs
 * KIIKIS 2.2 Phase 0 — Task 0.2 entry flow contract tests (no DOM).
 *
 * Covers the project-start client API and helpers that the entry grid consumes:
 *   - startProject returns ProjectStartResult and surfaces server errors
 *   - client never sends owner_id; auth token drives identity
 *   - workbenchRoute from server response is used as-is (no client override)
 *   - DEFAULT_WORK_TITLES used for card label fallback
 *   - WORK_TYPE_CARDS: exactly 7 modules in canonical order, no novel
 *   - No fixture fallback: startProject always hits /api/v2/project-start
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  WORK_TYPES,
  DEFAULT_WORK_TITLES,
  WORK_CONTRACT_VERSION,
} from "../../../lib/contracts/v2/work.ts";
import {
  startProject,
  ProjectStartClientError,
} from "../../../lib/client/v2/project-start/api.ts";
import {
  WORK_TYPE_CARDS,
  getWorkTypeCard,
  defaultTitleFor,
} from "../../../lib/client/v2/project-start/helpers.ts";

// ============================================================
// Task 0.2 RED: 7-module entry grid contract (K22-ENTRY-001..006)
// ============================================================

test("WORK_TYPE_CARDS exposes exactly 7 modules in canonical order", () => {
  assert.equal(WORK_TYPE_CARDS.length, 7);
  assert.deepEqual(
    WORK_TYPE_CARDS.map((c) => c.workType),
    ["script", "song", "art", "storyboard", "video", "voice", "editing"],
  );
});

test("WORK_TYPE_CARDS never includes novel", () => {
  assert.ok(!WORK_TYPE_CARDS.some((c) => c.workType === "novel"));
});

test("WORK_TYPE_CARDS: every card has icon + zh/en title + zh/en desc", () => {
  for (const card of WORK_TYPE_CARDS) {
    assert.equal(typeof card.icon, "string");
    assert.ok(card.icon.length > 0);
    assert.equal(typeof card.titleZh, "string");
    assert.ok(card.titleZh.length > 0);
    assert.equal(typeof card.titleEn, "string");
    assert.ok(card.titleEn.length > 0);
    assert.equal(typeof card.descZh, "string");
    assert.ok(card.descZh.length > 0);
    assert.equal(typeof card.descEn, "string");
    assert.ok(card.descEn.length > 0);
  }
});

test("getWorkTypeCard returns the card for each WorkType", () => {
  for (const t of WORK_TYPES) {
    const card = getWorkTypeCard(t);
    assert.equal(card.workType, t);
  }
});

test("getWorkTypeCard throws for unknown workType", () => {
  assert.throws(() => getWorkTypeCard("novel"));
  assert.throws(() => getWorkTypeCard("podcast"));
});

test("defaultTitleFor returns DEFAULT_WORK_TITLES[t] for every WorkType", () => {
  for (const t of WORK_TYPES) {
    assert.equal(defaultTitleFor(t), DEFAULT_WORK_TITLES[t]);
  }
});

test("ProjectStartFlow.tsx no longer references K2-T-03 fixture/createProject/ContentType/StartMode", () => {
  const filePath = path.resolve(
    "components/v2/project-start/ProjectStartFlow.tsx",
  );
  const src = fs.readFileSync(filePath, "utf8");
  assert.ok(
    !/from ['"]@\/lib\/client\/v2\/project-start\/(fixtures|api|helpers|types)['"][^]*createProject/.test(src),
    "ProjectStartFlow must not import createProject from K2-T-03 api",
  );
  assert.ok(
    !/createProject\s*\(/.test(src),
    "ProjectStartFlow must not call createProject (use startProject)",
  );
  assert.ok(
    !/\bContentType\b/.test(src),
    "ProjectStartFlow must not reference ContentType (K2-T-03 legacy)",
  );
  assert.ok(
    !/\bStartMode\b/.test(src),
    "ProjectStartFlow must not reference StartMode (K2-T-03 legacy)",
  );
  assert.ok(
    !/\bUniverseAction\b/.test(src),
    "ProjectStartFlow must not reference UniverseAction (K2-T-03 legacy)",
  );
  assert.ok(
    !/fetchUniverseOptions/.test(src),
    "ProjectStartFlow must not call fetchUniverseOptions",
  );
  assert.ok(
    !/filterUniverseOptions/.test(src),
    "ProjectStartFlow must not call filterUniverseOptions",
  );
  assert.ok(
    !/buildProjectStartRequest/.test(src),
    "ProjectStartFlow must not call buildProjectStartRequest",
  );
  assert.ok(
    /startProject/.test(src),
    "ProjectStartFlow must call startProject (Phase 0 Task 0.1 API)",
  );
  assert.ok(
    /WORK_TYPE_CARDS/.test(src),
    "ProjectStartFlow must render WORK_TYPE_CARDS (7-module grid)",
  );
});

test("ProjectStartFlow.tsx has no free-text input, no upload button, no novel option", () => {
  const filePath = path.resolve(
    "components/v2/project-start/ProjectStartFlow.tsx",
  );
  const src = fs.readFileSync(filePath, "utf8");
  // No <input type="text"> for free-text story description.
  assert.ok(
    !/placeholder=\{[^}]*描述你的故事/.test(src),
    "ProjectStartFlow must not contain '描述你的故事' free-text placeholder",
  );
  // No novel card.
  assert.ok(
    !/workType:\s*["']novel["']/.test(src),
    "ProjectStartFlow must not contain a novel card",
  );
  // No file upload.
  assert.ok(
    !/<input[^>]*type=["']file["']/.test(src),
    "ProjectStartFlow must not contain a file upload input",
  );
});

test("ProjectStartFlow.tsx uses startProject's server-returned workbenchRoute (no client-side route construction)", () => {
  const filePath = path.resolve(
    "components/v2/project-start/ProjectStartFlow.tsx",
  );
  const src = fs.readFileSync(filePath, "utf8");
  // The component must not build a workbench route itself; it must use the one
  // returned by startProject.
  assert.ok(
    !/WORKBENCH_ROUTES\[/.test(src),
    "ProjectStartFlow must not access WORKBENCH_ROUTES directly — use server-returned workbenchRoute",
  );
});

test("lib/client/v2/project-start/fixtures.ts is removed or no longer imported by any source file", () => {
  // fixtures.ts is K2-T-03 legacy; Phase 0 removes its consumers.
  const fixturesPath = path.resolve(
    "lib/client/v2/project-start/fixtures.ts",
  );
  if (fs.existsSync(fixturesPath)) {
    // If file still exists, no source under components/ or app/ may import it.
    const componentsDir = path.resolve("components");
    const appDir = path.resolve("app");
    function walk(dir, list = []) {
      if (!fs.existsSync(dir)) return list;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, list);
        else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) list.push(full);
      }
      return list;
    }
    const files = [...walk(componentsDir), ...walk(appDir)];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      assert.ok(
        !/from ['"]@?\/?lib\/client\/v2\/project-start\/fixtures['"]/.test(src) &&
        !/from ['"]\.\/fixtures['"]/.test(src),
        `${f} must not import project-start/fixtures (K2-T-03 legacy)`,
      );
    }
  }
});

test("DashboardClient 'new project' button opens the entry selector (/projects/new-v2) instead of navigating directly into a workbench", () => {
  const filePath = path.resolve("components/v2/dashboard/DashboardClient.tsx");
  const src = fs.readFileSync(filePath, "utf8");
  // Dashboard must route the "new project" action to the entry selector page,
  // not directly to a specific workbench.
  assert.ok(
    /\/projects\/new-v2/.test(src),
    "DashboardClient must open /projects/new-v2 (Phase 0 entry selector)",
  );
});

function makeMockResponse(body, init) {
  const status = (init && init.status) || 200;
  return {
    status,
    ok: (init && init.ok) || (status >= 200 && status < 300),
    json: async () => body,
    text: async () =>
      typeof body === "string" ? body : JSON.stringify(body),
  };
}

function installMockFetch(impl) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = original;
  };
}

test("startProject posts to /api/v2/project-start with auth header and Idempotency-Key", async () => {
  let captured = {};
  const restore = installMockFetch(async (url, init) => {
    captured = { url, init };
    return makeMockResponse({
      success: true,
      contractVersion: WORK_CONTRACT_VERSION,
      projectId: "p1",
      work: { id: "w1", workType: "script", title: "未命名剧本" },
      workbenchRoute: "/script-workbench?projectId=p1&workId=w1",
    });
  });
  try {
    const result = await startProject({
      workType: "script",
      authToken: "tok-1",
      idempotencyKey: "k-1",
    });
    assert.equal(result.contractVersion, WORK_CONTRACT_VERSION);
    assert.equal(result.projectId, "p1");
    assert.equal(result.work.id, "w1");
    assert.equal(
      result.workbenchRoute,
      "/script-workbench?projectId=p1&workId=w1",
    );
    assert.match(String(captured.url), /\/api\/v2\/project-start$/);
    const headers = new Headers(captured.init.headers);
    assert.equal(headers.get("Authorization"), "Bearer tok-1");
    assert.equal(headers.get("Idempotency-Key"), "k-1");
    const body = JSON.parse(String(captured.init.body));
    assert.equal(body.workType, "script");
    assert.equal(body.ownerId, undefined, "client must NOT send ownerId");
    assert.equal(
      body.title,
      undefined,
      "client must NOT send title unless user typed one",
    );
  } finally {
    restore();
  }
});

test("startProject propagates optional user title when provided", async () => {
  let captured = {};
  const restore = installMockFetch(async (url, init) => {
    captured = { url, init };
    return makeMockResponse({
      success: true,
      contractVersion: WORK_CONTRACT_VERSION,
      projectId: "p1",
      work: { id: "w1", workType: "script", title: "我的剧本" },
      workbenchRoute: "/script-workbench?projectId=p1&workId=w1",
    });
  });
  try {
    await startProject({
      workType: "script",
      authToken: "tok-1",
      idempotencyKey: "k-1",
      title: "我的剧本",
    });
    const body = JSON.parse(String(captured.init.body));
    assert.equal(body.title, "我的剧本");
  } finally {
    restore();
  }
});

test("startProject rejects when workType is novel (client-side guard)", async () => {
  const restore = installMockFetch(async () => makeMockResponse({ success: true }));
  try {
    await assert.rejects(
      () =>
        startProject({
          workType: "novel",
          authToken: "tok-1",
          idempotencyKey: "k-1",
        }),
      (err) =>
        err instanceof ProjectStartClientError &&
        err.code === "validation_failed",
    );
  } finally {
    restore();
  }
});

test("startProject throws ProjectStartClientError on 401 (unauthenticated)", async () => {
  const restore = installMockFetch(async () =>
    makeMockResponse(
      {
        success: false,
        error: "Authentication is required.",
        code: "unauthenticated",
      },
      { status: 401 },
    ),
  );
  try {
    await assert.rejects(
      () =>
        startProject({
          workType: "script",
          authToken: "tok-bad",
          idempotencyKey: "k-1",
        }),
      (err) =>
        err instanceof ProjectStartClientError &&
        err.code === "unauthenticated",
    );
  } finally {
    restore();
  }
});

test("startProject throws ProjectStartClientError on 503 (service_unavailable) and keeps correlationId", async () => {
  const restore = installMockFetch(async () =>
    makeMockResponse(
      {
        success: false,
        error: "Cloud data service unavailable.",
        code: "service_unavailable",
        correlationId: "corr-1",
      },
      { status: 503 },
    ),
  );
  try {
    await assert.rejects(
      () =>
        startProject({
          workType: "script",
          authToken: "tok-1",
          idempotencyKey: "k-1",
        }),
      (err) =>
        err instanceof ProjectStartClientError &&
        err.code === "service_unavailable" &&
        err.correlationId === "corr-1",
    );
  } finally {
    restore();
  }
});

test("DEFAULT_WORK_TITLES used for card label fallback (no network)", () => {
  for (const t of WORK_TYPES) {
    assert.ok(DEFAULT_WORK_TITLES[t]);
  }
});
