# Kiikis P0 Closed Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect an immutable white-model previs version to the existing video generation job, preserve exact adopted inputs, recover interrupted work, and expose honest task states without changing the current workbench layout.

**Architecture:** Store each adopted previs snapshot in the existing `storyflow_versions` table under `entity_type=previs_scene`; resolve its exact first-frame generation job and prompt on the server. Extend the existing storyboard video job with provenance and fine-grained sub-status metadata. Reuse the current toolbar slot, video button, overlay dialog, status badge, and task bar; do not add persistent panels or layout rules.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.9, Supabase/PostgREST, Node test runner, existing storyboard/video provider modules.

## Global Constraints

- Do not add, remove, rename, or reorder top-level production stages.
- Do not add a sidebar, column, fixed panel, top-level page entry, or persistent status region.
- Do not modify `components/production/ProductionWorkbench.module.css`, `components/production/WhiteModelPrevis.module.css`, `components/v2/workbench-shell/workbench-shell.module.css`, or layout rules in `app/globals.css`.
- Keep the white-model `minmax(0, 1fr) 250px` editor grid, viewport, timeline, and video-card width unchanged.
- Use an overlay confirmation dialog for adopted-input details; the dialog must reuse existing workbench-shell classes and add no CSS.
- Keep legacy direct video generation working when no previs version has been adopted.
- A previs-aware request must fail closed if its version, owner scope, shot scope, snapshot hash, or exact first-frame job cannot be verified.
- Do not automatically retry an ambiguous provider submission; preserve the queued job as `submission_unknown`.
- Do not delete or overwrite an earlier completed video when retrying one shot.
- Do not implement P1 or P2 in this plan.

---

## File Structure

- Create `lib/director/previs-version.ts`: immutable snapshot types, parser, capability disclosure, and client-safe summaries.
- Create `lib/server/previs-versions.ts`: owner-scoped version save/read/list and exact first-frame resolution.
- Create `app/api/storyboard/shots/[shotId]/previs-versions/route.ts`: authenticated GET/POST transport.
- Create `components/production/VideoGenerationConfirmDialog.tsx`: overlay-only confirmation UI using existing dialog classes.
- Modify `lib/director/previs-integration.ts`: carry prompt provenance into the white-model shot option.
- Modify `lib/storyboard/client.ts`: save/read previs versions and include `previsVersionId` in video submission.
- Modify `components/production/WhiteModelPrevis.tsx`: replace the existing handoff-button behavior with save-and-handoff; preserve its location and markup count.
- Modify `components/production/UnifiedStoryboardStage.tsx`: pass revision, client, and adopted callback; no structural JSX changes.
- Modify `components/production/ProductionWorkbench.tsx`: keep adopted versions by shot, restore them, switch the existing stage, and pass provenance into existing video generation.
- Modify `components/production/StoryboardPanels.tsx`: pass a previs summary to the existing shot video card.
- Modify `components/production/ShotVideoPanel.tsx`: show the confirmation overlay and map fine-grained statuses into its existing status slots.
- Modify `app/api/storyboard/shots/[shotId]/generate-video/route.ts`: consume/verify adopted versions and persist provenance before provider submission.
- Modify `app/api/storyboard/jobs/[jobId]/route.ts`: preserve provenance while advancing accepted/generating/ingesting/completed sub-statuses.
- Create focused `tests/p0-*.test.mjs` regression files.

---

### Task 1: Freeze the previs-version contract

**Files:**
- Create: `lib/director/previs-version.ts`
- Modify: `lib/director/previs-integration.ts`
- Test: `tests/p0-previs-version-contract.test.mjs`

**Interfaces:**
- Consumes: `PrevisScene`, `PrevisShotOption`.
- Produces: `PrevisVersionSnapshotV1`, `PrevisVersionSummary`, `parsePrevisVersionSnapshot(value)`, `summarizePrevisVersion(snapshot, id, versionNo)`, `buildPrevisCapabilityTranslation()`.

