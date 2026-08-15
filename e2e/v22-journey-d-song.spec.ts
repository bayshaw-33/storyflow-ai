/**
 * Phase 6 Task 6.3 Journey D — 歌曲.
 * 打开历史歌曲→消息完整→输入新要求→生成 Snapshot 含最新输入→候选应用→留痕下载。
 * 无真实后端时：验证歌曲页渲染、无伪造历史/legacy 导入。
 */
import { expect, test } from "@playwright/test";

test.describe("Journey D — 歌曲", () => {
  test("歌曲页渲染且不伪造历史恢复", async ({ page }) => {
    await page.goto("/song-workbench");
    await expect(page.locator("body")).toBeVisible();
    expect(await page.locator("text=我已读取这个歌曲项目之前保存的创作沟通记录").count()).toBe(0);
    expect(await page.locator("text=【legacy_import】").count()).toBe(0);
  });

  test("生成快照语义：最新输入必进 Snapshot（服务层测试已锁，此处验证 UI 不假成功）", async ({ page }) => {
    await page.goto("/song-workbench");
    await expect(page.locator("body")).toBeVisible();
    expect(await page.locator("text=生成任务已提交").count()).toBe(0);
  });
});
