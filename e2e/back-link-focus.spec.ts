import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";
import { recordViewTransitions, settled } from "./view-transitions";

// US-5 "Keyboard focus on the back link" (SPEC decision log, 2026-11-20,
// "back-link focus"). The detail and edit pages' back link streams in its
// own <Suspense>; its fallback is "Applications" → /. To keep the fallback
// on screen long enough to Tab to it, without relying on motion, the tests
// hold the navigation's dynamic RSC request until they release it: the
// static shell (with the fallback) comes from the prefetch. They start on
// the board, so the real link is "Board" → /board and can't be mistaken for
// the fallback.

const ROLE = "Frontend Engineer";

// Creates an application (status Wishlist) through the form; ends on "/".
async function create(page: Page, company: string) {
  await page.goto("/applications/new");
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill(company);
  await page.getByRole("textbox", { name: "Role", exact: true }).fill(ROLE);
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL("/");
  await expect(main(page).getByRole("link", { name: company })).toBeVisible();
}

function main(page: Page) {
  return page.getByRole("main");
}

function mainLink(page: Page, name: string) {
  return main(page).getByRole("link", { name, exact: true });
}

// Holds the next navigations' dynamic RSC requests to a detail or edit page
// (not prefetches) until release(). `held` lists the requests it caught.
async function holdDynamic(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const held: string[] = [];
  await page.route(/\/applications\/[^/?]+(\/edit)?(\?|$)/, async (route) => {
    const headers = route.request().headers();
    if (headers["rsc"] !== "1" || headers["next-router-prefetch"]) {
      return route.continue();
    }
    held.push(route.request().url());
    await gate;
    // The page may have navigated away meanwhile (T5).
    await route.continue().catch(() => {});
  });
  return { release: () => release(), held };
}

// Tabs until main's link with this name is focused (at most 10 presses).
async function tabTo(page: Page, name: string) {
  const link = mainLink(page, name);
  await expect(link, `${name} link visible`).toBeVisible();
  for (let i = 0; i < 10; i++) {
    if (await link.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(link, `${name} focused by Tab`).toBeFocused();
  return link;
}

// The fallback is on screen and focused: one request held, the skeleton
// shown, and the focused link is "Applications" → /. If the fallback were
// already gone, the test fails here, not at the focus check.
async function expectFallbackFocused(
  page: Page,
  held: string[],
  loading: "Loading application" | "Loading form",
) {
  expect(held, "dynamic requests held").toHaveLength(1);
  await expect(main(page).getByText(loading, { exact: true })).toBeAttached();
  const fallback = await tabTo(page, "Applications");
  await expect(fallback).toHaveAttribute("href", "/");
}

// Keeps the focused node, to check later that it was replaced.
async function markFocused(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __fallback: Element | null }).__fallback =
      document.activeElement;
  });
}

async function marked(page: Page) {
  return page.evaluate(() => {
    const node = (window as unknown as { __fallback: Element | null })
      .__fallback;
    return {
      connected: node?.isConnected,
      focused: node === document.activeElement,
    };
  });
}

async function bodyFocused(page: Page) {
  return page.evaluate(() => document.activeElement === document.body);
}

// From the board to the detail page, with the dynamic request held.
async function openFromBoardHeld(page: Page, company: string) {
  await page
    .getByRole("navigation", { name: "Views", exact: true })
    .getByRole("link", { name: "Board", exact: true })
    .click();
  await expect(page).toHaveURL("/board");
  const card = main(page).getByRole("link", { name: company });
  await expect(card).toBeVisible();
  const gate = await holdDynamic(page);
  // Clicks are lost while a navigation transition runs (M15): wait for
  // the Views crossfade to finish.
  await settled(page);
  await card.click();
  await expect(page).toHaveURL(/\/applications\/[^/]+\?view=board$/);
  return gate;
}