- [ ] **Step 1: Write the failing contract tests**

```js
test("previs snapshot parser preserves exact adopted input", () => {
  const parsed = parsePrevisVersionSnapshot(sampleSnapshot);
  assert.equal(parsed.kind, "kiikis.previs.version");
  assert.equal(parsed.adoptedInput.firstframeJobId, "image-job-1");
  assert.equal(parsed.adoptedInput.prompt, "camera follows Mara");
  assert.deepEqual(parsed.capabilityTranslation.lossy, ["camera_path", "actor_blocking", "focus_pull"]);
});

test("previs snapshot parser rejects wrong shot scope and malformed scene", () => {
  assert.throws(() => parsePrevisVersionSnapshot({ ...sampleSnapshot, shotId: "" }), /INVALID_PREVIS_VERSION/);
  assert.throws(() => parsePrevisVersionSnapshot({ ...sampleSnapshot, previs: { schemaVersion: 1 } }), /INVALID_PREVIS_VERSION/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/p0-previs-version-contract.test.mjs`  
Expected: FAIL because `lib/director/previs-version.ts` does not exist.

- [ ] **Step 3: Implement the minimal immutable contract**

```ts
export type PrevisCapabilityTranslation = {
  mode: "firstframe_prompt" | "native_motion_reference";
  preserved: string[];
  lossy: string[];
};

export type PrevisVersionSnapshotV1 = {
  schemaVersion: 1;
  kind: "kiikis.previs.version";
  projectId: string;
  workId: string;
  sourceUnitId: string;
  storyboardRevision: number;
  sceneId: string;
  shotId: string;
  shotLabel: string;
  previs: PrevisScene;
  adoptedInput: {
    firstframeJobId: string;
    firstframeUrlAtSave: string;
    prompt: string;
    promptInputHash: string;
    referenceVersionIds: string[];
    durationSeconds: 5 | 10;
    aspectRatio: "9:16";
  };
  capabilityTranslation: PrevisCapabilityTranslation;
  snapshotHash: string;
  createdAt: string;
};

export function buildPrevisCapabilityTranslation(): PrevisCapabilityTranslation {
  return {
    mode: "firstframe_prompt",
    preserved: ["first_frame", "text_prompt", "duration", "aspect_ratio"],
    lossy: ["camera_path", "actor_blocking", "focus_pull"],
  };
}
```

`parsePrevisVersionSnapshot` must validate every scalar, call `parsePrevisScene(JSON.stringify(value.previs))`, clone arrays, and return `Object.freeze` at the top level. Add `promptInputHash` and `referenceVersionIds` to `PrevisShotOption`, defaulting to `""` and `[]` when prompt metadata is absent.

- [ ] **Step 4: Run the contract tests and existing previs tests**

Run: `node --test tests/p0-previs-version-contract.test.mjs tests/v2-previs.test.mjs tests/v2-previs-integration.test.mjs tests/v2-previs-ui.test.mjs`  
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/director/previs-version.ts lib/director/previs-integration.ts tests/p0-previs-version-contract.test.mjs
git commit -m "feat(previs): define adopted version contract"
```

---

### Task 2: Save and recover exact owner-scoped previs versions

**Files:**
- Create: `lib/server/previs-versions.ts`
- Create: `app/api/storyboard/shots/[shotId]/previs-versions/route.ts`
- Test: `tests/p0-previs-version-store.test.mjs`
- Test: `tests/p0-previs-version-route.test.mjs`

**Interfaces:**
- Consumes: `loadStoryboardState(userId, projectId, sourceUnitId, fetcher)`, PostgREST `storyflow_generation_jobs`, `storyflow_versions`.
- Produces: `savePrevisVersion(params)`, `readPrevisVersion(params)`, `readLatestPrevisVersion(params)` and API payload `{ success, version: { id, versionNo, snapshot } }`.

- [ ] **Step 1: Write store tests with an injected fetcher**

```js
test("save resolves the exact completed image job before inserting a version", async () => {
  const { version, calls } = await harness.save(validInput);
  assert.equal(version.snapshot.adoptedInput.firstframeJobId, "image-job-1");
  assert.equal(version.snapshot.adoptedInput.firstframeUrlAtSave, "https://storage/frame.png");
  assert.ok(calls.some((call) => call.path.includes("job_type=eq.image")));
  assert.equal(calls.at(-1).body.entity_type, "previs_scene");
});

