import { expect, test, type Page } from "@playwright/test";

const projectId = process.env.V22_E2E_PROJECT_ID || "";
const scriptWorkId = process.env.V22_E2E_SCRIPT_WORK_ID || "";
const token = process.env.V22_E2E_TOKEN || "";
const userId = process.env.V22_E2E_USER_ID || "";
const supabaseRef = process.env.V22_E2E_SUPABASE_REF || "vgcafbzksizlwmylphzu";
const requiresAuth = !projectId || !scriptWorkId || !token;

async function installSession(page: Page) {
  await page.addInitScript(({ storageKey, accessToken, sessionUser }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      access_token: accessToken,
      refresh_token: "v22-e2e-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: "bearer",
      user: sessionUser,
    }));
  }, {
    storageKey: `sb-${supabaseRef}-auth-token`,
    accessToken: token,
    sessionUser: { id: userId || "v22-e2e-user", aud: "authenticated", role: "authenticated" },
  });
}

test.describe("V2.2 unified production workbench", () => {
  test.skip(requiresAuth, "需要 V22_E2E_PROJECT_ID、V22_E2E_SCRIPT_WORK_ID 和 V22_E2E_TOKEN");

  test("authenticated account can move through the four production stages", async ({ page }) => {
    await installSession(page);
    await page.goto(`/production?projectId=${encodeURIComponent(projectId)}&workId=${encodeURIComponent(scriptWorkId)}&tab=script`);

    await expect(page.getByRole("tab", { name: "剧本" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "美术" }).click();
    await expect(page).toHaveURL(/tab=art/);
    await page.getByRole("tab", { name: "分镜" }).click();
    await expect(page).toHaveURL(/tab=storyboard/);
    await expect(page.getByRole("tab", { name: "动态分镜" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "运动预览" })).toHaveCount(1);
    await page.getByRole("tab", { name: "视频" }).click();
    await expect(page).toHaveURL(/tab=video/);
  });

  test("storyboard canvas supports viewport controls, notes, and exports", async ({ page }) => {
    await installSession(page);
    await page.goto(`/production?projectId=${encodeURIComponent(projectId)}&workId=${encodeURIComponent(scriptWorkId)}&tab=storyboard&view=canvas`);

    const canvas = page.getByTestId("storyboard-canvas");
    await expect(canvas).toBeVisible();
    await expect(page.getByRole("button", { name: "适配视图" })).toBeVisible();
    await expect(page.getByRole("button", { name: "按场次排版" })).toBeVisible();
    await expect(page.getByRole("button", { name: "分组" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "连线" })).toBeDisabled();

    const world = page.getByTestId("canvas-world-layer");
    const before = await world.getAttribute("style");
    await canvas.locator('[title="Shift+拖拽框选"]').evaluate((element) => element.dispatchEvent(new WheelEvent("wheel", { deltaY: -240, bubbles: true })));
    await expect.poll(() => world.getAttribute("style")).not.toBe(before);

    await page.getByRole("button", { name: "适配视图" }).click();
    await page.getByRole("button", { name: "添加便签" }).click();
    await expect(canvas.getByPlaceholder("记录导演备注…")).toBeVisible();
    const board = canvas.locator('[title="Shift+拖拽框选"]');
    await board.click({ button: "right", position: { x: 40, y: 40 } });
    const contextMenu = canvas.getByTestId("canvas-context-menu");
    await expect(contextMenu).toBeVisible();
    await expect(contextMenu.getByRole("menuitem", { name: "添加便签" })).toBeVisible();
    await contextMenu.getByRole("menuitem", { name: "添加便签" }).click();
    await expect(canvas.getByPlaceholder("记录导演备注…")).toHaveCount(2);
    await expect(canvas.getByRole("button", { name: "导出画布" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "导出布局 JSON" })).toBeVisible();
  });
});
