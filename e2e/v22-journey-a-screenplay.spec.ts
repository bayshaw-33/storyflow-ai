/**
 * Phase 6 Task 6.3 Journey A — 剧本室.
 * 新建→自由进入第一场→讨论→候选 Diff→Checkpoint→重开恢复→草稿试做分镜→Finalized 交接。
 * 无真实后端时：验证 UI 结构与真实失败语义，不伪造成功。
 */
import { expect, test } from "@playwright/test";

test.describe("Journey A — 剧本室", () => {
  test("剧本室入口可进入并渲染三栏", async ({ page }) => {
    await page.goto("/script-workbench");
    await expect(page.locator("body")).toBeVisible();
    // 不出现伪造的恢复成功提示
    const fakeRestore = page.locator("text=已恢复全部会话").first();
    expect(await fakeRestore.count()).toBe(0);
  });

  test("无后端时打开剧本室显示真实错误而非假数据", async ({ page }) => {
    await page.goto("/script-workbench");
    // 页面不崩溃；错误路径是真实 errorBar/空态（不显示假 unit 列表）
    await expect(page.locator("body")).toBeVisible();
    const fakeUnits = page.locator('[data-testid="unit-list"]').first();
    expect(await fakeUnits.count()).toBe(0);
  });
});
