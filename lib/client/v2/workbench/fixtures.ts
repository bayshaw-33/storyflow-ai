// 工作台外壳 fixture 加载器。
// 从 TS 内联模块（fixture-data.ts）读取，Node 与浏览器通用。
// 不用 dynamic import JSON，避免 Next.js webpack 不打包 tests/ 导致浏览器端加载失败。
// JSON 文件 tests/fixtures/kiikis-v2/workbench.json 作为集成校验依据，由测试断言一致。

import { workbenchFixture } from "./fixture-data.ts";
import { assertContractVersion, type WorkbenchData } from "./types.ts";

export type WorkbenchFixtureName = "workbench";

export class WorkbenchFixtureError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkbenchFixtureError";
    this.code = code;
  }
}

/**
 * 加载 fixture：返回深拷贝避免调用方误改内联常量。
 * 浏览器与 Node 共用同一实现（直接读 TS 模块，不走 fs / dynamic import）。
 */
export function loadWorkbenchFixture(name: WorkbenchFixtureName = "workbench"): WorkbenchData {
  if (name !== "workbench") {
    throw new WorkbenchFixtureError(
      "WORKBENCH_FIXTURE_NOT_FOUND",
      `未知 fixture: ${name}`,
    );
  }
  // 深拷贝，避免调用方修改内联常量导致后续读取漂移。
  const data = JSON.parse(JSON.stringify(workbenchFixture)) as WorkbenchData;
  assertContractVersion(data.contractVersion);
  return data;
}

// 获取内联 fixture 的只读引用（用于防漂移断言，不做拷贝）。
export function getRawWorkbenchFixture(): WorkbenchData {
  return workbenchFixture;
}
