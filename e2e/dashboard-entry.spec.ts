import { expect, test } from "@playwright/test";

const evidenceDirectory = process.env.P0_02_EVIDENCE_DIR;

test.describe("P0-02 dashboard entry", () => {
  test("dashboard route loads without a 404", async ({ page }) => {
    const response = await page.goto("/dashboard");

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: /Welcome back|欢迎回来/ })).toBeVisible();
  });

  for (const locale of [
    { id: "en-US", label: "Start Your Universe", screenshot: "p0-02-dashboard-entry-en.png" },
    { id: "zh-CN", label: "进入你的宇宙", screenshot: "p0-02-dashboard-entry-zh.png" },
  ] as const) {
    test(`${locale.id} landing CTA opens a valid entry flow`, async ({ page }) => {
      await page.addInitScript((nextLocale) => {
        window.localStorage.setItem("kiiskiis_locale", nextLocale);
      }, locale.id);

      const response = await page.goto("/");
      expect(response?.status()).toBeLessThan(400);

      const entryButton = page.getByRole("button", { name: locale.label });
      await expect(entryButton).toBeVisible();
      await entryButton.click();

      await expect(page.locator(".auth-modal")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("404");

      if (evidenceDirectory) {
        await page.screenshot({
          path: `${evidenceDirectory}/${locale.screenshot}`,
          fullPage: false,
        });
      }
    });
  }
});