test("save fails closed when shot, confirmation, prompt, or first frame is missing", async () => {
  await assert.rejects(() => harness.save({ ...validInput, shotId: "other" }), /PREVIS_SHOT_NOT_FOUND/);
  await assert.rejects(() => noImageHarness.save(validInput), /PREVIS_FIRSTFRAME_NOT_FOUND/);
});
```

- [ ] **Step 2: Run store tests and verify RED**

Run: `node --test tests/p0-previs-version-store.test.mjs`  
Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement server save/read with a server-generated hash**

```ts
const canonical = JSON.stringify(snapshotWithoutHash);
const snapshotHash = createHash("sha256").update(canonical).digest("hex");
const snapshot = parsePrevisVersionSnapshot({ ...snapshotWithoutHash, snapshotHash });

const inserted = await fetcher<VersionRow[]>("/rest/v1/storyflow_versions", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    id: crypto.randomUUID(),
    user_id: userId,
    project_id: input.projectId,
    step_key: "storyboard",
    version_type: "manual",
    entity_type: "previs_scene",
    entity_id: input.shotId,
    version_no: nextVersionNo,
    source: "manual",
    snapshot_json: snapshot,
    content_snapshot: snapshot,
    created_by: userId,
  }),
});
```

Before insert, load the persisted storyboard state, find the same shot, require `confirmed=true` and non-empty `jimengPromptZh`, then query the latest completed owner-scoped image job for that shot. Read operations must filter `user_id`, `project_id`, `entity_type=previs_scene`, and `entity_id=shotId`.

- [ ] **Step 4: Add authenticated GET/POST route tests**

```js
test("POST route authenticates and forwards URL shotId into save scope", async () => {
  assert.match(routeSource, /authenticateRequest/);
  assert.match(routeSource, /savePrevisVersion/);
  assert.match(routeSource, /context\.params/);
});

test("GET route supports latest and explicit versionId", () => {
  assert.match(routeSource, /readLatestPrevisVersion/);
  assert.match(routeSource, /readPrevisVersion/);
});
```

- [ ] **Step 5: Run store and route tests**

Run: `node --test tests/p0-previs-version-store.test.mjs tests/p0-previs-version-route.test.mjs`  
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/server/previs-versions.ts app/api/storyboard/shots/[shotId]/previs-versions/route.ts tests/p0-previs-version-store.test.mjs tests/p0-previs-version-route.test.mjs
git commit -m "feat(previs): persist owner scoped shot versions"
```

---

### Task 3: Reuse the existing white-model toolbar slot for save-and-handoff

**Files:**
- Modify: `lib/storyboard/client.ts`
- Modify: `components/production/WhiteModelPrevis.tsx`
- Modify: `components/production/UnifiedStoryboardStage.tsx`
- Modify: `components/production/ProductionWorkbench.tsx`
- Test: `tests/p0-previs-handoff-ui.test.mjs`

**Interfaces:**
- Consumes: Task 2 POST/GET API.
- Produces: `StoryboardClient.savePrevisVersion(shotId, request)`, `StoryboardClient.getPrevisVersion(shotId, query)`, `onPrevisAdopted(summary)` callback, and `adoptedPrevisByShot` state.

- [ ] **Step 1: Write source/UI contract tests before component changes**

