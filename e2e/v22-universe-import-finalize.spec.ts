/**
 * Phase 4 Task 4.5 E2E — 原子 finalize.
 *
 * 验证：
 *   - 无后端时 finalize 路由返回真实 503（不伪造成功）
 *   - 审核台在会话不可用时显示真实错误，不显示假候选
 */
import { expect, test } from "@playwright/test";

test.describe("Phase 4 — 原子建立 U1", () => {
  test("finalize API 未配置后端时返回真实失败", async ({ request }) => {
    const response = await request.post("/api/v2/universe-imports/missing-session/finalize");
    // 401 (未登录) 或 503 (服务未配置) 都是真实失败；绝不伪造 success:true
    expect([401, 503]).toContain(response.status());
    const body = await response.json().catch(() => ({}));
    expect(body.success).not.toBe(true);
  });

  test("source-works versions API 未配置后端时返回真实失败", async ({ request }) => {
    const response = await request.get("/api/v2/source-works/missing-work/versions");
    expect([401, 403, 404, 503]).toContain(response.status());
    const body = await response.json().catch(() => ({}));
    expect(body.success).not.toBe(true);
  });
});
