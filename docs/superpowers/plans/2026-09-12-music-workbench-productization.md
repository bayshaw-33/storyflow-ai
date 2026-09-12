# Music Workbench Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将用户界面统一命名为“音乐工作台”，把顶部三个入口改造成真正可用的歌曲作品库、歌曲音色设定库和歌曲工具箱，并消除重复操作入口。

**Architecture:** 保留现有 `/song-workbench`、Atlas Cloud 音频任务和签名下载协议；新增歌曲专用页面组件，通过既有 project-library、audio jobs 和歌曲文档工具提供数据与操作。歌曲音色设定使用独立的浏览器持久化库，并兼容迁移音乐工作台现有草稿中的 singers 数据，不引入 TTS 或新的 Provider。

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase browser auth, existing CSS in `app/globals.css`, Node test runner, Playwright.

## Global Constraints

- 产品名称统一为“音乐工作台”；代码路由 `/song-workbench` 保持不变以兼容已有链接。
- “我的作品”只展示音乐工作台的歌曲、纯音乐和音效结果。
- “音色库”只管理歌曲人声设定，不接入 TTS 或语音克隆。
- 纯音乐和音效请求不发送歌词，也不发送歌曲人声设定。
- Suno V6 曲风提示词必须保持在 1000 UTF-8 bytes 以内。
- 音频下载继续经过服务端签名下载接口，不把 Provider URL 当作永久地址。
- 不删除或修改用户现有歌曲任务；失败任务保留真实状态并提供重试/检查入口。

---

### Task 1: 建立回归契约并更新音乐工作台主界面文案

**Files:**
- Create: `tests/music-workbench-productization.test.mjs`
- Modify: `app/song-workbench/page.tsx`
- Modify: `components/song-workbench/AudioCandidates.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: existing `generateSongFromChat`, `generateSongAudio`, `SongDocument`, `AudioCandidates` interfaces.
- Produces: stable labels and selectors for the new navigation, button hierarchy, and removed history action.

- [ ] **Step 1: Write the failing static contract tests**

Add tests that require the page to contain “音乐工作台”, “聊一聊”, “生成内容文档”, and “生成音频候选”; require the old title-area history button and “歌曲工作台” visible title to be absent; require links to `/song-library`, `/song-voices`, and `/song-toolkit`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test tests/music-workbench-productization.test.mjs`

Expected: FAIL because the current page still contains the old product name, `/archive`, `/voice-workbench`, `/templates`, and the history button.

- [ ] **Step 3: Implement the minimum main-page changes**

Change only the visible product copy and navigation URLs. Keep `/song-workbench` as the route. Make the chat action labels explicit:

```tsx
<button className="secondary-button" type="submit">
  <Send size={15} />
  {isZh ? "聊一聊" : "Chat"}
</button>
<button className="primary-button song-generate-from-chat-btn" type="button" onClick={() => void generateSongFromChat()}>
  <Sparkles size={15} />
  {generating ? text.generating : (isZh ? "生成内容文档" : "Generate content")}
</button>
```

Remove only the `song-history-button` from the studio heading. Change the right-side generation action text in `AudioCandidates` to “生成音频候选” / “Generate audio candidates”. Do not change the underlying generation functions.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `node --test tests/music-workbench-productization.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the main-page contract**

```bash
git add tests/music-workbench-productization.test.mjs app/song-workbench/page.tsx components/song-workbench/AudioCandidates.tsx app/globals.css
git commit -m "feat(song): clarify music workbench actions"
```

### Task 2: Build the song-only “我的作品” page

**Files:**
- Create: `app/song-library/page.tsx`
- Create: `components/song-workbench/SongLibraryClient.tsx`
- Create: `tests/song-library.test.mjs`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `fetchProjectLibrary`, `/api/audio/jobs`, Supabase session, `/api/audio/jobs/[jobId]/download`.
- Produces: song-only project and audio result cards with play, download, and continue-creation actions.

- [ ] **Step 1: Write the failing page contract test**

Require the new page to use `fetchProjectLibrary`, call `/api/audio/jobs`, filter `workflowType === "song"`, render an audio player, link back to `/song-workbench?projectId=`, and use the signed download endpoint.

- [ ] **Step 2: Run it and verify the expected failure**

Run: `node --test tests/song-library.test.mjs`

Expected: FAIL because the route and component do not exist.

- [ ] **Step 3: Implement auth-aware song library loading**

Create a client page that:

1. reads the current Supabase session;
2. redirects unauthenticated users to `/login`;
3. loads project records using `fetchProjectLibrary(accessToken, "active")` and keeps only `workflowType === "song"`;
4. loads current-user music jobs from `/api/audio/jobs`;
5. exposes filters `all`, `song`, `instrumental`, `sfx` and status filters without inventing records;
6. renders explicit loading, error, and empty states.

Use `<audio controls preload="none" src={job.resultUrl || undefined} />` for completed signed results. The download action must fetch `/api/audio/jobs/${jobId}/download` with the bearer token, fetch the returned signed URL as a blob, and trigger a browser download, matching the existing reliable workbench behavior.

- [ ] **Step 4: Add visual hierarchy and responsive layout**

Add scoped classes in `app/globals.css` for a dark page shell, section heading, filter row, project cards, audio rows, status pills, and mobile stacking. Keep the same cyan accent and avoid introducing a second global navigation system.

- [ ] **Step 5: Run the focused test and type-check**

Run: `node --test tests/song-library.test.mjs` and `npx tsc --noEmit --pretty false`.

Expected: both commands exit 0.

- [ ] **Step 6: Commit the song library**

```bash
git add app/song-library/page.tsx components/song-workbench/SongLibraryClient.tsx tests/song-library.test.mjs app/globals.css
git commit -m "feat(song): add song-only works library"
```

### Task 3: Build the song voice-settings library and shared persistence

**Files:**
- Create: `lib/song/singers.ts`
- Create: `app/song-voices/page.tsx`
- Create: `components/song-workbench/SongVoiceLibrary.tsx`
- Create: `tests/song-voice-library.test.mjs`
- Modify: `app/song-workbench/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: existing `SingerProfile` fields and prompt sanitization behavior.
- Produces: reusable song-only singer settings with add/edit/copy/delete and apply-to-workbench behavior.