```js
test("white model reuses its existing handoff button and saves before switching", () => {
  assert.match(whiteModel, /savePrevisVersion/);
  assert.match(whiteModel, /保存并送视频/);
  assert.doesNotMatch(whiteModel, /新增白模侧栏|previsPersistentPanel/);
});

test("unified stage order and storyboard subviews are unchanged", () => {
  assert.match(stageSource, /"shot_table" \| "grids" \| "motion" \| "prompts" \| "canvas"/);
  assert.equal((stageSource.match(/id: "motion"/g) || []).length, 1);
});
```

- [ ] **Step 2: Run UI contract tests and verify RED**

Run: `node --test tests/p0-previs-handoff-ui.test.mjs`  
Expected: FAIL because save-and-handoff is not wired.

- [ ] **Step 3: Add client methods**

```ts
async savePrevisVersion(shotId: string, body: SavePrevisVersionRequest): Promise<PrevisVersionRecord> {
  return this.request({ method: "POST", path: `/api/storyboard/shots/${encodeURIComponent(shotId)}/previs-versions`, body });
}

async getPrevisVersion(shotId: string, query: { projectId: string; sourceUnitId: string; versionId?: string }): Promise<PrevisVersionRecord | null> {
  return this.request({ method: "GET", path: `/api/storyboard/shots/${encodeURIComponent(shotId)}/previs-versions`, query });
}
```

- [ ] **Step 4: Upgrade the existing handoff-button handler without changing markup structure**

```ts
const saved = await storyboardClient.savePrevisVersion(selectedShot.shotId, {
  projectId,
  workId,
  sourceUnitId: unitId ?? "",
  storyboardRevision,
  scene,
});
window.localStorage.setItem(previsHandoffStorageKey(projectId, workId, unitId, selectedShot.shotId), JSON.stringify(saved.version.snapshot));
downloadText(`${projectId}-${selectedShot.shotId}-video-handoff.json`, JSON.stringify(saved.version.snapshot, null, 2), "application/json");
onPrevisAdopted(saved.version);
```

Keep the button in the same `.toolbarActions` position and change only its click handler/text. Pass the client, revision, and callback through `UnifiedStoryboardStage`. In `ProductionWorkbench`, update `adoptedPrevisByShot`, call the existing stage-change function with `video`, and preserve the current shot ID in the URL/query state.

- [ ] **Step 5: Run UI and existing previs tests**

Run: `node --test tests/p0-previs-handoff-ui.test.mjs tests/v2-previs-ui.test.mjs tests/v2-previs-integration.test.mjs`  
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/storyboard/client.ts components/production/WhiteModelPrevis.tsx components/production/UnifiedStoryboardStage.tsx components/production/ProductionWorkbench.tsx tests/p0-previs-handoff-ui.test.mjs
git commit -m "feat(previs): hand adopted version to video stage"
```

---

### Task 4: Confirm actual adopted inputs without adding a panel

**Files:**
- Create: `components/production/VideoGenerationConfirmDialog.tsx`
- Modify: `components/production/StoryboardPanels.tsx`
- Modify: `components/production/ShotVideoPanel.tsx`
- Modify: `components/production/ProductionWorkbench.tsx`
- Test: `tests/p0-video-confirmation-ui.test.mjs`

**Interfaces:**
- Consumes: `PrevisVersionSummary | null` from Task 3.
- Produces: overlay props `{ open, shotLabel, previsVersion, busy, onConfirm, onCancel }` and `onGenerate(previsVersionId?: string)`.

- [ ] **Step 1: Write confirmation and no-layout-growth tests**

```js
test("video confirmation lists actual adopted conditions in an overlay", () => {
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /白模版本|Previs version/);
  assert.match(dialogSource, /首帧|First frame/);
  assert.match(dialogSource, /无法原样传递|Lossy/);
});

