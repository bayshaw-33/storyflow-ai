# Kiikis 2.0 Homepage Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public homepage copy with the approved Kiikis 2.0 five-screen narrative while preserving the locked brand headline and the existing five Hero images.

**Architecture:** Keep the current `HeroSection` plus four `ContentSection` composition. Update only localized copy and remove the three verbose workspace cards; do not add a sixth section, new asset, route, or dependency. Add a source-level regression test that locks the brand headline, approved copy, CTA labels, and five-image mapping.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Node.js test runner, pnpm

## Global Constraints

- The current Chinese and English brand headline strings, line breaks, punctuation, decorative `×`, and visual styling are immutable.
- The homepage must remain exactly five visual screens: `HERO_MAIN`, `HERO_SECTION_3`, `HERO_SECTION_6`, `HERO_SECTION_5`, `HERO_SECTION_7`.
- Do not add a standalone closing CTA screen or the removed sentence `现在，把这个念头变成你的下一部作品。`
- Do not change Hero images, navigation, authentication flow, workspace modal behavior, or non-homepage product pages.
- Do not add dependencies or refactor unrelated CSS.
- Preserve the capability boundaries in `docs/superpowers/specs/2026-08-14-kiikis-homepage-copy-design.md`.

---

### Task 1: Lock and implement the five-screen homepage copy

**Files:**
- Create: `tests/homepage-copy.test.mjs`
- Modify: `components/home/HeroSection.tsx`
- Modify: `app/page.tsx`
- Modify: `lib/i18n/dictionaries.ts`

**Interfaces:**
- Consumes: `HeroSection({ onStartCreating })`, `ContentSection`, `assetUrl()`, and the `landing.hero.primary` dictionary key.
- Produces: the approved bilingual five-screen homepage and a source-level regression contract runnable with Node's built-in test runner.

- [ ] **Step 1: Write the failing homepage contract test**

Create `tests/homepage-copy.test.mjs` with:

```js
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const hero = read("../components/home/HeroSection.tsx");
const page = read("../app/page.tsx");
const dictionaries = read("../lib/i18n/dictionaries.ts");

test("homepage preserves the immutable Kiikis brand headline", () => {
  assert.match(hero, />每一个宇宙，<\/span>/);
  assert.match(hero, />都始于一个念头 ×<\/span>/);
  assert.match(hero, />Every universe<\/span>/);
  assert.match(hero, />begins with one idea\.<\/span>/);
});

test("homepage contains the approved bilingual five-screen copy", () => {
  for (const phrase of [
    "从故事到影像，让创作彼此相连，让成果持续积累。",
    "From story to screen, every step connects—and every creation builds on the last.",
  ]) assert.ok(hero.includes(phrase), `missing Hero copy: ${phrase}`);

  for (const phrase of [
    "不是一排工具，而是一条完整的创作链。",
    "Not a collection of tools. One connected creative pipeline.",
    "下一部作品，不必再从头开始。",
    "Your next project doesn’t have to start from scratch.",
    "演员，不是一次性生成的面孔。",
    "An actor is more than a face generated once.",
    "每一次改变，都知道从哪里来。",
    "Every change has a history.",
  ]) assert.ok(page.includes(phrase), `missing homepage copy: ${phrase}`);
});

test("homepage keeps one main Hero and four ordered section images", () => {
  assert.equal((hero.match(/token="HERO_MAIN"/g) || []).length, 1);
  const sectionTokens = [...page.matchAll(/bgImageZh=\{heroBg\("(HERO_SECTION_\d)"\)\}/g)]
    .map((match) => match[1]);
  assert.deepEqual(sectionTokens, [
    "HERO_SECTION_3",
    "HERO_SECTION_6",
    "HERO_SECTION_5",
    "HERO_SECTION_7",
  ]);
});

test("homepage uses Project-first CTA copy and removes legacy content", () => {
  assert.match(dictionaries, /"landing\.hero\.primary": "开始创作"/);
  assert.match(dictionaries, /"landing\.hero\.primary": "Start Creating"/);
  assert.doesNotMatch(page, /workspace-doors/);
  assert.doesNotMatch(page, /现在，把这个念头变成你的下一部作品/);
  assert.doesNotMatch(page, /你的角色，不该每一集都重新投胎/);
  assert.doesNotMatch(page, /选一次角，演一辈子/);
});
```

- [ ] **Step 2: Run the focused test and verify the old homepage fails the new contract**

Run:

```bash
node --test tests/homepage-copy.test.mjs
```

Expected: FAIL because the approved Hero subtitle, five-screen titles, and `开始创作 / Start Creating` dictionary values are not present yet.

- [ ] **Step 3: Replace the Hero subtitle without touching the headline**

In `components/home/HeroSection.tsx`, leave the `<h1>` block byte-for-byte unchanged and replace only the paragraph with:

```tsx
<p>
  {isZh
    ? "从故事到影像，让创作彼此相连，让成果持续积累。"
    : "From story to screen, every step connects—and every creation builds on the last."}
</p>
```

In `lib/i18n/dictionaries.ts`, change only these four localized values:

