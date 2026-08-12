import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manuscript = JSON.parse(
  fs.readFileSync(new URL("../docs/whitepaper/kiikis-whitepaper-2.0-zh.json", import.meta.url), "utf8"),
);
const text = JSON.stringify(manuscript);

test("whitepaper includes its brand and IP asset thesis", () => {
  assert.match(text, /每一个宇宙，都始于一个念头。/);
  for (const phrase of ["IP 本体层", "身份与演绎层", "内容生产层", "来源与权利层", "价值流通层"]) {
    assert.ok(text.includes(phrase), `missing ${phrase}`);
  }
  assert.match(text, /Actor/i);
  assert.match(text, /Character/i);
  assert.match(text, /Portrayal/i);
  assert.match(text, /制作证据包/);
});

test("whitepaper 2.0 contains its strategic product principles", () => {
  for (const phrase of ["创意熵减", "技因演化", "知本主义", "Project-first", "Universe-first"]) {
    assert.ok(text.includes(phrase), `missing ${phrase}`);
  }
  for (const phrase of ["Universe 与内核", "创作生产闭环", "演员与资产生态"]) {
    assert.ok(text.includes(phrase), `missing ${phrase}`);
  }
});

test("whitepaper 2.0 states the current Universe and multi-model truth", () => {
  assert.match(text, /Universe 的初步框架/);
  assert.match(text, /尚未真正成为贯穿创作的产品核心/);
  assert.match(text, /多模型基础/);
});

test("whitepaper contains no audience label or proprietary implementation terms", () => {
  assert.doesNotMatch(text, /投资人|融资|路演|回报|Investor Edition/i);
  assert.doesNotMatch(
    text,
    /storyflow_|\/api\/|\bRLS\b|Supabase|DeepSeek|Atlas Cloud|SHA-256|manifest\.json|idempoten|数据库表|存储路径/i,
  );
});

test("whitepaper separates delivery states", () => {
  assert.match(text, /当前基础/);
  assert.match(text, /Kiikis 2\.0/);
  assert.match(text, /中长期方向/);
});

test("whitepaper has the approved page count and distribution notice", () => {
  assert.equal(manuscript.pages.length, 22);
  assert.equal(manuscript.metadata.version, "2026.08");
  assert.equal(manuscript.metadata.notice, "Confidential · Limited Distribution");
  assert.equal(manuscript.metadata.disclosure, "本版本已省略专有技术与实施细节");
});