test.describe("back-link focus", () => {
  test.beforeEach(async ({ page }) => {
    await recordViewTransitions(page);
    await signUpFreshUser(page);
  });

  test("US-5: focus moves from the detail page's fallback back link to the real one", async ({
    page,
  }) => {
    const company = uniqueName("Detail focus");
    await create(page, company);
    const gate = await openFromBoardHeld(page, company);
    await expectFallbackFocused(page, gate.held, "Loading application");
    await markFocused(page);

    gate.release();
    await expect(
      page.getByRole("heading", { level: 1, name: company }),
    ).toBeVisible();
    await expect(
      mainLink(page, "Board"),
      "real back link focused",
    ).toBeFocused();
    expect((await marked(page)).connected, "fallback replaced").toBe(false);
  });

  test("US-5: focus moves from the edit page's fallback back link to the real one", async ({
    page,
  }) => {
    const company = uniqueName("Edit focus");
    await create(page, company);
    await page
      .getByRole("navigation", { name: "Views", exact: true })
      .getByRole("link", { name: "Board", exact: true })
      .click();
    await expect(page).toHaveURL("/board");
    await expect(main(page).getByRole("link", { name: company })).toBeVisible();
    await settled(page);
    await main(page).getByRole("link", { name: company }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: company }),
    ).toBeVisible();

    const gate = await holdDynamic(page);
    // The board → detail slide may still run (M15).
    await settled(page);
    await mainLink(page, "Edit").click();
    await expect(page).toHaveURL(/\/edit\?view=board$/);
    await expectFallbackFocused(page, gate.held, "Loading form");
    await markFocused(page);

    gate.release();
    await expect(
      page.getByRole("textbox", { name: "Company", exact: true }),
    ).toHaveValue(company);
    await expect(
      mainLink(page, "Board"),
      "real back link focused",
    ).toBeFocused();
    expect((await marked(page)).connected, "fallback replaced").toBe(false);
  });

  test("US-5: focus moves from the fallback back link to the not-found page's back link", async ({
    page,
    context,
  }) => {
    const company = uniqueName("Gone focus");
    await create(page, company);
    const row = main(page).getByRole("link", { name: company });
    const href = await row.getAttribute("href");
    expect(href).toBeTruthy();

    // Deleted in another tab: the row on this page is now stale.
    const other = await context.newPage();
    try {
      await other.goto(href!);
      await other.getByRole("button", { name: "Delete", exact: true }).click();
      await other
        .getByRole("button", { name: "Delete permanently", exact: true })
        .click();
      await expect(other).toHaveURL("/");
    } finally {
      await other.close();
    }

    const gate = await holdDynamic(page);
    await row.click();
    await expect(page).toHaveURL(href!);
    await expectFallbackFocused(page, gate.held, "Loading application");
    await markFocused(page);

    gate.release();
    await expect(
      page.getByRole("heading", { level: 1, name: "Application not found" }),
    ).toBeVisible();
    await expect(
      mainLink(page, "Applications"),
      "not-found back link focused",
    ).toBeFocused();
    const fallback = await marked(page);
    expect(fallback.focused, "focus is not on the old fallback").toBe(false);
    expect(fallback.connected, "fallback replaced").toBe(false);
  });

  test("US-5: focus elsewhere stays there when the real back link arrives", async ({
    page,
  }) => {
    const company = uniqueName("Elsewhere");
    await create(page, company);
    const gate = await openFromBoardHeld(page, company);
    await expectFallbackFocused(page, gate.held, "Loading application");

    await page.keyboard.press("Shift+Tab");
    const signOut = page
      .getByRole("banner")
      .getByRole("button", { name: "Sign out", exact: true });
    await expect(signOut).toBeFocused();

    gate.release();
    await expect(mainLink(page, "Board")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: company }),
    ).toBeVisible();
    await expect(signOut, "focus stays on Sign out").toBeFocused();
  });

  test("US-5: a cached page shown again doesn't take focus", async ({
    page,
  }) => {
    const company = uniqueName("Cached");
    await create(page, company);
    await page
      .getByRole("navigation", { name: "Views", exact: true })
      .getByRole("link", { name: "Board", exact: true })
      .click();
    await expect(page).toHaveURL("/board");
    await expect(main(page).getByRole("link", { name: company })).toBeVisible();
    await settled(page);
    await main(page).getByRole("link", { name: company }).click();
    const heading = page.getByRole("heading", { level: 1, name: company });
    await expect(heading).toBeVisible();

    const gate = await holdDynamic(page);
    // The board → detail slide may still run (M15).
    await settled(page);
    await mainLink(page, "Edit").click();
    await expect(page).toHaveURL(/\/edit\?view=board$/);
    await expectFallbackFocused(page, gate.held, "Loading form");

    // Browser back shows the cached detail page while the edit page's
    // fallback has focus.
    await page.goBack();
    await expect(heading).toBeVisible();
    await expect(mainLink(page, "Board")).toBeVisible();
    await expect(
      mainLink(page, "Board"),
      "cached back link not focused",
    ).not.toBeFocused();
    expect(await bodyFocused(page), "focus on the body").toBe(true);
    gate.release();
  });
});
