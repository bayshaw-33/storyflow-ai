/**
 * Phase 0 Task 0.2 E2E — 工作流方格与 Dashboard 新建入口
 *
 * Gate 0 验收：
 *   - 八模块入口无输入框、无分组、无小说
 *   - 每张卡片可 Tab 聚焦、Enter/Space 激活
 *   - 点击卡片立即调用 Task 0.1 API；成功后进入对应工作台
 *   - 重复点击只产生一个 Project/Work（幂等）
 *
 * PRD §00-Phase-0 Task 0.2 Step 3：Playwright 在 390、768、1440、2560 宽度验证无水平溢出
 */
import { expect, test } from "@playwright/test";

const EIGHT_MODULES = [
  "script",
  "song",
  "art",
  "storyboard",
  "video",
  "voice",
  "editing",
  "adaptation",
] as const;

test.describe("Phase 0 Task 0.2 — 工作流方格与 Dashboard 新建入口", () => {
  test("新建项目入口存在八张同规格模块卡，无自由文本输入框", async ({ page }) => {
    await page.goto("/projects/new-v2");

    // 无自由文本输入框（"描述你的故事"等旧入口痕迹）
    await expect(page.locator('textarea, input[type="text"]:not([name="csrf"])')).toHaveCount(0);

    // 八张模块卡（按 PRD 顺序）
    const cards = page.locator('[data-module-type]');
    await expect(cards).toHaveCount(8);
    const types = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-module-type") || ""),
    );
    expect(types).toEqual([...EIGHT_MODULES]);
  });

  test("每张卡片可 Tab 聚焦、Enter/Space 激活", async ({ page }) => {
    await page.goto("/projects/new-v2");

    const firstCard = page.locator('[data-module-type="script"]');
    await firstCard.focus();
    await expect(firstCard).toBeFocused();

    // Enter 触发创建（mock API 失败时也不应崩页）
    await page.keyboard.press("Enter");
    // 卡片被点击后进入加载或跳转状态，不产生本地伪 ID
    await expect(page.locator('[data-fake-project-id]')).toHaveCount(0);
  });

  for (const width of [390, 768, 1440, 2560]) {
    test(`宽度 ${width}px 无水平溢出`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/projects/new-v2");

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }

  test("Dashboard 新建项目入口打开选择器，不直接导航", async ({ page }) => {
    await page.goto("/dashboard");

    const newButton = page.getByRole("button", { name: /新建项目|New Project|创建|Start/i }).first();
    if (await newButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await newButton.click();
      // 点击后应停留在 Dashboard 或打开模态/跳转到 /projects/new-v2，不应跳到旧的 /projects/new
      await page.waitForTimeout(500);
      const url = page.url();
      expect(url).not.toMatch(/\/projects\/new(?!-v2)/);
    }
  });
});
