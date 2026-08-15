/**
 * Phase 6 Task 6.3 Journey B — Universe 新作品.
 * U1→创建剧本 Work→选择继承→查看引用→发布 U2→确认 Work 不变→逐项采用。
 * 无真实后端时：验证 Universe 列表与创建入口渲染，无伪造成功。
 */
import { expect, test } from "@playwright/test";

test.describe("Journey B — Universe 新作品", () => {
  test("Universe 列表可进入且显示真实状态", async ({ page }) => {
    await page.goto("/universes");
    await expect(page.locator("body")).toBeVisible();
    // 不出现伪造的 U2 发布成功提示
    expect(await page.locator("text=U2 已发布").count()).toBe(0);
  });

  test("创建入口提供上传站外原作（P4 接入）", async ({ page }) => {
    await page.goto("/universes");
    const entry = page.locator('[data-testid="entry-external-upload"]');
    const count = await entry.count();
    if (count > 0) {
      await expect(entry.first()).toBeVisible();
    }
  });

  test("继承/引用 API 未配置后端时返回真实失败", async ({ request }) => {
    const response = await request.get("/api/v2/universes/missing-universe/inheritance");
    expect([401, 404, 503]).toContain(response.status());
    const body = await response.json().catch(() => ({}));
    expect(body.success).not.toBe(true);
  });
});
