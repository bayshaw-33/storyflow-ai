import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("订阅页明确区分 ELITE/PRO，并且支付未配置时不静默授予付费档位", () => {
  const source = read("components/pricing/MonetizationLayer.tsx");
  assert.match(source, /ELITE 和 PRO|ELITE and PRO/);
  assert.match(source, /平台额度|platform credits/);
  assert.match(source, /自接 API|BYO API/);
  assert.match(source, /付费支付尚未开放|Paid checkout is not available/);
  assert.doesNotMatch(
    source,
    /if \(response\.status !== 501[\s\S]*?updateProfilePlan\(tier, user\.id\)/,
  );
});
