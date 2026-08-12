/**
 * K2-T-04 多模型选择与解释 测试
 *
 * 验证：
 *   1. fixture 数据结构符合 ModelDescriptor / ModelRecommendation / RoutingRecord 契约
 *   2. contract_version 校验
 *   3. 推荐匹配逻辑（taskType + taskParams → recommendedModelId）
 *   4. 筛选逻辑（按 type/quality/speed/cost/status 组合）
 *   5. 不可用模型标记与禁用原因
 *   6. 降级记录可读性
 *   7. 防漂移断言：TS 内联 (fixture-data.ts) 与 JSON (models.json) 一致
 *
 * 运行：node --test tests/ui-v2/model-router/*.test.mjs
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { CONTRACT_VERSION } from "../../../lib/client/v2/models/types.ts";
import { FIXTURE_DATASET } from "../../../lib/client/v2/models/fixture-data.ts";
import {
  matchRecommendation,
  filterModels,
  getDisabledReason,
  formatCostPreview,
  formatDegradationNotice,
  formatRoutingDegradation,
  buildDecisionRuntime,
  costLevelSymbol,
  speedRangeLabel,
  statusColor,
} from "../../../lib/client/v2/models/router.ts";

// ============================================================
// 加载 JSON 镜像与 TS 内联数据
// ============================================================

const raw = readFileSync("tests/fixtures/kiikis-v2/models.json", "utf8");
const jsonDataset = JSON.parse(raw);
const tsDataset = FIXTURE_DATASET;

const VALID_TYPES = ["text", "image", "edit", "video", "audio"];
const VALID_QUALITIES = ["high", "medium", "standard"];
const VALID_SPEEDS = ["fast", "medium", "slow"];
const VALID_COSTS = ["low", "medium", "high"];
const VALID_REF = ["yes", "no"];
const VALID_CONSISTENCY = ["strong", "medium", "weak"];
const VALID_STATUSES = ["available", "degraded", "unavailable"];
const VALID_RESULT_STATUSES = [
  "draft",
  "pending_confirm",
  "queued",
  "running",
  "result_ingesting",
  "completed",
  "partial_failure",
  "failed",
  "cancelled",
];

// ============================================================
// 1. contract_version 校验
// ============================================================

test("JSON fixture contractVersion 等于常量 CONTRACT_VERSION", () => {
  assert.equal(jsonDataset.contractVersion, "2.0.0-alpha.1");
  assert.equal(jsonDataset.contractVersion, CONTRACT_VERSION);
});

test("TS 内联 dataset contractVersion 等于 CONTRACT_VERSION", () => {
  assert.equal(tsDataset.contractVersion, CONTRACT_VERSION);
});

// ============================================================
// 2. fixture 结构契约
// ============================================================

test("models 至少 10 个，覆盖全部 5 个类型与 3 个状态", () => {
  assert.ok(Array.isArray(jsonDataset.models), "models 必须是数组");
  assert.ok(jsonDataset.models.length >= 10, `models 至少 10 个，实际 ${jsonDataset.models.length}`);

  const types = new Set(jsonDataset.models.map((m) => m.type));
  for (const t of VALID_TYPES) {
    assert.ok(types.has(t), `缺少类型 ${t}`);
  }

  const statuses = new Set(jsonDataset.models.map((m) => m.status));
  for (const s of VALID_STATUSES) {
    assert.ok(statuses.has(s), `缺少状态 ${s}`);
  }
});

test("每个 model 字段结构符合 ModelDescriptor 契约", () => {
  for (const m of jsonDataset.models) {
    assert.equal(typeof m.id, "string", "id 必须是 string");
    assert.equal(typeof m.name, "string", "name 必须是 string");
    assert.equal(typeof m.provider, "string", "provider 必须是 string");
    assert.ok(VALID_TYPES.includes(m.type), `type 非法: ${m.type}`);
    assert.ok(VALID_QUALITIES.includes(m.capabilities.quality), `quality 非法: ${m.capabilities.quality}`);
    assert.ok(VALID_SPEEDS.includes(m.capabilities.speed), `speed 非法: ${m.capabilities.speed}`);
    assert.ok(VALID_COSTS.includes(m.capabilities.cost), `cost 非法: ${m.capabilities.cost}`);
    assert.ok(VALID_REF.includes(m.capabilities.referenceImage), `referenceImage 非法: ${m.capabilities.referenceImage}`);
    assert.ok(VALID_CONSISTENCY.includes(m.capabilities.consistency), `consistency 非法: ${m.capabilities.consistency}`);
    assert.ok(VALID_STATUSES.includes(m.status), `status 非法: ${m.status}`);
    if (m.status !== "available") {
      assert.ok(m.statusReason, `status=${m.status} 必须有 statusReason`);
    }
    assert.equal(typeof m.costEstimate.min, "number");
    assert.equal(typeof m.costEstimate.max, "number");
    assert.equal(typeof m.costEstimate.unit, "string");
    assert.ok(Array.isArray(m.suitableTasks), "suitableTasks 必须是数组");
    assert.ok(Array.isArray(m.limitations), "limitations 必须是数组");
    assert.ok(m.limitations.length > 0, `${m.id} 应至少有一个 limitation`);
  }
});

test("recommendations 至少 5 个，每个 recommendedModelId 都在 models 中存在", () => {
  assert.ok(jsonDataset.recommendations.length >= 5, `recommendations 至少 5 个，实际 ${jsonDataset.recommendations.length}`);
  const modelIds = new Set(jsonDataset.models.map((m) => m.id));
  for (const r of jsonDataset.recommendations) {
    assert.equal(typeof r.taskType, "string");
    assert.ok(typeof r.taskParams === "object" && r.taskParams !== null);
    assert.ok(modelIds.has(r.recommendedModelId), `推荐引用了不存在的模型: ${r.recommendedModelId}`);
    assert.equal(typeof r.reason, "string");
    assert.ok(r.reason.length > 10, `推荐理由过短: ${r.reason}`);
    assert.ok(VALID_SPEEDS.includes(r.estimatedSpeed), `estimatedSpeed 非法: ${r.estimatedSpeed}`);
    assert.ok(VALID_COSTS.includes(r.costLevel), `costLevel 非法: ${r.costLevel}`);
    assert.equal(typeof r.suitableFor, "string");
    assert.equal(typeof r.limitations, "string");
  }
});

test("routingRecords 至少 5 个，含降级案例，字段符合契约", () => {
  assert.ok(jsonDataset.routingRecords.length >= 5, `routingRecords 至少 5 个，实际 ${jsonDataset.routingRecords.length}`);
  const degraded = jsonDataset.routingRecords.filter((r) => r.degraded);
  assert.ok(degraded.length >= 2, `应至少有 2 个降级记录，实际 ${degraded.length}`);

  const modelIds = new Set(jsonDataset.models.map((m) => m.id));
  for (const r of jsonDataset.routingRecords) {
    assert.equal(typeof r.jobId, "string");
    if (r.userChoice !== null && r.userChoice !== undefined) {
      assert.ok(modelIds.has(r.userChoice), `userChoice 引用不存在: ${r.userChoice}`);
    }
    assert.ok(modelIds.has(r.systemRecommendation), `systemRecommendation 引用不存在: ${r.systemRecommendation}`);
    assert.ok(modelIds.has(r.actualModel), `actualModel 引用不存在: ${r.actualModel}`);
    assert.equal(typeof r.degraded, "boolean");
    if (r.degraded) {
      assert.ok(r.downgradeReason, `降级记录 ${r.jobId} 必须有 downgradeReason`);
      assert.ok(r.downgradeReason.length > 10, `降级原因过短: ${r.downgradeReason}`);
    }
    assert.equal(typeof r.estimatedCost, "number");
    assert.equal(typeof r.actualCost, "number");
    assert.ok(VALID_RESULT_STATUSES.includes(r.resultStatus), `resultStatus 非法: ${r.resultStatus}`);
  }
});

test("stats 计数与实际数据一致", () => {
  const stats = jsonDataset.stats;
  assert.equal(stats.totalModels, jsonDataset.models.length);
  for (const t of VALID_TYPES) {
    const expected = jsonDataset.models.filter((m) => m.type === t).length;
    assert.equal(stats.byType[t], expected, `byType[${t}] 不匹配`);
  }
  for (const s of VALID_STATUSES) {
    const expected = jsonDataset.models.filter((m) => m.status === s).length;
    assert.equal(stats.byStatus[s], expected, `byStatus[${s}] 不匹配`);
  }
  const statusSum = VALID_STATUSES.reduce((sum, s) => sum + stats.byStatus[s], 0);
  assert.equal(statusSum, stats.totalModels, "byStatus 之和必须等于 totalModels");
});

// ============================================================
// 3. 推荐匹配逻辑
// ============================================================

test("matchRecommendation 按 taskType 返回推荐模型", () => {
  const match = matchRecommendation(
    jsonDataset.recommendations,
    jsonDataset.models,
    "character_image",
    { referenceImage: "yes", quality: "high", consistency: "strong" },
  );
  assert.ok(match, "character_image 应有匹配推荐");
  assert.equal(match.recommendation.taskType, "character_image");
  assert.equal(match.model.id, match.recommendation.recommendedModelId);
});

test("matchRecommendation 按 taskParams 字段交集排序选择最优", () => {
  // character_image 推荐的模型是 nano-banana-pro/edit-ultra，且参数完全匹配
  const match = matchRecommendation(
    jsonDataset.recommendations,
    jsonDataset.models,
    "character_image",
    { referenceImage: "yes", quality: "high", consistency: "strong" },
  );
  assert.ok(match);
  assert.equal(match.model.id, "google/nano-banana-pro/edit-ultra");
});

test("matchRecommendation 对未知 taskType 返回 null", () => {
  const match = matchRecommendation(
    jsonDataset.recommendations,
    jsonDataset.models,
    "unknown_task_type",
    {},
  );
  assert.equal(match, null);
});

test("matchRecommendation 跳过 unavailable 模型", () => {
  // 构造一个推荐指向 unavailable 模型的场景
  const recs = [
    {
      taskType: "test_task",
      taskParams: {},
      recommendedModelId: "minimax-m3", // unavailable
      reason: "测试 unavailable 跳过",
      estimatedSpeed: "fast",
      costLevel: "low",
      suitableFor: "test",
      limitations: "test",
    },
    {
      taskType: "test_task",
      taskParams: {},
      recommendedModelId: "deepseek-chat", // available
      reason: "fallback 推荐",
      estimatedSpeed: "fast",
      costLevel: "low",
      suitableFor: "test",
      limitations: "test",
    },
  ];
  const match = matchRecommendation(recs, jsonDataset.models, "test_task", {});
  assert.ok(match);
  assert.equal(match.model.id, "deepseek-chat");
});

// ============================================================
// 4. 筛选逻辑
// ============================================================

test("filterModels 按 type 筛选", () => {
  const image = filterModels(jsonDataset.models, { type: "image" });
  assert.ok(image.length >= 4, `image 模型至少 4 个，实际 ${image.length}`);
  for (const m of image) assert.equal(m.type, "image");
});

test("filterModels 按 status 筛选 available", () => {
  const avail = filterModels(jsonDataset.models, { status: "available" });
  assert.ok(avail.length >= 10, `available 模型至少 10 个，实际 ${avail.length}`);
  for (const m of avail) assert.equal(m.status, "available");
});

test("filterModels 按 quality+cost 组合筛选", () => {
  const highCostLow = filterModels(jsonDataset.models, { quality: "high", cost: "low" });
  for (const m of highCostLow) {
    assert.equal(m.capabilities.quality, "high");
    assert.equal(m.capabilities.cost, "low");
  }
  // deepseek-chat 应该满足 high quality + low cost
  assert.ok(highCostLow.some((m) => m.id === "deepseek-chat"));
});

test("filterModels 按 referenceImage + consistency 组合筛选", () => {
  const refYesStrong = filterModels(jsonDataset.models, { referenceImage: "yes", consistency: "strong" });
  for (const m of refYesStrong) {
    assert.equal(m.capabilities.referenceImage, "yes");
    assert.equal(m.capabilities.consistency, "strong");
  }
  // gpt-image-2/edit 满足
  assert.ok(refYesStrong.some((m) => m.id === "openai/gpt-image-2/edit"));
});

test("filterModels 空筛选返回全部模型", () => {
  const all = filterModels(jsonDataset.models, {});
  assert.equal(all.length, jsonDataset.models.length);
});

test("filterModels 全维度组合返回合理子集", () => {
  const result = filterModels(jsonDataset.models, {
    type: "edit",
    quality: "high",
    speed: "slow",
    cost: "high",
    referenceImage: "yes",
    consistency: "strong",
    status: "available",
  });
  // nano-banana-pro/edit-ultra 满足全部
  assert.ok(result.some((m) => m.id === "google/nano-banana-pro/edit-ultra"));
  for (const m of result) {
    assert.equal(m.type, "edit");
    assert.equal(m.capabilities.quality, "high");
    assert.equal(m.capabilities.speed, "slow");
    assert.equal(m.capabilities.cost, "high");
    assert.equal(m.capabilities.referenceImage, "yes");
    assert.equal(m.capabilities.consistency, "strong");
    assert.equal(m.status, "available");
  }
});

// ============================================================
// 5. 不可用模型标记
// ============================================================

test("getDisabledReason 对 unavailable 模型返回禁用原因", () => {
  const minimax = jsonDataset.models.find((m) => m.id === "minimax-m3");
  assert.ok(minimax);
  const reason = getDisabledReason(minimax);
  assert.ok(reason, "minimax-m3 应被禁用");
  assert.ok(reason.includes("下线") || reason.includes("不可用"), `禁用原因应说明不可用，实际: ${reason}`);
});

test("getDisabledReason 对 available 模型返回 null", () => {
  const deepseek = jsonDataset.models.find((m) => m.id === "deepseek-chat");
  assert.ok(deepseek);
  const reason = getDisabledReason(deepseek);
  assert.equal(reason, null);
});

test("getDisabledReason 对 taskType 不匹配的模型返回原因", () => {
  const deepseek = jsonDataset.models.find((m) => m.id === "deepseek-chat");
  // deepseek 的 suitableTasks 不含 character_image
  const reason = getDisabledReason(deepseek, "character_image");
  assert.ok(reason, "deepseek 对 character_image 任务应被标记不适合");
  assert.ok(reason.includes("不适合"), `应说明不适合，实际: ${reason}`);
});

test("fixture 中所有 unavailable 模型有 statusReason", () => {
  const unavailable = jsonDataset.models.filter((m) => m.status === "unavailable");
  assert.ok(unavailable.length >= 2, `应至少有 2 个 unavailable 模型，实际 ${unavailable.length}`);
  for (const m of unavailable) {
    assert.ok(m.statusReason, `${m.id} 应有 statusReason`);
    assert.ok(m.statusReason.length > 5, `${m.id} statusReason 过短`);
  }
});

// ============================================================
// 6. 降级记录可读性
// ============================================================

test("formatRoutingDegradation 对降级记录返回可读原因", () => {
  const degraded = jsonDataset.routingRecords.filter((r) => r.degraded);
  for (const r of degraded) {
    const text = formatRoutingDegradation(r);
    assert.ok(text, `${r.jobId} 应有降级提示`);
    assert.ok(text.length > 10, `${r.jobId} 降级提示过短: ${text}`);
    // 可读性：必须包含"降级"或"已"
    assert.ok(text.includes("降级") || text.includes("已"), `降级提示应说明降级动作，实际: ${text}`);
  }
});

test("formatRoutingDegradation 对非降级记录返回 null", () => {
  const normal = jsonDataset.routingRecords.find((r) => !r.degraded);
  assert.ok(normal);
  assert.equal(formatRoutingDegradation(normal), null);
});

test("formatDegradationNotice 优先使用传入的 reason", () => {
  const original = jsonDataset.models.find((m) => m.id === "qwen/qwen-image-2.0-pro/edit");
  const actual = jsonDataset.models.find((m) => m.id === "google/nano-banana-2/edit");
  assert.ok(original && actual);
  const customReason = "自定义降级原因：限额不足";
  const text = formatDegradationNotice(original, actual, customReason);
  assert.equal(text, customReason);
});

test("formatDegradationNotice 无 reason 时返回默认提示", () => {
  const original = jsonDataset.models.find((m) => m.id === "qwen/qwen-image-2.0-pro/edit");
  const actual = jsonDataset.models.find((m) => m.id === "google/nano-banana-2/edit");
  assert.ok(original && actual);
  const text = formatDegradationNotice(original, actual, null);
  assert.ok(text.includes(actual.name), `默认提示应包含实际模型名，实际: ${text}`);
});

test("所有降级记录的 downgradeReason 都引用了实际模型或原因", () => {
  const degraded = jsonDataset.routingRecords.filter((r) => r.degraded);
  for (const r of degraded) {
    assert.ok(r.downgradeReason);
    // 降级原因应说明降级到了哪个模型或原因
    const actualName = jsonDataset.models.find((m) => m.id === r.actualModel)?.name || r.actualModel;
    const reasonMentionsActual =
      r.downgradeReason.includes(actualName) ||
      r.downgradeReason.includes(r.actualModel) ||
      r.downgradeReason.includes("降级");
    assert.ok(reasonMentionsActual, `${r.jobId} 降级原因应引用实际模型或降级动作: ${r.downgradeReason}`);
  }
});

// ============================================================
// 7. 成本预览与等级标签
// ============================================================

test("formatCostPreview 返回可读成本字符串", () => {
  const model = jsonDataset.models.find((m) => m.id === "bytedance/seedream-v5.0-pro/text-to-image");
  assert.ok(model);
  const text = formatCostPreview(model);
  assert.ok(text.includes("¥"), `成本预览应包含 ¥，实际: ${text}`);
  assert.ok(text.includes("0.5"), `成本预览应包含 min 成本，实际: ${text}`);
  assert.ok(text.includes("1.2"), `成本预览应包含 max 成本，实际: ${text}`);
  assert.ok(text.includes("张"), `成本预览应包含单位，实际: ${text}`);
});

test("formatCostPreview 对 unavailable 模型标注不可用", () => {
  const model = jsonDataset.models.find((m) => m.id === "minimax-m3");
  assert.ok(model);
  const text = formatCostPreview(model);
  assert.ok(text.includes("不可用") || text.includes("¥0"), `unavailable 模型成本应标注不可用或 0，实际: ${text}`);
});

test("costLevelSymbol 返回正确的 ¥ 等级符号", () => {
  assert.equal(costLevelSymbol("low"), "¥");
  assert.equal(costLevelSymbol("medium"), "¥¥");
  assert.equal(costLevelSymbol("high"), "¥¥¥");
});

test("speedRangeLabel 返回中文区间", () => {
  assert.ok(speedRangeLabel("fast", "zh-CN").includes("秒"));
  assert.ok(speedRangeLabel("slow", "zh-CN").includes("秒"));
});

test("statusColor 对齐深色主题", () => {
  assert.equal(statusColor("available"), "#7dd181");
  assert.equal(statusColor("degraded"), "#ffd166");
  assert.equal(statusColor("unavailable"), "#ff8b8b");
});

// ============================================================
// 8. ModelDecisionRuntime 构造
// ============================================================

test("buildDecisionRuntime 智能模式构造正确", () => {
  const rec = jsonDataset.recommendations[0];
  const model = jsonDataset.models.find((m) => m.id === rec.recommendedModelId);
  assert.ok(model);
  const decision = buildDecisionRuntime(
    "smart",
    rec,
    model,
    model,
    false,
    null,
  );
  assert.equal(decision.mode, "smart");
  assert.equal(decision.recommendationReason, rec.reason);
  assert.equal(decision.estimatedSpeed, rec.estimatedSpeed);
  assert.equal(decision.estimatedCostTier, rec.costLevel);
  assert.equal(decision.selectedModelKey, model.id);
  assert.equal(decision.actualModelKey, model.id);
  assert.equal(decision.wasDegraded, false);
  assert.equal(decision.degradationReason, null);
});

test("buildDecisionRuntime 专业模式 + 降级构造正确", () => {
  const userSelected = jsonDataset.models.find((m) => m.id === "qwen/qwen-image-2.0-pro/edit");
  const actual = jsonDataset.models.find((m) => m.id === "google/nano-banana-2/edit");
  assert.ok(userSelected && actual);
  const decision = buildDecisionRuntime(
    "professional",
    null,
    userSelected,
    actual,
    true,
    "限额不足，已降级",
  );
  assert.equal(decision.mode, "professional");
  assert.ok(decision.recommendationReason.includes(userSelected.name));
  assert.equal(decision.selectedModelKey, userSelected.id);
  assert.equal(decision.actualModelKey, actual.id);
  assert.equal(decision.wasDegraded, true);
  assert.equal(decision.degradationReason, "限额不足，已降级");
});

// ============================================================
// 9. 防漂移断言：TS 内联与 JSON 一致
// ============================================================

test("TS 内联与 JSON models 数量一致", () => {
  assert.equal(tsDataset.models.length, jsonDataset.models.length);
});

test("TS 内联与 JSON models 逐项 id 一致", () => {
  const tsIds = tsDataset.models.map((m) => m.id);
  const jsonIds = jsonDataset.models.map((m) => m.id);
  assert.deepEqual(tsIds, jsonIds);
});

test("TS 内联与 JSON recommendations 逐项一致", () => {
  assert.equal(tsDataset.recommendations.length, jsonDataset.recommendations.length);
  for (let i = 0; i < tsDataset.recommendations.length; i++) {
    const ts = tsDataset.recommendations[i];
    const json = jsonDataset.recommendations[i];
    assert.equal(ts.taskType, json.taskType);
    assert.equal(ts.recommendedModelId, json.recommendedModelId);
    assert.equal(ts.reason, json.reason);
    assert.equal(ts.estimatedSpeed, json.estimatedSpeed);
    assert.equal(ts.costLevel, json.costLevel);
    assert.deepEqual(ts.taskParams, json.taskParams);
  }
});

test("TS 内联与 JSON routingRecords 逐项一致", () => {
  assert.equal(tsDataset.routingRecords.length, jsonDataset.routingRecords.length);
  for (let i = 0; i < tsDataset.routingRecords.length; i++) {
    const ts = tsDataset.routingRecords[i];
    const json = jsonDataset.routingRecords[i];
    assert.equal(ts.jobId, json.jobId);
    assert.equal(ts.systemRecommendation, json.systemRecommendation);
    assert.equal(ts.actualModel, json.actualModel);
    assert.equal(ts.degraded, json.degraded);
    assert.equal(ts.downgradeReason, json.downgradeReason);
    assert.equal(ts.estimatedCost, json.estimatedCost);
    assert.equal(ts.actualCost, json.actualCost);
    assert.equal(ts.resultStatus, json.resultStatus);
  }
});

test("TS 内联与 JSON stats 一致", () => {
  assert.equal(tsDataset.stats.totalModels, jsonDataset.stats.totalModels);
  assert.deepEqual(tsDataset.stats.byType, jsonDataset.stats.byType);
  assert.deepEqual(tsDataset.stats.byStatus, jsonDataset.stats.byStatus);
});

// ============================================================
// 10. 不把 KIIKIS 描述为只有单模型（验收标准）
// ============================================================

test("模型库不只有单一模型（至少 3 个 provider，至少 10 个模型）", () => {
  const providers = new Set(jsonDataset.models.map((m) => m.provider));
  assert.ok(providers.size >= 3, `应至少有 3 个 provider，实际 ${providers.size}: ${Array.from(providers).join(", ")}`);
  assert.ok(jsonDataset.models.length >= 10, `应至少有 10 个模型，实际 ${jsonDataset.models.length}`);
});

test("可用模型覆盖至少 4 种类型（text/image/edit/video/audio）", () => {
  const availTypes = new Set(
    jsonDataset.models.filter((m) => m.status === "available").map((m) => m.type),
  );
  assert.ok(availTypes.size >= 4, `available 模型应覆盖至少 4 种类型，实际 ${availTypes.size}`);
});
