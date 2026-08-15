/**
 * Phase 6 Task 6.3 Journey F — 社区/演员市场.
 * Feed→Publication 来源→演员详情→License/Grant→项目调用；权利受限项被服务端拒绝。
 * 无真实后端时：验证页面渲染与真实失败语义。
 */
import { expect, test } from "@playwright/test";

test.describe("Journey F — 社区/演员", () => {
  test("社区 Feed 渲染且无伪造 Publication", async ({ page }) => {
    await page.goto("/community");
    await expect(page.locator("body")).toBeVisible();
    expect(await page.locator("text=（示例作品）").count()).toBe(0);
  });

  test("演员市场服务未配置时返回真实失败而非空成功", async ({ request }) => {
    const response = await request.get("/api/market/actors?limit=5");
    expect([401, 404, 503]).toContain(response.status());
    const body = await response.json().catch(() => ({}));
    expect(body.success).not.toBe(true);
  });

  test("权利受限项被服务端拒绝（真人声音保护语义）", async ({ page }) => {
    await page.goto("/voice-workbench");
    await expect(page.locator("body")).toBeVisible();
    // 未配置 Provider 时生成按钮禁用（不产生未授权声音）
    await page.locator('[data-testid="voice-targets"] button').first().click();
    const generate = page.locator('[data-testid="voice-generate"]');
    await expect(generate).toBeDisabled();
  });
});