- [ ] **Step 1: Write failing tests for shared singer data and page behavior**

Require an exported `SingerProfile` type, a dedicated `SONG_SINGER_LIBRARY_STORAGE_KEY`, migration support for legacy `kiikis-song-workbench-v1` singers, labels that say “歌曲音色库” and do not say TTS, and a link that applies a singer profile to `/song-workbench`.

- [ ] **Step 2: Run and verify the focused test fails**

Run: `node --test tests/song-voice-library.test.mjs`

Expected: FAIL because the shared singer module and route do not exist.

- [ ] **Step 3: Extract the shared singer contract without changing generation semantics**

Move the existing `SingerProfile` shape, default singer records, cloning, and normalization helpers into `lib/song/singers.ts`. Keep the fields exactly compatible with the current page:

```ts
export type SingerProfile = {
  id: string;
  displayName: string;
  gender: string;
  genres: string[];
  voiceTexture: string[];
  delivery: string[];
  language: string[];
  safePromptTerms: string[];
  forbiddenOutputTerms: string[];
  notes: string;
};

export const SONG_SINGER_LIBRARY_STORAGE_KEY = "kiikis-song-singer-library-v1";
```

Update `app/song-workbench/page.tsx` to import the shared type/defaults/helpers. On load, prefer the dedicated key and fall back to the existing saved `data.singers`; save changes to both the song draft and the dedicated library key so existing projects remain compatible.

- [ ] **Step 4: Implement the library UI**

Render profile cards with prompt terms, voice texture, delivery, and actions. The editor must support text fields and comma-separated list fields, normalize whitespace, reject empty names, and confirm destructive deletion. “应用到音乐工作台” stores the selected singer ID in a short-lived handoff key and navigates to `/song-workbench`.

Do not render TTS controls, voice-line generation controls, provider voice IDs, or cloning actions.

- [ ] **Step 5: Run focused tests and type-check**

Run: `node --test tests/song-voice-library.test.mjs` and `npx tsc --noEmit --pretty false`.

Expected: both commands exit 0.

- [ ] **Step 6: Commit the voice library**

```bash
git add lib/song/singers.ts app/song-voices/page.tsx components/song-workbench/SongVoiceLibrary.tsx tests/song-voice-library.test.mjs app/song-workbench/page.tsx app/globals.css
git commit -m "feat(song): add reusable singer settings library"
```

### Task 4: Build the song toolkit

**Files:**
- Create: `app/song-toolkit/page.tsx`
- Create: `components/song-workbench/SongToolkit.tsx`
- Create: `tests/song-toolkit.test.mjs`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `validateV6StylePrompt`, `fitV6StylePrompt`, `V6_STYLE_MAX_BYTES`, Atlas Cloud capabilities, and existing audio job status/download routes.
- Produces: prompt byte checker, no-vocal templates, and an actionable generation/download health check.

- [ ] **Step 1: Write failing utility and page tests**

Require the toolkit to import the existing prompt validators, display `1000`, include instrumental and SFX no-vocal wording, call `/api/audio/capabilities`, call `/api/audio/jobs`, and expose a clear `/song-workbench` entry.

- [ ] **Step 2: Run and verify the focused test fails**

Run: `node --test tests/song-toolkit.test.mjs`

Expected: FAIL because the route and component do not exist.

- [ ] **Step 3: Implement prompt checker and templates**

Use the existing validator rather than duplicating byte counting:

