// 短剧流 fixture 加载器（K2-T-08）。
// 从 TS 内联模块（fixture-data.ts）读取，Node 与浏览器通用。
// 不用 dynamic import JSON，避免 Next.js webpack 不打包 tests/ 导致浏览器端加载失败。
// JSON 文件 tests/fixtures/kiikis-v2/short-drama.json 作为集成校验依据，由测试断言一致。

import { shortDramaFixture } from "./fixture-data.ts";
import { assertContractVersion, type ShortDramaData } from "./types.ts";

export type ShortDramaFixtureName = "short-drama";

export class ShortDramaFixtureError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ShortDramaFixtureError";
    this.code = code;
  }
}

/**
 * 加载 fixture：返回深拷贝避免调用方误改内联常量。
 * 浏览器与 Node 共用同一实现（直接读 TS 模块，不走 fs / dynamic import）。
 */
export function loadShortDramaFixture(name: ShortDramaFixtureName = "short-drama"): ShortDramaData {
  if (name !== "short-drama") {
    throw new ShortDramaFixtureError(
      "SHORT_DRAMA_FIXTURE_NOT_FOUND",
      `未知 fixture: ${name}`,
    );
  }
  // 深拷贝，避免调用方修改内联常量导致后续读取漂移。
  const data = JSON.parse(JSON.stringify(shortDramaFixture)) as ShortDramaData;
  assertContractVersion(data.contractVersion);
  return data;
}

// 获取内联 fixture 的只读引用（用于防漂移断言，不做拷贝）。
export function getRawShortDramaFixture(): ShortDramaData {
  return shortDramaFixture;
}
