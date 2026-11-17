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
