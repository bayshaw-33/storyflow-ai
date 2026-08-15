/**
 * Phase 5 Task 5.2 E2E — 歌曲会话历史恢复.
 *
 * 无真实后端时验证页面结构与失败语义：
 *   - /song-workbench 渲染且不崩溃
 *   - 未配置后端时聊天区显示真实错误/空态，不伪造成功
 */
import { expect, test } from "@playwright/test";

test.describe("Phase 5 — 歌曲会话历史", () => {
  test("song-workbench 页面可渲染且不伪造历史", async ({ page }) => {
    await page.goto("/song-workbench");
    await expect(page.locator("body")).toBeVisible();
    // 若聊天区存在：在无后端时不会出现伪造的恢复成功提示
    const chat = page.locator('text=我已读取这个歌曲项目之前保存的创作沟通记录');
    const count = await chat.count();
    expect(count).toBe(0);
  });

  test("歌曲页不出现 legacy_import 伪造标记", async ({ page }) => {
    await page.goto("/song-workbench");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("text=【legacy_import】")).toHaveCount(0);
  });
});
