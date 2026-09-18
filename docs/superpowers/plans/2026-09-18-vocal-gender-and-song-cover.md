# 人声方向与歌曲封面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为音乐工作台增加人声性别约束和按候选持久化的 Flux 2 Max 歌曲封面生成/下载。

**Architecture:** 前端在音乐候选控制区维护 `voiceGender`，仅人声模式显示并写入 AI 生成、修改和音频提交输入。封面通过新的任务子路由复用现有图片 Provider 管线，固定 `flux-2-max` 与 `1:1`，将私有存储路径写入音乐任务元数据，再由列表接口签发预览 URL和下载接口签发下载 URL。

**Tech Stack:** Next.js App Router、React、TypeScript、Supabase Storage、现有 Atlas/BFL 图片 Provider、Node test runner、Playwright。

## Global Constraints

- 默认人声方向为“不限”，保持旧任务和旧请求兼容。
- 纯音乐与音效不得接收歌词或人声性别约束。
- 封面固定 `flux-2-max`、`1:1`、单张生成；API Key 只在服务端使用。
- 所有封面操作按登录用户和当前项目校验。
- 不改变已有音乐模型切换、音频下载和历史删除语义。

---

### Task 1: Add failing contracts

**Files:**
- Create: `tests/song-vocal-gender-and-cover.test.mjs`
- Modify: `tests/atlascloud-audio-route.test.mjs`

- [ ] **Step 1: Write failing tests**

Assert the workbench and prompt input contain `voiceGender`, the three labels, vocal-only rendering, the audio request field, the cover action, and the cover route contract (`flux-2-max`, `1:1`, POST/GET, owner/project checks, metadata persistence).

- [ ] **Step 2: Run the focused tests**

Run: `node --test tests/song-vocal-gender-and-cover.test.mjs tests/atlascloud-audio-route.test.mjs`

Expected: the new tests fail because the selector state, candidate cover fields, route, and UI actions do not exist yet.

### Task 2: Implement voice direction

**Files:**
- Modify: `app/song-workbench/page.tsx`
- Modify: `components/song-workbench/AudioCandidates.tsx`
- Modify: `lib/ai/prompts.ts` if mode-level prompt assembly needs the explicit constraint

- [ ] **Step 1: Add the minimal state and input plumbing**

Use `voiceGender: "unrestricted" | "male" | "female"`, default to `unrestricted`, persist it in the existing local snapshot, include it in `buildSongGenerationInput`, `buildSongRevisionInput`, batch/retry `inputParams`, and render the three-option control only when `musicMode === "vocal"`.

- [ ] **Step 2: Run focused tests**

Run: `node --test tests/song-vocal-gender-and-cover.test.mjs tests/atlascloud-audio-route.test.mjs`

Expected: voice-direction assertions pass; cover assertions remain red.

### Task 3: Implement per-candidate cover API

**Files:**
- Create: `app/api/audio/jobs/[jobId]/cover/route.ts`
- Modify: `app/api/audio/jobs/route.ts`
- Modify: `app/api/audio/jobs/[jobId]/route.ts`
- Modify: `lib/supabase/art-storage.ts`

- [ ] **Step 1: Add the POST route**

Authenticate, require `projectId`, select the owned `job_type=audio` music job, build a bounded square-cover prompt, call `generateArtImages` with `{ selection: "flux", modelId: "flux-2-max", task: "concept", aspectRatio: "1:1", count: 1 }`, persist the remote image, and PATCH `result_metadata.cover`.

- [ ] **Step 2: Add list and GET download support**

The audio list route signs `cover.storagePath` into `coverUrl`. The cover GET route signs the same path with a safe title-based download filename.

- [ ] **Step 3: Clean cover storage on history delete**

Export the art bucket constant if needed, remove `cover.storagePath` before deleting the job, and keep all operations owner/project scoped.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/song-vocal-gender-and-cover.test.mjs tests/atlascloud-audio-route.test.mjs tests/song-audio-history-isolation.test.mjs`

Expected: all focused contracts pass.

### Task 4: Implement cover UI and persistence updates

**Files:**
- Modify: `components/song-workbench/AudioCandidates.tsx`
- Modify: `app/song-workbench/page.tsx`

- [ ] **Step 1: Add candidate cover fields and callbacks**

Render persisted thumbnails in the large player and history rows; add “生成封面” and “下载封面” actions with accessible labels.

- [ ] **Step 2: Wire authenticated handlers**

POST/GET the cover subroute with the current project ID, merge the returned cover URL into the matching candidate, and trigger a browser download from the server-issued URL.

- [ ] **Step 3: Run focused tests and local smoke**

Run: `node --test tests/song-vocal-gender-and-cover.test.mjs tests/song-audio-contract.test.mjs tests/song-audio-history-isolation.test.mjs`

Run the Playwright smoke through `with_server.py`; verify the page opens and unauthenticated state has no stale history or cover action.

### Task 5: Verify and publish

**Files:**
- No additional source files.

- [ ] **Step 1: Run verification**

Run `node --test`, `pnpm exec tsc --noEmit --pretty false`, and `pnpm build`.

- [ ] **Step 2: Commit and publish**

Commit `feat(song): add vocal direction and cover generation`, push `HEAD:main`, deploy with `vercel deploy --prod --yes --scope bay-shaw-s-projects`, then verify production HTTP responses and Git SHA equality.
