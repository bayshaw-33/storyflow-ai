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
});