```tsx
const { bytes, valid } = validateV6StylePrompt(prompt);
const canApply = valid && prompt.trim().length > 0;
```

Show a live byte meter, disable apply/copy above 1000 bytes, and use `fitV6StylePrompt` only when the user explicitly chooses “压缩到限制内”. Templates must include explicit constraints equivalent to “instrumental only, no vocals, no singing, no spoken words” and “sound effect only, no music, no vocals”.

- [ ] **Step 4: Implement health check and delivery entry**

The health check must show login state, available music models, most recent music job status, and whether a completed job has a downloadable artifact. It must report the actual failed step. Link delivery to the existing music workbench package action instead of creating a second export protocol.

- [ ] **Step 5: Run focused tests and type-check**

Run: `node --test tests/song-toolkit.test.mjs` and `npx tsc --noEmit --pretty false`.

Expected: both commands exit 0.

- [ ] **Step 6: Commit the toolkit**

```bash
git add app/song-toolkit/page.tsx components/song-workbench/SongToolkit.tsx tests/song-toolkit.test.mjs app/globals.css
git commit -m "feat(song): add music production toolkit"
```

### Task 5: Complete naming sweep and documentation/memory update

**Files:**
- Modify: all non-archive source/docs/tests files containing the visible product name “歌曲工作台” where the intended product label is being referenced.
- Create: `/Users/kiikis000/.codex/memories/extensions/ad_hoc/notes/2026-09-12-music-workbench-name.md`
- Modify: `docs/superpowers/specs/2026-09-12-song-workbench-productization-design.md`

**Interfaces:**
- Consumes: the approved product naming decision.
- Produces: consistent user-facing naming while preserving route and internal compatibility identifiers.

- [ ] **Step 1: Write the naming regression test**

Require user-facing source copy and the productization design to use “音乐工作台”; allow `/song-workbench` route names and historical archive documents to remain as compatibility references.

- [ ] **Step 2: Run it and verify it fails**

Run: `node --test tests/music-workbench-productization.test.mjs`

Expected: FAIL while old visible labels remain in the main page and related current docs.

- [ ] **Step 3: Apply the surgical naming sweep**

Replace visible product labels and current song-workbench documentation wording. Do not rename URLs, TypeScript identifiers, storage keys, database table names, or historical migration filenames.

Create the requested memory update note with the new canonical name, navigation scope, and the distinction between content-document generation and audio generation.

- [ ] **Step 4: Run focused tests and `git diff --check`**

Run: `node --test tests/music-workbench-productization.test.mjs tests/song-library.test.mjs tests/song-voice-library.test.mjs tests/song-toolkit.test.mjs` and `git diff --check`.

Expected: all tests pass and the diff has no whitespace errors.

- [ ] **Step 5: Commit naming and memory update**

```bash
git add app components lib tests docs /Users/kiikis000/.codex/memories/extensions/ad_hoc/notes/2026-09-12-music-workbench-name.md
git commit -m "refactor(song): rename product to music workbench"
```

### Task 6: Full verification, production smoke test, GitHub push, and Vercel deployment

**Files:**
- Modify only if verification finds a regression.

- [ ] **Step 1: Run the focused and full unit suites**

Run: `node --test tests/music-workbench-productization.test.mjs tests/song-library.test.mjs tests/song-voice-library.test.mjs tests/song-toolkit.test.mjs` then `npm run test:unit`.

Expected: exit 0 with zero failures.

- [ ] **Step 2: Run type-check and production build**

Run: `npx tsc --noEmit --pretty false` then `npm run build`.

Expected: exit 0.

- [ ] **Step 3: Run browser verification**

Start the local app with the repository’s existing dev/start procedure and use Playwright against:

1. `/song-workbench`: title is “音乐工作台”; history button is absent; left actions are “聊一聊” and “生成内容文档”; right action is “生成音频候选”.
2. `/song-library`: song-only empty/loading/data states render and download controls use the signed route.
3. `/song-voices`: create/edit/delete/apply singer settings works without TTS controls.
4. `/song-toolkit`: byte counter blocks >1000 bytes and templates include no-vocal constraints.

Use the dedicated existing test account only; do not submit paid generation unless the test environment explicitly permits it.

- [ ] **Step 4: Inspect production state**

Verify `https://www.kiikis.com/song-workbench`, `/song-library`, `/song-voices`, and `/song-toolkit` return usable pages for the authenticated test account. Confirm audio history remains visible and existing download behavior is unchanged.

- [ ] **Step 5: Push and deploy**

```bash
git push origin codex/atlascloud-music-switch:main
npx vercel --prod --yes
```

Expected: GitHub `main` advances to the verified commit and Vercel reports a successful production deployment. Recheck the production aliases after deployment.

- [ ] **Step 6: Record final evidence**

Capture the final commit SHA, test counts, build result, production URLs, and any non-blocking environmental warnings. Do not report completion without fresh command output and production checks.
