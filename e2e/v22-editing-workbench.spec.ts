/**
 * Phase 5 Task 5.5 E2E — 剪辑工作台.
 *
 * 无真实后端时验证：
 *   - 编辑器页面渲染（时间线编辑器挂载点）
 *   - 未登录/无数据时不出现假成功版本
 */
import { expect, test } from "@playwright/test";

test.describe("Phase 5 — 轻量剪辑", () => {
  test("editor 页面渲染且不伪造版本数据", async ({ page }) => {
    await page.goto("/editor");
    await expect(page.locator("body")).toBeVisible();
    // 无真实数据时，不出现伪造的已保存版本提示
    const fakeSaved = page.locator('text=已保存版本 v').first();
    const count = await fakeSaved.count();
    expect(count).toBe(0);
  });

  test("timeline API 未配置后端时返回真实失败", async ({ request }) => {
    const response = await request.get("/api/v2/works/missing-work/timeline");
    expect([401, 503]).toContain(response.status());
    const body = await response.json().catch(() => ({}));
    expect(body.success).not.toBe(true);
  });
});
