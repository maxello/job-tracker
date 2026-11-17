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
    name: "Search company or role",
    exact: true,
  });
  const status = page.getByRole("group", { name: "Status", exact: true });
  const updated = page.getByRole("group", { name: "Updated", exact: true });
  const archive = page.getByRole("group", { name: "Archive", exact: true });
  const apply = page.getByRole("button", { name: "Apply", exact: true });
  const form = page.locator("form").filter({ has: status });
  const list = page.getByRole("list");

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

// US-6: the loading skeleton keeps the filter column's positions. Its date
// boxes are spans with no content width, so they collapsed to their padding
// below `lg` while the real date inputs kept their width. Without JavaScript
// the streamed list never replaces the fallback, so the skeleton stays on
// screen to be measured. The counts branch extends this check to the whole
// filter column.
test("US-6: the skeleton's date boxes are as wide as the loaded date inputs", async ({
  page,
  browser,
}) => {
  await openListWithOneApplication(page);
  const loaded = page.getByRole("group", { name: "Updated", exact: true });
  const loadedInputs = [
    loaded.getByLabel("From", { exact: true }),
    loaded.getByLabel("To", { exact: true }),
  ];

  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  try {
    const skeleton = await noJs.newPage();
    await skeleton.goto("/");
    // The skeleton is aria-hidden, so it has no roles: CSS locators. The
    // hidden streamed form is in the document too, after the skeleton.
    const skeletonFieldset = skeleton
      .locator('[aria-hidden="true"] fieldset')
      .filter({ hasText: "Updated" })
      .first();
    const skeletonBoxes = skeletonFieldset.locator(
      ":scope > div > span:nth-child(2)",
    );
    await expect(skeletonBoxes).toHaveCount(2);

    for (const width of [390, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await skeleton.setViewportSize({ width, height: 900 });
      for (const [i, name] of ["From", "To"].entries()) {
        await expect(loadedInputs[i]!).toBeVisible();
        const real = await loadedInputs[i]!.boundingBox();
        const fake = await skeletonBoxes.nth(i).boundingBox();
        if (!real || !fake) throw new Error(`${name} has no bounding box`);
        expect
          .soft(
            Math.abs(fake.width - real.width),
            `${width}px ${name}: skeleton ${fake.width} vs loaded ${real.width}`,
          )
          .toBeLessThanOrEqual(1);
      }
    }
  } finally {
    await noJs.close();
  }
});