test("confirmation reuses existing shell classes and adds no stylesheet", () => {
  assert.match(dialogSource, /workbench-shell\.module\.css/);
  assert.equal(existsSync("components/production/VideoGenerationConfirmDialog.module.css"), false);
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/p0-video-confirmation-ui.test.mjs`  
Expected: FAIL because the dialog does not exist.

- [ ] **Step 3: Implement an overlay-only dialog using existing classes**

```tsx
if (!open) return null;
return (
  <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="video-confirm-title">
    <div className={styles.dialog}>
      <h2 id="video-confirm-title" className={styles.dialogTitle}>{isZh ? "确认视频生成条件" : "Confirm video inputs"}</h2>
      <p className={styles.dialogMessage}>{previsVersion ? `${isZh ? "白模版本" : "Previs version"} v${previsVersion.versionNo}` : (isZh ? "未采用白模版本，将使用当前分镜首帧和提示词。" : "No previs version adopted; current frame and prompt will be used.")}</p>
      <div className={styles.dialogActions}>
        <button className={styles.dialogButton} onClick={onCancel}>{isZh ? "取消" : "Cancel"}</button>
        <button className={`${styles.dialogButton} ${styles.dialogButtonPrimary}`} onClick={onConfirm} disabled={busy}>{isZh ? "确认生成" : "Generate"}</button>
      </div>
    </div>
  </div>
);
```

Render the adopted prompt, first-frame preview, preserved inputs, and lossy inputs inside the dialog body using existing text classes and inline semantic markup. Keep the shot card unchanged while the dialog is closed.

- [ ] **Step 4: Wire the existing generate button through the dialog**

`ShotVideoPanel` opens the dialog; confirm calls `onGenerate(previsVersion?.id)`. Legacy shots without an adopted version remain supported and the dialog states that current storyboard inputs will be used.

- [ ] **Step 5: Run tests**

Run: `node --test tests/p0-video-confirmation-ui.test.mjs tests/p0-previs-handoff-ui.test.mjs`  
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add components/production/VideoGenerationConfirmDialog.tsx components/production/StoryboardPanels.tsx components/production/ShotVideoPanel.tsx components/production/ProductionWorkbench.tsx tests/p0-video-confirmation-ui.test.mjs
git commit -m "feat(video): confirm adopted generation inputs"
```

---

### Task 5: Persist provenance and honest submission states in the existing video job

**Files:**
- Modify: `lib/storyboard/client.ts`
- Modify: `app/api/storyboard/shots/[shotId]/generate-video/route.ts`
- Modify: `app/api/storyboard/jobs/[jobId]/route.ts`
- Modify: `components/production/ShotVideoPanel.tsx`
- Modify: `components/production/ProductionWorkbench.tsx`
- Test: `tests/p0-video-previs-provenance.test.mjs`
- Test: `tests/p0-video-submission-state.test.mjs`

**Interfaces:**
- Consumes: `previsVersionId?: string`, `readPrevisVersion`, provider `submit/poll`.
- Produces: job `input_params.previsVersionId`, `input_params.previsSnapshotHash`, `input_params.firstframeJobId`, and `result_metadata.sub_status` values `queued|accepted|generating|result_ingesting|completed|failed|provider_timeout|submission_unknown`.

- [ ] **Step 1: Write provenance and ambiguity tests**

```js
test("previs-aware submission uses the version prompt and exact image job", async () => {
  const response = await submit({ previsVersionId: "previs-v3" });
  assert.equal(response.status, 200);
  assert.equal(inserted.input_params.previsVersionId, "previs-v3");
  assert.equal(inserted.input_params.firstframeJobId, "image-job-1");
  assert.equal(providerInput.prompt, "camera follows Mara");
  assert.equal(providerInput.firstframeUrl, "https://storage/frame.png");
});

test("ambiguous provider timeout preserves a queryable job and never auto-resubmits", async () => {
  const response = await submitWith(new Error("PROVIDER_TIMEOUT"));
  assert.equal(response.status, 202);
  assert.equal(lastPatch.status, "queued");
  assert.equal(lastPatch.result_metadata.sub_status, "submission_unknown");
  assert.equal(providerSubmitCount, 1);
});
```

- [ ] **Step 2: Run the new route tests and verify RED**

Run: `node --test tests/p0-video-previs-provenance.test.mjs tests/p0-video-submission-state.test.mjs`  
Expected: FAIL because `previsVersionId` and `submission_unknown` are not handled.

- [ ] **Step 3: Verify adopted provenance before creating the job**

```ts
if (body.previsVersionId) {
  const adopted = await readPrevisVersion({ userId, projectId: body.projectId, sourceUnitId: body.sourceUnitId, shotId, versionId: body.previsVersionId });
  shotPrompt = adopted.snapshot.adoptedInput.prompt;
  firstframeUrl = await resolveExactFirstframeJob({ userId, projectId: body.projectId, shotId, jobId: adopted.snapshot.adoptedInput.firstframeJobId });
  provenance = {
    previsVersionId: adopted.id,
    previsSnapshotHash: adopted.snapshot.snapshotHash,
    firstframeJobId: adopted.snapshot.adoptedInput.firstframeJobId,
    capabilityTranslation: adopted.snapshot.capabilityTranslation,
    adoptedAt: new Date().toISOString(),
  };
}
```

If no `previsVersionId` is supplied, keep the current persisted-shot + latest-confirmed-frame behavior unchanged.

- [ ] **Step 4: Write the job before provider submit and distinguish outcomes**

```ts
await insertJob({ ...baseRow, input_params: { ...baseRow.input_params, ...provenance }, result_metadata: { sub_status: "queued", ...provenance } });
try {
  const result = await provider.submit({ prompt: shotPrompt, firstframeUrl, duration, aspectRatio });
  await patchJob(jobId, { status: "running", provider_task_id: result.providerTaskId, result_metadata: { sub_status: "accepted", ...provenance } });
} catch (error) {
  if (isAmbiguousSubmissionError(error)) {
    await patchJob(jobId, { status: "queued", error: "SUBMISSION_STATUS_UNKNOWN", result_metadata: { sub_status: "submission_unknown", ...provenance } });
    return NextResponse.json({ success: true, jobId, status: "queued", subStatus: "submission_unknown" }, { status: 202 });
  }
  await patchJob(jobId, { status: "failed", error: friendlyProviderError(error), result_metadata: { sub_status: "failed", ...provenance } });
}
```

The job query route changes `accepted` to `generating` after a running poll, uses `result_ingesting` during durable transfer, and writes `completed` only after storage/sign succeeds. Every metadata update spreads the prior metadata first so provenance survives.

- [ ] **Step 5: Map sub-statuses into the existing card slots**

Extend `VideoJobState` with `subStatus` and `previsVersionId`; do not add a card row. Existing status badge labels become: 已受理、生成中、转存中、提交待确认. The existing error/action area supplies refresh or explicit retry confirmation.

- [ ] **Step 6: Run route, provider, and UI state tests**

Run: `node --test tests/p0-video-previs-provenance.test.mjs tests/p0-video-submission-state.test.mjs tests/storyboard-video-e2e.test.mjs tests/v2-video-gateway.test.mjs tests/v2-video-gateway-adapters.test.mjs`  
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/storyboard/client.ts app/api/storyboard/shots/[shotId]/generate-video/route.ts app/api/storyboard/jobs/[jobId]/route.ts components/production/ShotVideoPanel.tsx components/production/ProductionWorkbench.tsx tests/p0-video-previs-provenance.test.mjs tests/p0-video-submission-state.test.mjs
git commit -m "feat(video): trace previs inputs and submission recovery"
```

---

### Task 6: Recover adopted versions and enforce the layout freeze

**Files:**
- Modify: `components/production/ProductionWorkbench.tsx`
- Test: `tests/p0-production-recovery.test.mjs`
- Test: `tests/p0-layout-freeze.test.mjs`

**Interfaces:**
- Consumes: Task 2 latest-version GET and existing storyboard job listing/query.
- Produces: page reload restores `adoptedPrevisByShot` and job sub-status without changing stage or card geometry.

- [ ] **Step 1: Write recovery and layout tests**

```js
test("video stage reload requests latest previs versions for persisted shots", () => {
  assert.match(workbenchSource, /getPrevisVersion/);
  assert.match(workbenchSource, /adoptedPrevisByShot/);
  assert.match(workbenchSource, /activeStage !== "storyboard" && activeStage !== "video"/);
});

test("frozen layout files remain byte-identical to origin main", () => {
  for (const path of FROZEN_LAYOUT_FILES) {
    assert.equal(readFileSync(path, "utf8"), execFileSync("git", ["show", `origin/main:${path}`], { encoding: "utf8" }));
  }
});

test("top-level production stages remain script art storyboard video editing", () => {
  assert.deepEqual(extractStageIds(headerSource), ["script", "art", "storyboard", "video", "editing"]);
});
```

- [ ] **Step 2: Run tests and verify RED only for missing recovery**

Run: `node --test tests/p0-production-recovery.test.mjs tests/p0-layout-freeze.test.mjs`  
Expected: recovery test FAIL; layout assertions PASS.

- [ ] **Step 3: Restore latest adopted versions alongside existing job restoration**

When `activeStage` is `storyboard` or `video`, request the latest previs version for persisted shot IDs with bounded parallelism, discard results after effect cancellation, and merge successful records by shot ID. A failed version lookup must not clear local storyboard or completed video state.

```ts
const records = await Promise.allSettled(shotIds.map((shotId) => storyboardClient.getPrevisVersion(shotId, { projectId, sourceUnitId })));
if (!cancelled) {
  setAdoptedPrevisByShot((current) => mergeFulfilledPrevisRecords(current, records));
}
```

- [ ] **Step 4: Run all P0 tests and existing related tests**

Run: `node --test tests/p0-*.test.mjs tests/v2-previs.test.mjs tests/v2-previs-integration.test.mjs tests/v2-previs-ui.test.mjs tests/storyboard-video-e2e.test.mjs tests/v2-video-gateway.test.mjs tests/v2-video-gateway-adapters.test.mjs tests/server-v2/jobs/jobs.test.mjs`  
Expected: all selected tests PASS.

- [ ] **Step 5: Run static and production checks**

Run: `pnpm exec tsc --noEmit`  
Expected: exit 0.

Run: `pnpm build`  
Expected: exit 0.

Run: `git diff origin/main -- components/production/ProductionWorkbench.module.css components/production/WhiteModelPrevis.module.css components/v2/workbench-shell/workbench-shell.module.css app/globals.css`  
Expected: no output.

- [ ] **Step 6: Capture layout comparison screenshots**

At 1440×900, 1280×800, and a narrow viewport, capture the same signed-in project and compare the production header height, content origin, white-model viewport, 250px inspector, timeline, and video-card width. Any persistent panel, compression, column change, or shifted timeline fails the task.

- [ ] **Step 7: Commit**

```bash
git add components/production/ProductionWorkbench.tsx tests/p0-production-recovery.test.mjs tests/p0-layout-freeze.test.mjs
git commit -m "test(production): lock P0 recovery and layout invariants"
```

---

## Self-Review Record

- Spec coverage: all three P0 requirements map to Tasks 2–6; P1/P2 are explicitly excluded.
- Layout protection: frozen files, stage order, subview order, and visual geometry each have a verification gate.
- Type consistency: `PrevisVersionSnapshotV1` → `PrevisVersionRecord` → `PrevisVersionSummary` → `previsVersionId` is used consistently across store, API, client, UI, and job provenance.
- Recovery safety: ambiguous submission never auto-resubmits; earlier completed video remains in UI state.
- Placeholder scan: no TBD, implementation-later step, or unspecified error-handling instruction remains.

