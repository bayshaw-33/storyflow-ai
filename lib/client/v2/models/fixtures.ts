/**
 * 多模型选择 fixture 加载器。
 *
 * 严格遵循 fixture 加载模式教训：不从 tests/ 目录动态 import JSON，
 * 而是从 TS 内联模块 (fixture-data.ts) 读取，确保 Next.js/Webpack/Turbopack
 * 与 node --test 都能稳定加载。
 *
 * JSON 镜像 (tests/fixtures/kiikis-v2/models.json) 仅用于测试防漂移断言。
 */
import {
  FIXTURE_DATASET,
  FIXTURE_MODELS,
  FIXTURE_RECOMMENDATIONS,
  FIXTURE_ROUTING_RECORDS,
  FIXTURE_STATS,
} from "./fixture-data";
import { CONTRACT_VERSION, type ModelLibraryDataset } from "./types";

/** 加载完整 fixture 数据集（返回深拷贝，避免调用方误改） */
export function loadFixtureDataset(): ModelLibraryDataset {
  return {
    contractVersion: FIXTURE_DATASET.contractVersion,
    models: FIXTURE_MODELS.map((m) => ({
      ...m,
      capabilities: { ...m.capabilities },
      costEstimate: { ...m.costEstimate },
      suitableTasks: [...m.suitableTasks],
      limitations: [...m.limitations],
    })),
    recommendations: FIXTURE_RECOMMENDATIONS.map((r) => ({
      ...r,
      taskParams: { ...r.taskParams },
    })),
    routingRecords: FIXTURE_ROUTING_RECORDS.map((r) => ({ ...r })),
    stats: {
      totalModels: FIXTURE_STATS.totalModels,
      byType: { ...FIXTURE_STATS.byType },
      byStatus: { ...FIXTURE_STATS.byStatus },
    },
  };
}

/** fixture 契约版本（用于运行时校验） */
export function fixtureContractVersion(): string {
  return CONTRACT_VERSION;
}
