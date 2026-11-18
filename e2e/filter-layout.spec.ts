import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// Filter form layout (#27): a column left of the list from `lg` (1024px), above
// the list below it. Sticky is checked by hand, not here.

// Signs up a fresh user with one application, so the list renders.
async function openListWithOneApplication(page: Page) {
  await signUpFreshUser(page);
  await page.goto("/applications/new");
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill(uniqueName("Layout Co"));
  await page
    .getByRole("textbox", { name: "Role", exact: true })
    .fill("Frontend Engineer");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL("/");
}

// Resolves every locator first, so a wrong selector fails here, not as a
// layout assertion.
async function layoutBoxes(page: Page) {
  const search = page.getByRole("searchbox", {
    name: "Search",
    exact: true,
  });
  const status = page.getByRole("group", { name: "Status", exact: true });
  const updated = page.getByRole("group", { name: "Updated", exact: true });
  const archive = page.getByRole("group", { name: "Archive", exact: true });
  const apply = page.getByRole("button", { name: "Apply", exact: true });
  const form = page.locator("form").filter({ has: status });
  // The rows list: the Pipeline legend (US-6) is a list too, with no links.
  const list = page.getByRole("list").filter({ has: page.getByRole("link") });

  for (const locator of [search, status, updated, archive, apply, form, list]) {
    await expect(locator).toBeVisible();
  }

  const box = async (locator: typeof form) => {
    const b = await locator.boundingBox();
    if (!b) throw new Error("element has no bounding box");
    return {
      top: b.y,
      bottom: b.y + b.height,
      left: b.x,
      right: b.x + b.width,
    };
  };

  return {
    search: await box(search),
    status: await box(status),
    updated: await box(updated),
    archive: await box(archive),
    apply: await box(apply),
    form: await box(form),
    list: await box(list),
  };
}

test.describe("desktop (1280×800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the filter form is a column left of the list", async ({ page }) => {
    await openListWithOneApplication(page);
    const boxes = await layoutBoxes(page);

    expect
      .soft(boxes.form.right, "form right edge ≤ list left edge")
      .toBeLessThanOrEqual(boxes.list.left);
    expect
      .soft(boxes.search.bottom, "search bottom ≤ Status top")
      .toBeLessThanOrEqual(boxes.status.top);
    expect
      .soft(boxes.archive.top, "Archive top ≥ Status bottom")
      .toBeGreaterThanOrEqual(boxes.status.bottom);
    expect
      .soft(boxes.updated.top, "Updated top ≥ Status bottom")
      .toBeGreaterThanOrEqual(boxes.status.bottom);
    expect
      .soft(boxes.archive.top, "Archive top ≥ Updated bottom")
      .toBeGreaterThanOrEqual(boxes.updated.bottom);
    expect
      .soft(boxes.apply.top, "Apply top ≥ Archive bottom")
      .toBeGreaterThanOrEqual(boxes.archive.bottom);
  });
});

// US-6: the whole filter column, including search and Apply, fits a 1024×700
// viewport (SPEC.md decision log, 2026-11-16).
test.describe("small desktop (1024×700)", () => {
  test.use({ viewport: { width: 1024, height: 700 } });

  test("US-6: the whole filter column, including search and Apply, fits the viewport", async ({
    page,
  }) => {
    await openListWithOneApplication(page);
    const boxes = await layoutBoxes(page);

    expect.soft(boxes.form.top, "form top ≥ 0").toBeGreaterThanOrEqual(0);
    expect
      .soft(boxes.apply.bottom, "Apply bottom ≤ 700")
      .toBeLessThanOrEqual(700);
  });
});

test.describe("mobile (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the filter form is above the list", async ({ page }) => {
    await openListWithOneApplication(page);
    const boxes = await layoutBoxes(page);

    expect(boxes.form.bottom, "form bottom ≤ list top").toBeLessThanOrEqual(
      boxes.list.top,
    );
  });
});

// US-6: the loading skeleton keeps the positions of the loaded page for every
// filter-column control, the pipeline bar and the list's top edge (SPEC.md
// decision log, 2026-11-18; it replaces the date-box width check from the
// date-range branch). Without JavaScript the streamed list never replaces
// the fallback, so the skeleton stays on screen to be measured; the hidden
// streamed content has no data-skeleton hooks. The user has one Wishlist
// application, so the loaded page shows the bar and every count is one digit.
test("US-6: the skeleton's filter controls, bar and list top are where the loaded page has them", async ({
  page,
  browser,
}) => {
  await openListWithOneApplication(page);
  const main = page.getByRole("main");
  const checkboxLabel = (name: string) =>
    main.locator("label").filter({
      has: page.getByRole("checkbox", { name, exact: true }),
    });
  const updated = page.getByRole("group", { name: "Updated", exact: true });

  // [what, loaded locator, skeleton hook, compare height]
  const pairs = [
    [
      "search",
      page.getByRole("searchbox", {
        name: "Search",
        exact: true,
      }),
      "search",
      true,
    ],
    ...["Wishlist", "Applied", "Interview", "Offer", "Rejected"].map(
      (name) =>
        [
          name,
          checkboxLabel(name),
          `status-${name.toLowerCase()}`,
          true,
        ] as const,
    ),
    ["From", updated.getByLabel("From", { exact: true }), "from", true],
    ["To", updated.getByLabel("To", { exact: true }), "to", true],
    ["Show archived", checkboxLabel("Show archived"), "show-archived", true],
    [
      "Clear",
      main.getByRole("link", { name: "Clear", exact: true }),
      "clear",
      true,
    ],
    [
      "Apply",
      main.getByRole("button", { name: "Apply", exact: true }),
      "apply",
      true,
    ],
    // The bar is aria-hidden, so it has no role: a CSS locator.
    ["bar", page.locator("[data-pipeline-bar]"), "bar", true],
    // The list's top edge: the rows list (the Pipeline legend has no links).
    [
      "list",
      main.getByRole("list").filter({ has: page.getByRole("link") }),
      "list",
      false,
    ],
  ] as const;

  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  try {
    const skeleton = await noJs.newPage();
    await skeleton.goto("/");
    // Every element on both pages once, so a missing one is reported once
    // and skipped below, instead of waiting at every width.
    const present = [];
    for (const [what, loaded, hook, withHeight] of pairs) {
      const fake = skeleton.locator(`[data-skeleton="${hook}"]`);
      await expect.soft(loaded, `${what}: loaded`).toBeVisible();
      await expect
        .soft(fake, `${what}: skeleton`)
        .toBeVisible({ timeout: 1000 });
      if ((await loaded.isVisible()) && (await fake.isVisible())) {
        present.push({ what, loaded, fake, withHeight });
      }
    }

    for (const width of [390, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await skeleton.setViewportSize({ width, height: 900 });
      // After Save, Next keeps the scroll the form page had (the list's top
      // is still in view), so the loaded page can start a few px down; the
      // skeleton (no JS) is always at the top.
      await page.evaluate(() => window.scrollTo(0, 0));
      for (const { what, loaded, fake, withHeight } of present) {
        const real = await loaded.boundingBox();
        const shown = await fake.boundingBox();
        if (!real || !shown) throw new Error(`${what} has no bounding box`);
        const keys = withHeight
          ? (["x", "y", "width", "height"] as const)
          : (["x", "y", "width"] as const);
        for (const key of keys) {
          expect
            .soft(
              Math.abs(shown[key] - real[key]),
              `${width}px ${what} ${key}: skeleton ${shown[key]} vs loaded ${real[key]}`,
            )
            .toBeLessThanOrEqual(1);
        }
      }
    }
  } finally {
    await noJs.close();
  }
});
