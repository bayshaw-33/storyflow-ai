/**
 * 任务中心 fixture 加载器。
 *
 * 在 USE_FIXTURE 模式下从 tests/fixtures/kiikis-v2/jobs.json 读取演示数据，
 * 覆盖全部 9 个阶段与 7 个任务类型，便于独立演示与测试。
 */
import rawFixture from "@/tests/fixtures/kiikis-v2/jobs.json";
import { CONTRACT_VERSION, type JobStats, type UnifiedJob } from "./types";

/**
 * JSON 导入会把字面量推断为 string，这里断言为契约类型。
 * fixture 受版本控制，结构可信；真实数据走 api.ts 的 API 适配器。
 */
const typed = rawFixture as unknown as {
  contractVersion: string;
  jobs: UnifiedJob[];
  stats: JobStats;
};

/** 加载全部 fixture 任务（返回浅拷贝，避免调用方误改） */
export function loadFixtureJobs(): UnifiedJob[] {
  return typed.jobs.map((job) => ({
    ...job,
    estimatedRangeMs: job.estimatedRangeMs
      ? { ...job.estimatedRangeMs }
      : undefined,
    actions: job.actions.map((a) => ({ ...a })),
  }));
}

/** 加载 fixture 预计算统计 */
export function loadFixtureStats(): JobStats {
  return {
    total: typed.stats.total,
    byStatus: { ...typed.stats.byStatus },
    byType: { ...typed.stats.byType },
  };
}

/** fixture 契约版本（用于运行时校验） */
export function fixtureContractVersion(): string {
  return typed.contractVersion || CONTRACT_VERSION;
}
