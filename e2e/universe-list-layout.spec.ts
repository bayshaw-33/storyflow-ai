import { expect, test } from "@playwright/test";

test("Universe 列表保留卡片墙、紧凑搜索和统计，并避开桌面侧栏", async ({ page }) => {
  await page.goto("/universes");
  await page.waitForLoadState("networkidle");

  const shell = page.locator("main.universe-library-page");
  await expect(shell).toBeVisible();
  await expect(shell.locator('input[type="search"]')).toHaveCount(1);
  await expect(shell.locator("select")).toHaveCount(0);

  const paddingLeft = await shell.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft));
  expect(paddingLeft).toBeGreaterThanOrEqual(128);

  const searchWidth = await shell.locator('input[type="search"]').evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(searchWidth).toBeLessThanOrEqual(280);
});

test("Universe 列表在侧栏隐藏后恢复移动端全宽", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto("/universes");
  await page.waitForLoadState("networkidle");

  const shell = page.locator("main.universe-library-page");
  const paddingLeft = await shell.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft));
  expect(paddingLeft).toBe(0);
  await expect(page.locator(".kk-nav-vertical")).toBeHidden();
});
