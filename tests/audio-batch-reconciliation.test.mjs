import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => existsSync(path) ? readFileSync(path, "utf8") : "";

test("GMI reconciliation helper queries the request queue without resubmitting music", () => {
  const source = read("lib/audio/providers/gmi-reconciliation.ts");
  assert.match(source, /findAcceptedGmiRequest/);
  assert.match(source, /\/requests\?\$\{query\.toString\(\)\}/);
  assert.match(source, /prompt/);
  assert.match(source, /lyrics/);
  assert.doesNotMatch(source, /method:\s*["']POST["']/);
});

test("result ingestion failure is explicit and retryable", () => {
  const source = read("app/api/audio/jobs/[jobId]/route.ts");
  assert.match(source, /AUDIO_RESULT_INGEST_FAILED/);
  assert.match(source, /status:\s*["']failed["']/);
});
