import { expect, test, type Page } from "@playwright/test";

const projectId = process.env.V22_E2E_PROJECT_ID || "";
const scriptWorkId = process.env.V22_E2E_SCRIPT_WORK_ID || "";
const unitId = process.env.V22_E2E_UNIT_ID || "";
const token = process.env.V22_E2E_TOKEN || "";
const userId = process.env.V22_E2E_USER_ID || "";
const messageMarker = process.env.V22_E2E_MESSAGE_MARKER || "";
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

test.describe("V2.2 screenplay recovery inside production shell", () => {
  test.skip(requiresAuth, "需要 V22_E2E_PROJECT_ID、V22_E2E_SCRIPT_WORK_ID 和 V22_E2E_TOKEN");

  test("legacy screenplay URL redirects to production and refresh restores identity", async ({ page }) => {
    await installSession(page);
    const legacy = `/script-workbench?projectId=${encodeURIComponent(projectId)}&workId=${encodeURIComponent(scriptWorkId)}${unitId ? `&unitId=${encodeURIComponent(unitId)}` : ""}`;
    await page.goto(legacy);
    await expect(page).toHaveURL(/\/production\?/);
    await expect(page).toHaveURL(new RegExp(`projectId=${encodeURIComponent(projectId)}`));
    await expect(page).toHaveURL(new RegExp(`workId=${encodeURIComponent(scriptWorkId)}`));
    if (unitId) await expect(page).toHaveURL(new RegExp(`unitId=${encodeURIComponent(unitId)}`));

    if (messageMarker) {
      await expect(page.getByText(messageMarker, { exact: false })).toBeVisible();
    }

    await page.reload();
    await expect(page).toHaveURL(/tab=script/);
    await expect(page).toHaveURL(new RegExp(`projectId=${encodeURIComponent(projectId)}`));
    await expect(page).toHaveURL(new RegExp(`workId=${encodeURIComponent(scriptWorkId)}`));
    if (unitId) await expect(page).toHaveURL(new RegExp(`unitId=${encodeURIComponent(unitId)}`));
  });
});
