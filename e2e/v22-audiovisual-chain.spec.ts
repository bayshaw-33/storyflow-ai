/**
 * Phase 5 Task 5.3 E2E — 音视频链路.
 *
 * 无真实后端时验证：
 *   - 分镜页渲染（单一入口，无独立动态分镜 Tab）
 *   - 视频页渲染且不伪造 provider 成功
 */
import { expect, test } from "@playwright/test";

test.describe("Phase 5 — 剧本→美术→分镜→视频链路", () => {
  test("storyboard-workbench 单一入口渲染", async ({ page }) => {
    await page.goto("/storyboard-workbench");
    await expect(page.locator("body")).toBeVisible();
    // 不出现“动态分镜”作为独立顶级 Tab 的入口文案
    const dynamicTab = page.locator('text=动态分镜').first();
    const count = await dynamicTab.count();
    expect(count).toBe(0);
  });

  test("video-workbench 渲染且不伪造 provider 成功", async ({ page }) => {
    await page.goto("/video-workbench");
    await expect(page.locator("body")).toBeVisible();
    // 无后端时不应出现“已生成”假成功标记
    const fakeReady = page.locator('text=视频已生成').first();
    const count = await fakeReady.count();
    expect(count).toBe(0);
  });
});
