/**
 * Phase 5 Task 5.4 E2E — 配音工作台.
 *
 * 无真实后端时验证：
 *   - 工作台渲染（目标列表 + 编辑器）
 *   - Provider 未配置时生成按钮禁用，不出现假成功
 */
import { expect, test } from "@playwright/test";

test.describe("Phase 5 — 配音工作台", () => {
  test("工作台渲染目标列表与编辑器", async ({ page }) => {
    await page.goto("/voice-workbench");
    await expect(page.locator('[data-testid="voice-workbench"]')).toBeVisible();
    await expect(page.locator('[data-testid="voice-targets"]')).toBeVisible();
    await expect(page.locator('[data-testid="voice-line-editor"]')).toBeVisible();
  });

  test("未配置 Provider 时生成不产生假成功", async ({ page }) => {
    await page.goto("/voice-workbench");
    const generate = page.locator('[data-testid="voice-generate"]');
    await expect(generate).toBeDisabled();
    // 未出现“生成任务已提交”假成功
    await expect(page.locator('text=生成任务已提交')).toHaveCount(0);
  });
});
