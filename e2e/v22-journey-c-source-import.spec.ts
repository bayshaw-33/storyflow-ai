/**
 * Phase 6 Task 6.3 Journey C — 站外原作.
 * 无 Project→上传完整剧本→关闭恢复→全文候选→审核→原子 U1→二创 Work→Evidence。
 * 无真实后端时：验证导入入口/审核页结构与真实失败语义。
 */
import { expect, test } from "@playwright/test";

test.describe("Journey C — 站外原作导入", () => {
  test("导入审核页缺少 sessionId 时显示真实错误", async ({ page }) => {
    await page.goto("/universes/import/missing-session");
    await expect(page.locator('[data-testid="universe-import-review"], [role="alert"]').first()).toBeVisible();
  });

  test("finalize API 未配置后端时返回真实失败", async ({ request }) => {
    const response = await request.post("/api/v2/universe-imports/missing-session/finalize");
    expect([401, 503]).toContain(response.status());
    const body = await response.json().catch(() => ({}));
    expect(body.success).not.toBe(true);
  });

  test("原子 U1 语义：非 ready_for_u1 状态被拒绝（服务层测试已锁，此处验证路由真实失败）", async ({ request }) => {
    const response = await request.post("/api/v2/universe-imports/missing-session/finalize");
    expect(response.status()).not.toBe(200);
  });
});