```ts
"landing.hero.subtitle": "从故事到影像，让创作彼此相连，让成果持续积累。",
"landing.hero.primary": "开始创作",
```

```ts
"landing.hero.subtitle": "From story to screen, every step connects—and every creation builds on the last.",
"landing.hero.primary": "Start Creating",
```

- [ ] **Step 4: Replace the four content sections and remove the workspace cards**

In `app/page.tsx`, retain the current section order and image tokens. Replace the four `ContentSection` blocks after `HeroSection` with:

```tsx
<ContentSection
  id="workspace"
  kicker={isZh ? "创作链" : "CREATIVE PIPELINE"}
  titleZh="不是一排工具，而是一条完整的创作链。"
  titleEn="Not a collection of tools. One connected creative pipeline."
  subtitleZh="小说、剧本、美术、分镜、视频与音乐共享同一个项目。前一步确认的成果，直接成为下一步创作的起点。"
  subtitleEn="Novels, scripts, art, storyboards, video, and music share one project. Every approved result becomes the starting point for what comes next."
  bgImageZh={heroBg("HERO_SECTION_3")}
  bgImageEn={heroBg("HERO_SECTION_3")}
  align="left"
  lightBg={false}
/>

<ContentSection
  id="universe"
  kicker={isZh ? "UNIVERSE · 创作资产" : "UNIVERSE · CREATIVE ASSETS"}
  titleZh="下一部作品，不必再从头开始。"
  titleEn="Your next project doesn’t have to start from scratch."
  subtitleZh="已经确认的角色、场景、世界规则和故事关系，会沉淀到 Universe。续集、改编或新项目，可以继承这些资产继续创作。"
  subtitleEn="Approved characters, locations, world rules, and story relationships are preserved in your Universe—ready for sequels, adaptations, and whatever comes next."
  ctaLabel={isZh ? "了解 Universe" : "Explore Universe"}
  ctaHref="/universes"
  bgImageZh={heroBg("HERO_SECTION_6")}
  bgImageEn={heroBg("HERO_SECTION_6")}
  align="left"
  lightBg={false}
/>

<ContentSection
  id="actors"
  kicker={isZh ? "ACTORS · 演员资产" : "ACTORS · ACTOR ASSETS"}
  titleZh="演员，不是一次性生成的面孔。"
  titleEn="An actor is more than a face generated once."
  subtitleZh="Kiikis 将演员、角色与作品造型分别保存：演员保留稳定身份，角色属于 Universe，造型随每部作品变化。"
  subtitleEn="Kiikis keeps actors, characters, and production looks distinct: the actor retains a stable identity, the character belongs to a Universe, and each production creates its own portrayal."
  ctaLabel={isZh ? "打开演员库" : "Open Actor Library"}
  ctaHref="/actors"
  bgImageZh={heroBg("HERO_SECTION_5")}
  bgImageEn={heroBg("HERO_SECTION_5")}
  align="left"
  lightBg={false}
/>

<ContentSection
  id="provenance"
  kicker={isZh ? "PROVENANCE · 创作留痕" : "PROVENANCE · CREATIVE HISTORY"}
  titleZh="每一次改变，都知道从哪里来。"
  titleEn="Every change has a history."
  subtitleZh="从最初的提示词到最终成片，重要版本、修改与生成过程被持续记录。你可以看见作品如何演变，也能找到每项资产的来源。"
  subtitleEn="From the first prompt to the final cut, key versions, revisions, and generations stay connected—so you can see how the work evolved and where each asset came from."
  ctaLabel={isZh ? "了解创作留痕" : "Explore Provenance"}
  ctaHref="/dashboard"
  bgImageZh={heroBg("HERO_SECTION_7")}
  bgImageEn={heroBg("HERO_SECTION_7")}
  align="left"
  lightBg={false}
/>
```

- [ ] **Step 5: Run the focused regression test**

Run:

```bash
node --test tests/homepage-copy.test.mjs
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 6: Run proportionate project verification**

Run:

```bash
pnpm run validate-assets
pnpm run build
```

Expected: Hero assets validate and the Next.js production build completes. If the build fails in unrelated Kiikis 2.1 code, record the exact pre-existing failure and do not expand this homepage task to repair it.

- [ ] **Step 7: Verify the rendered homepage at desktop and mobile widths**

Run the app locally and inspect `/` in Chinese and English. Confirm:

- the locked headline is visually unchanged;
- the Hero subtitle remains readable at mobile width;
- exactly five full-screen image sections render in the approved order;
- the workspace cards are gone;
- `开始创作 / Start Creating` still opens the existing authentication or workspace flow;
- Universe and Actor links use their existing routes.

- [ ] **Step 8: Commit and push only the homepage implementation**

```bash
git add tests/homepage-copy.test.mjs components/home/HeroSection.tsx app/page.tsx lib/i18n/dictionaries.ts
git commit -m "feat: update Kiikis 2.0 homepage copy"
git push origin main
```

Expected: the commit contains only the four files listed above and pushes as a fast-forward of the current remote `main`.
