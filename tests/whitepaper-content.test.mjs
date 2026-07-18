import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manuscript = JSON.parse(
  fs.readFileSync(new URL("../docs/whitepaper/kiikis-whitepaper-v2-zh.json", import.meta.url), "utf8"),
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

test("whitepaper contains no audience label or proprietary implementation terms", () => {
  assert.doesNotMatch(text, /投资人|融资|路演|回报|Investor Edition/i);
  assert.doesNotMatch(
    text,
    /storyflow_|\/api\/|\bRLS\b|Supabase|DeepSeek|Atlas Cloud|SHA-256|manifest\.json|idempoten|数据库表|存储路径/i,
  );
});

test("whitepaper separates delivery states", () => {
  assert.match(text, /当前能力/);
  assert.match(text, /正在建设/);
  assert.match(text, /中长期方向/);
});

test("whitepaper has the approved page count and distribution notice", () => {
  assert.equal(manuscript.pages.length, 20);
  assert.equal(manuscript.metadata.notice, "Confidential · Limited Distribution");
  assert.equal(manuscript.metadata.disclosure, "本版本已省略专有技术与实施细节");
});
