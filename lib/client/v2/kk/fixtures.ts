/**
 * KK 反馈层 fixture 加载器。
 *
 * 从内联 TS 模块（fixture-data.ts）读取演示数据，
 * 不用 dynamic import 加载 tests/ 目录 JSON，避免打包与类型问题。
 * 真实数据走 api.ts 的 API 适配器。
 */
import { FIXTURE_DATASET, FIXTURE_MESSAGES, FIXTURE_SETTINGS, FIXTURE_STATS } from "./fixture-data.ts";
import { CONTRACT_VERSION, type KkMessage, type KkSettings, type KkStats } from "./types.ts";

/** 加载全部 fixture 消息（返回浅拷贝，避免调用方误改） */
export function loadFixtureMessages(): KkMessage[] {
  return FIXTURE_MESSAGES.map((msg) => ({ ...msg }));
}

/** 加载 fixture 设置 */
export function loadFixtureSettings(): KkSettings {
  return { ...FIXTURE_SETTINGS };
}

/** 加载 fixture 预计算统计 */
export function loadFixtureStats(): KkStats {
  return {
    total: FIXTURE_STATS.total,
    unread: FIXTURE_STATS.unread,
    bySeverity: { ...FIXTURE_STATS.bySeverity },
  };
}

/** fixture 契约版本（用于运行时校验） */
export function fixtureContractVersion(): string {
  return FIXTURE_DATASET.contractVersion || CONTRACT_VERSION;
}
