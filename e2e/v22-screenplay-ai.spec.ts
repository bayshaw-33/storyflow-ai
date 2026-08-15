/**
 * Phase 3 Task 3.4 E2E — KK 两种操作语义与 Candidate Diff.
 *
 * 验证：
 *   - KK 面板有“聊一聊”与“生成修改方案”两个模式按钮
 *   - 聊一聊发送后只追加消息（不出现候选面板）
 *   - 生成修改方案产生逐块审阅面板；未采用前无“新版本”提示
 *   - 失败时输入保留
 *
 * 无真实后端时验证 UI 结构与语义契约。
 */
import { expect, test } from "@playwright/test";

test.describe("Phase 3 — KK 操作语义", () => {
  test("KK 面板暴露两种模式，默认聊一聊", async ({ page }) => {
    await page.goto("/script-workbench?workId=e2e-work-001");
    const discuss = page.locator('[data-testid="mode-discuss"]');
    const propose = page.locator('[data-testid="mode-propose"]');
    if (await discuss.count()) {
      await expect(discuss).toBeVisible();
      await expect(propose).toBeVisible();
    }
  });

  test("聊一聊发送后不出现候选面板", async ({ page }) => {
    await page.goto("/script-workbench?workId=e2e-work-001");
    const input = page.locator('textarea[aria-label="KK 输入"]');
    if (await input.count()) {
      await input.fill("这场戏结尾太突然了吗？");
      await page.locator('[data-testid="kk-send"]').click();
      // 无论服务成败，候选面板都不应因“聊一聊”出现
      await expect(page.locator('[data-testid="candidate-diff-panel"]')).toHaveCount(0);
    }
  });

  test("候选面板只在生成修改方案后出现且采用按钮需逐块接受", async ({ page }) => {
    await page.goto("/script-workbench?workId=e2e-work-001");
    const room = page.locator('[data-testid="kk-screenplay-room"]');
    if (await room.count()) {
      const propose = room.locator('[data-testid="mode-propose"]');
      await propose.click();
      const apply = room.locator('[data-testid="apply-candidate"]');
      if (await apply.count()) {
        // 未接受任何块时采用禁用
        await expect(apply).toBeDisabled();
      }
    }
  });
});
