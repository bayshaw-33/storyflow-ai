import assert from "node:assert/strict";
import test from "node:test";

import { ensureScreenplayWorkBaseVersion } from "../lib/server/v2/screenplays/work-base.ts";

const WORK = "22222222-2222-2222-2222-222222222222";
const EXISTING = "33333333-3333-3333-3333-333333333333";
const BASELINE = "44444444-4444-4444-4444-444444444444";
const OWNER = "11111111-1111-1111-1111-111111111111";

function makeFetcher(responses = []) {
  const calls = [];
  let index = 0;
  return {
    calls,
    fetcher: async (path, init) => {
      calls.push({ path, init });
      return responses[index++] ?? [];
    },
  };
}

test("screenplay work base: keeps an existing current Work version", async () => {
  const fx = makeFetcher();
  const result = await ensureScreenplayWorkBaseVersion({
    ownerId: OWNER,
    workId: WORK,
    currentVersionId: EXISTING,
    fetcher: fx.fetcher,
  });

  assert.equal(result, EXISTING);
  assert.equal(fx.calls.length, 0);
});

test("screenplay work base: reuses the latest Work version when the pointer is stale", async () => {
  const fx = makeFetcher([[{ id: EXISTING }], []]);
  const result = await ensureScreenplayWorkBaseVersion({
    ownerId: OWNER,
    workId: WORK,
    currentVersionId: null,
    fetcher: fx.fetcher,
  });

  assert.equal(result, EXISTING);
  assert.equal(fx.calls.length, 2);
  assert.equal(fx.calls[1].init.method, "PATCH");
});

test("screenplay work base: seeds one idempotent baseline without a migration", async () => {
  const fx = makeFetcher([[], [], [{ id: BASELINE }], []]);
  const result = await ensureScreenplayWorkBaseVersion({
    ownerId: OWNER,
    workId: WORK,
    currentVersionId: null,
    fetcher: fx.fetcher,
  });

  assert.equal(result, BASELINE);
  assert.match(fx.calls[0].path, /storyflow_work_versions\?/);
  assert.equal(fx.calls[1].init.method, "POST");
  const body = JSON.parse(fx.calls[1].init.body);
  assert.equal(body.work_id, WORK);
  assert.equal(body.created_by, OWNER);
  assert.equal(body.kind, "checkpoint");
  assert.equal(body.source, "import");
  assert.match(body.idempotency_key, new RegExp(`^screenplay-baseline:${WORK}$`));
  assert.equal(fx.calls[3].init.method, "PATCH");
  assert.match(fx.calls[3].path, /current_version_id=is\.null/);
});
