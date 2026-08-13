/**
 * KIIKIS 2.1 Phase 3 — KK 服务层统一出口 (Task 3.2)
 *
 * 重新导出 kk 子模块的能力，使 API 路由只从此处 import。
 */
export {
  KkProfileServiceError,
  getProfile,
  ensureProfile,
  appendEntitlement,
  listEntitlements,
  getNetEntitlements,
  equipItem,
  listEquipmentHistory,
  grantMilestone,
  type KkProfileFetcher,
  type AppendEntitlementResult,
} from "./profile.ts";

export { kkProfileErrorResponse } from "./http.ts";
