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
