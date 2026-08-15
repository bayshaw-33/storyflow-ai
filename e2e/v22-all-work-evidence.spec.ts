/**
 * Phase 5 Task 5.6 E2E — 七类 Work Evidence.
 *
 * 无真实后端时验证：
 *   - 导出 API 未配置时返回真实失败（不伪造包）
 *   - 各工作台渲染不崩溃
 */
import { expect, test } from "@playwright/test";

test.describe("Phase 5 — 横向 Evidence 与导出", () => {
  test("导出 API 未配置后端时返回真实失败", async ({ request }) => {
    const response = await request.post("/api/export/production-package", {
      data: { projectId: "missing-project" },
    });
    expect([401, 403, 404, 503]).toContain(response.status());
    const body = await response.json().catch(() => ({}));
    expect(body.success).not.toBe(true);
  });

  test("song-workbench 页面渲染", async ({ page }) => {
    await page.goto("/song-workbench");
    await expect(page.locator("body")).toBeVisible();
  });
});
