import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manuscript = JSON.parse(
  fs.readFileSync(new URL("../docs/whitepaper/kiikis-whitepaper-2.0-zh.json", import.meta.url), "utf8"),
);
const { pages } = manuscript;
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

  const philosophy = pages.find((page) => page.kicker === "DESIGN PHILOSOPHY");
  assert.equal(philosophy.cards.length, 4);
  assert.deepEqual(
    philosophy.cards.map((card) => card.title),
    ["创意熵减", "技因演化", "知本主义", "长期主义"],
  );
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
    /storyflow_|\/api\/|\bAPI\b|\bRLS\b|Supabase|DeepSeek|Atlas Cloud|SHA-256|manifest\.json|idempoten|内部\s*ID|Prompt|数据库(?:结构|表)|模型路由|存储路径|权限实现|哈希|幂等/i,
  );
});

test("whitepaper separates delivery states", () => {
  const delivery = pages.find((page) => page.kicker === "DELIVERY TRUTH");
  assert.deepEqual(delivery.states.map((state) => state.title), ["当前基础", "Kiikis 2.0", "中长期方向"]);

  const [current, versionTwo, longTerm] = delivery.states.map((state) => state.items.join(" "));
  assert.match(current, /Universe.*初步框架/);
  assert.match(current, /多模型.*基础/);
  assert.doesNotMatch(current, /成熟能力|市场|自动分账|自动确权|完全自动剪辑|结算|收益分配|交易/);
  assert.match(versionTwo, /Universe.*产品化|Universe.*产品核心/);
  assert.doesNotMatch(versionTwo, /市场已上线|自动分账|自动确权|完全自动剪辑/);
  assert.match(longTerm, /结算|收益分配|开放生态/);

  const business = pages.find((page) => page.kicker === "VALUE CAPTURE");
  assert.deepEqual(
    business.stages.map((stage) => stage.title),
    ["当前｜生产服务", "2.0｜团队能力", "中长期｜资产服务", "中长期｜平台服务"],
  );
});

test("whitepaper has the approved page count and distribution notice", () => {
  assert.equal(pages.length, 22);
  assert.deepEqual(
    pages.map((page) => page.layout),
    [
      "cover",
      "problem",
      "statement",
      "problem",
      "layers",
      "universe",
      "loop",
      "pipeline",
      "neutral",
      "actor",
      "identities",
      "loop",
      "evidence",
      "flywheel",
      "states",
      "states",
      "customers",
      "business",
      "moat",
      "roadmap",
      "governance",
      "closing",
    ],
  );
  assert.equal(manuscript.metadata.version, "2026.08");
  assert.equal(manuscript.metadata.notice, "Confidential · Limited Distribution");
  assert.equal(manuscript.metadata.disclosure, "本版本已省略专有技术与实施细节");
});
