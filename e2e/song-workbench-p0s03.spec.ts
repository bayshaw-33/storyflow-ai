import { expect, test } from "@playwright/test";

const evidenceDirectory = process.env.P0S_03_EVIDENCE_DIR;
const authStorageKey = "sb-cwpyolxitkcpitqizgtq-auth-token";

function fakeAccessToken() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: "00000000-0000-4000-8000-000000000003", exp: Math.floor(Date.now() / 1000) + 3600 }),
    "test-signature",
  ].join(".");
}

function songProject(lyrics: string, stylePrompt: string) {
  return {
    id: "p0s03-song",
    workflowType: "song",
    title: "Moon Song",
    genre: "Pop",
    targetLanguage: "English",
    finalScript: lyrics,
    deliveryPackage: [
      "# Moon Song",
      "",
      "## 歌词",
      lyrics,
      "",
      "## Music Prompt",
      stylePrompt,
    ].join("\n"),
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}

test("enforces the 1000-byte Suno style limit when restoring a draft", async ({ page }) => {
  await page.addInitScript((project) => {
    window.localStorage.setItem("kiiskiis_locale", "en-US");
    window.localStorage.setItem("storyflow-ai-projects-v1", JSON.stringify([project]));
  }, songProject("", "a".repeat(1001)));

  await page.goto("/song-workbench?projectId=p0s03-song");

  const styleInput = page.locator("textarea.song-prompt-textarea");
  await expect(styleInput).toHaveValue("a".repeat(1000));
  await expect(page.getByText("1000/1000 bytes")).toBeVisible();
});

test("refills translated lyrics for the selected language", async ({ page }) => {
  const accessToken = fakeAccessToken();
  const user = {
    id: "00000000-0000-4000-8000-000000000003",
    aud: "authenticated",
    role: "authenticated",
    email: "p0s03@example.test",
    user_metadata: { display_name: "P0S-03" },
  };

  await page.route("https://cwpyolxitkcpitqizgtq.supabase.co/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/ai/generate", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.options.targetLanguage).toBe("Chinese");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, output: "[Chorus]\n月光照亮归途" }),
    });
  });
  await page.addInitScript(({ storageKey, sessionToken, sessionUser, project }) => {
    window.localStorage.setItem("kiiskiis_locale", "zh-CN");
    window.localStorage.setItem(storageKey, JSON.stringify({
      access_token: sessionToken,
      refresh_token: "test-refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: "bearer",
      user: sessionUser,
    }));
    window.localStorage.setItem("storyflow-ai-projects-v1", JSON.stringify([project]));
  }, {
    storageKey: authStorageKey,
    sessionToken: accessToken,
    sessionUser: user,
    project: songProject("[Chorus]\nMoonlight shows the way home", "cinematic pop, warm vocal, piano, hopeful chorus"),
  });

  await page.goto("/song-workbench?projectId=p0s03-song");

  const translation = page.locator("textarea.song-lyrics-textarea").nth(1);
  await expect(translation).toHaveValue("[Chorus]\n月光照亮归途", { timeout: 10_000 });

  if (evidenceDirectory) {
    await page.screenshot({
      path: `${evidenceDirectory}/p0s-03-lyrics-translation-zh.png`,
      fullPage: false,
    });
  }
});
