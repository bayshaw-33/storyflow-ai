// Kiikis 2.0 Universe fixture 加载器
// 改进自 batch-1 dashboard/fixtures.ts：不再用 dynamic import 加载 tests/ 目录的 JSON，
// 改为从内联 TS 模块 fixture-data.ts 读取，浏览器与 Node 行为一致。
// JSON 文件 tests/fixtures/kiikis-v2/universe.json 仅用于防漂移断言（测试比对）。

import { assertContractVersion, type UniverseBundleV2 } from "./types.ts";
import { universeFixture } from "./fixture-data.ts";

export type UniverseFixtureName = "universe";

export class UniverseFixtureError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "UniverseFixtureError";
    this.code = code;
  }
}

// 校验并返回内联 fixture 数据。
function validateFixture(data: UniverseBundleV2): UniverseBundleV2 {
  if (!data || typeof data !== "object") {
    throw new UniverseFixtureError(
      "UNIVERSE_FIXTURE_INVALID",
      "fixture 数据缺失或非对象",
    );
  }
  if (typeof data.contractVersion !== "string") {
    throw new UniverseFixtureError(
      "UNIVERSE_CONTRACT_MISSING",
      "fixture 缺少 contractVersion 字段",
    );
  }
  assertContractVersion(data.contractVersion);
  return data;
}

// 加载 fixture：浏览器与 Node 行为一致，都从内联 TS 模块读取。
// name 参数保留以便未来扩展多份 fixture，当前仅 "universe"。
export async function loadUniverseFixture(
  _name: UniverseFixtureName = "universe",
): Promise<UniverseBundleV2> {
  // 异步签名保持与 batch-1 dashboard fixtures 一致，便于 api 层统一 await。
  return validateFixture(universeFixture);
}

// 同步版（测试与组件初次渲染可用）。
export function loadUniverseFixtureSync(
  _name: UniverseFixtureName = "universe",
): UniverseBundleV2 {
  return validateFixture(universeFixture);
}
