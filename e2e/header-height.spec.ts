import { expect, test, type Browser, type Page } from "@playwright/test";
import { signUpFreshUser } from "./fresh-user";

// UserMenu streams into a <Suspense> with no fallback. With JavaScript off the
// streamed HTML is never swapped in, so the header keeps its fallback height:
// comparing that with a normal load shows any shift when UserMenu arrives.
async function headerHeight(page: Page) {
  const box = await page.getByRole("banner").boundingBox();
  expect(box).not.toBeNull();
  return box!.height;
}

async function fallbackHeight(
  browser: Browser,
  page: Page,
  path: string,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport,
    storageState: await page.context().storageState(),
  });
  try {
    const noJs = await context.newPage();
    await noJs.goto(path);
    // The fallback is on screen: nothing from UserMenu is visible yet (each
    // test checks the same controls are visible after a normal load).
    const banner = noJs.getByRole("banner");
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("button")).toHaveCount(0);
    await expect(banner.getByRole("link")).toHaveCount(0);
    return await headerHeight(noJs);
  } finally {
    await context.close();
  }
}

for (const viewport of [
  { width: 360, height: 800 },
  { width: 1280, height: 800 },
]) {
  test.describe(`at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("#41: the header keeps its height when UserMenu streams in, signed in", async ({
      browser,
      page,
    }) => {
      await signUpFreshUser(page);
      await page.goto("/");
      const name = viewport.width < 640 ? "Account menu" : "Sign out";
      await expect(
        page.getByRole("banner").getByRole("button", { name, exact: true }),
      ).toBeVisible();

      const loaded = await headerHeight(page);
      const fallback = await fallbackHeight(browser, page, "/", viewport);
      console.log(
        `signed in @${viewport.width}: fallback ${fallback}px, loaded ${loaded}px`,
      );
      expect(loaded).toBe(fallback);
    });

    test("#41: the header keeps its height when UserMenu streams in, signed out", async ({
      browser,
      page,
    }) => {
      await page.goto("/sign-in");
      await expect(
        page
          .getByRole("banner")
          .getByRole("link", { name: "Sign in", exact: true }),
      ).toBeVisible();

      const loaded = await headerHeight(page);
      const fallback = await fallbackHeight(
        browser,
        page,
        "/sign-in",
        viewport,
      );
      console.log(
        `signed out @${viewport.width}: fallback ${fallback}px, loaded ${loaded}px`,
      );
      expect(loaded).toBe(fallback);
    });
  });
}
