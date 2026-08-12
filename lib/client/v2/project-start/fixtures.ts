// K2-T-03 fixture 加载 · Node.js 环境（供测试使用）
// 浏览器端请使用 ./api.ts + ./helpers.ts，它们不依赖 Node.js 内置模块。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import type { ProjectStartFixture } from "./types.ts";

// 从 helpers.ts re-export 纯函数，方便测试统一从 fixtures.ts 导入
export {
  filterUniverseOptions,
  validateContractVersion,
  buildProjectStartRequest,
  resolveWorkbenchRoute,
} from "./helpers.ts";

const FIXTURE_RELATIVE_PATH = "../../../../tests/fixtures/kiikis-v2/project-start.json";

/** 读取 fixture 文件并解析为 ProjectStartFixture */
export function loadProjectStartFixture(): ProjectStartFixture {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(here, FIXTURE_RELATIVE_PATH);
  const raw = readFileSync(fixturePath, "utf-8");
  const parsed = JSON.parse(raw) as ProjectStartFixture;
  return parsed;
}
