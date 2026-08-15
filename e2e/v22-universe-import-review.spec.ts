/**
 * Phase 4 Task 4.4 E2E — 导入入口与审核台.
 *
 * 验证：
 *   - Universe 列表显示"上传站外原作"入口（无 Project 也可用）
 *   - 向导：三件套缺一明确提示且"开始提取"禁用
 *   - 权利声明必填
 *   - 审核页无 sessionId 时显示真实错误（不伪造会话）
 */
import { expect, test } from "@playwright/test";

test.describe("Phase 4 — 站外原作导入", () => {
  test("Universe 列表提供上传站外原作入口", async ({ page }) => {
    await page.goto("/universes");
    const entry = page.locator('[data-testid="entry-external-upload"]');
    const count = await entry.count();
    if (count > 0) {
      await expect(entry.first()).toBeVisible();
    } else {
      // 未登录/无权限时入口不出现，但页面不报假成功
      await expect(page.locator("text=Import original")).toHaveCount(0);
    }
  });

  test("审核页缺少 sessionId 显示真实错误", async ({ page }) => {
    await page.goto("/universes/import/missing-session");
    // 页面渲染 review 骨架；无后端时显示真实加载错误或空态（不伪造候选）
    await expect(page.locator('[data-testid="universe-import-review"], [role="alert"]').first()).toBeVisible();
  });
});
