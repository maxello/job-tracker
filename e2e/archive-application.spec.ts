import { expect, test, type Locator, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// US-8 archive (M4). Each test signs up its own user and creates its own
// applications. See the SPEC.md decision log, 2026-11-12.

// Creates an application (status Wishlist) and opens its detail page.
async function createAndOpen(page: Page, company: string) {
  await page.goto("/applications/new");
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill(company);
  await page
    .getByRole("textbox", { name: "Role", exact: true })
    .fill("Frontend Engineer");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: company }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
}

function archiveButton(page: Page) {
  return page.getByRole("button", { name: "Archive", exact: true });
}

function unarchiveButton(page: Page) {
  return page.getByRole("button", { name: "Unarchive", exact: true });
}

function archivedBadge(scope: Page | Locator) {
  return scope.getByText("Archived", { exact: true });
}

function statusSelect(page: Page) {
  return page.getByRole("combobox", { name: "Status", exact: true });
}

function historyRecords(page: Page) {
  return page
    .getByRole("region", { name: "Status history" })
    .getByRole("list")
    .getByRole("listitem");
}

function row(page: Page, company: string) {
  return page.getByRole("link", { name: company });
}

function showArchived(page: Page) {
  return page.getByRole("checkbox", { name: "Show archived", exact: true });
}

async function apply(page: Page) {
  await page.getByRole("button", { name: "Apply", exact: true }).click();
}

// Archives the open application and waits for the refreshed page.
async function archive(page: Page) {
  await archiveButton(page).click();
  await expect(unarchiveButton(page)).toBeVisible();
}

async function createArchived(page: Page, company: string) {
  await createAndOpen(page, company);
  await archive(page);
}

async function changeStatus(page: Page, label: string) {
  const records = await historyRecords(page).count();
  await statusSelect(page).selectOption({ label });
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(historyRecords(page)).toHaveCount(records + 1);
}

function archivedParam(url: URL) {
  return url.pathname === "/" && url.searchParams.get("archived") === "1";
}

test.beforeEach(async ({ page }) => {
  await signUpFreshUser(page);
});

test("US-8: Archive keeps the user on the detail page, marks it archived and leaves status and history unchanged", async ({
  page,
}) => {
  const company = uniqueName("Acme");
  await createAndOpen(page, company);
  const url = page.url();
  await expect(archivedBadge(page.getByRole("main"))).toHaveCount(0);

  await archive(page);

  expect(page.url()).toBe(url);
  await expect(archivedBadge(page.getByRole("main"))).toBeVisible();
  await expect(archiveButton(page)).toHaveCount(0);
  await expect(statusSelect(page)).toHaveValue("WISHLIST");
  await expect(historyRecords(page)).toHaveCount(1);

  await page.reload();

  await expect(archivedBadge(page.getByRole("main"))).toBeVisible();
  await expect(unarchiveButton(page)).toBeVisible();
});

test("US-8: an archived application is hidden from the list and shown, marked, with Show archived; a reload keeps it", async ({
  page,
}) => {
  const active = uniqueName("Active Co");
  const archived = uniqueName("Archived Co");
  await createAndOpen(page, active);
  await createArchived(page, archived);

  await page.goto("/");
  await expect(row(page, active)).toBeVisible();
  await expect(row(page, archived)).toHaveCount(0);
  await expect(showArchived(page)).not.toBeChecked();

  await showArchived(page).check();
  await apply(page);

  await expect(page).toHaveURL(archivedParam);
  await expect(row(page, archived)).toBeVisible();
  await expect(archivedBadge(row(page, archived))).toBeVisible();
  await expect(row(page, active)).toBeVisible();
  await expect(archivedBadge(row(page, active))).toHaveCount(0);

  await page.reload();

  await expect(page).toHaveURL(archivedParam);
  await expect(showArchived(page)).toBeChecked();
  await expect(archivedBadge(row(page, archived))).toBeVisible();
  await expect(row(page, active)).toBeVisible();
});

test("US-8: Show archived combines with the status filter", async ({
  page,
}) => {
  const appliedArchived = uniqueName("Applied Archived");
  const wishlistArchived = uniqueName("Wishlist Archived");
  const appliedActive = uniqueName("Applied Active");
  await createAndOpen(page, appliedArchived);
  await changeStatus(page, "Applied");
  await archive(page);
  await createArchived(page, wishlistArchived);
  await createAndOpen(page, appliedActive);
  await changeStatus(page, "Applied");

  await page.goto("/");
  await page.getByRole("checkbox", { name: "Applied", exact: true }).check();
  await showArchived(page).check();
  await apply(page);

  await expect(page).toHaveURL(
    (url) =>
      archivedParam(url) &&
      url.searchParams.getAll("status").join() === "applied",
  );
  await expect(row(page, appliedArchived)).toBeVisible();
  await expect(row(page, appliedActive)).toBeVisible();
  await expect(row(page, wishlistArchived)).toHaveCount(0);
});

test("US-8: Unarchive brings the application back to the list without the badge", async ({
  page,
}) => {
  const company = uniqueName("Acme");
  await createArchived(page, company);

  await unarchiveButton(page).click();

  await expect(archiveButton(page)).toBeVisible();
  await expect(archivedBadge(page.getByRole("main"))).toHaveCount(0);

  await page.goto("/");
  await expect(row(page, company)).toBeVisible();
  await expect(archivedBadge(row(page, company))).toHaveCount(0);
});

test("US-8: when every application is archived, the list says so and links to Show archived", async ({
  page,
}) => {
  const company = uniqueName("Acme");
  await createArchived(page, company);

  await page.goto("/");

  await expect(
    page.getByText("All your applications are archived"),
  ).toBeVisible();
  await expect(page.getByText("No applications yet.")).toHaveCount(0);
  await expect(row(page, company)).toHaveCount(0);

  await page.getByRole("link", { name: "Show archived", exact: true }).click();

  await expect(page).toHaveURL(archivedParam);
  await expect(showArchived(page)).toBeChecked();
  await expect(archivedBadge(row(page, company))).toBeVisible();
});

test("US-8: an archived application can change status and be edited, and stays archived", async ({
  page,
}) => {
  const company = uniqueName("Acme");
  await createArchived(page, company);
  const detailUrl = page.url();

  await changeStatus(page, "Applied");

  await expect(statusSelect(page)).toHaveValue("APPLIED");
  await expect(archivedBadge(page.getByRole("main"))).toBeVisible();
  await expect(unarchiveButton(page)).toBeVisible();

  // A full load, not a click on Edit: after client-side navigation the hidden
  // create form (kept in the DOM by Cache Components) shares the edit form's
  // fixed ids, so every field's accessible name is doubled ("Role Role *").
  // That duplicate-id bug is tracked and fixed separately.
  const editLink = page.getByRole("link", { name: "Edit", exact: true });
  await expect(editLink).toHaveAttribute(
    "href",
    `${new URL(detailUrl).pathname}/edit`,
  );
  await page.goto(`${detailUrl}/edit`);
  const role = uniqueName("Staff Engineer");
  await page.getByRole("textbox", { name: "Role", exact: true }).fill(role);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(detailUrl);
  await expect(page.getByText(role, { exact: true })).toBeVisible();
  await expect(archivedBadge(page.getByRole("main"))).toBeVisible();
  await expect(unarchiveButton(page)).toBeVisible();
});

test("US-8: an archived application can be deleted", async ({ page }) => {
  const company = uniqueName("Acme");
  await createArchived(page, company);

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete permanently" }).click();

  await expect(page).toHaveURL("/");
  await page.goto("/?archived=1");
  await expect(showArchived(page)).toBeChecked();
  await expect(row(page, company)).toHaveCount(0);
});

test("US-8: Archive from a stale tab keeps the application archived instead of toggling it back", async ({
  page,
}) => {
  const company = uniqueName("Acme");
  await createAndOpen(page, company);
  const stale = await page.context().newPage();
  await stale.goto(page.url());
  await expect(archiveButton(stale)).toBeVisible();

  await archive(page);
  await archiveButton(stale).click();

  await expect(unarchiveButton(stale)).toBeVisible();
  await expect(archivedBadge(stale.getByRole("main"))).toBeVisible();

  await page.reload();
  await expect(unarchiveButton(page)).toBeVisible();
  await expect(archivedBadge(page.getByRole("main"))).toBeVisible();
});

test("US-8: the filter has a Status group and an Archive group, and Show archived is only in Archive", async ({
  page,
}) => {
  await page.goto("/");

  const status = page.getByRole("group", { name: "Status", exact: true });
  const archiveGroup = page.getByRole("group", {
    name: "Archive",
    exact: true,
  });
  await expect(status).toBeVisible();
  await expect(archiveGroup).toBeVisible();
  await expect(
    status.getByRole("checkbox", { name: "Show archived" }),
  ).toHaveCount(0);
  await expect(status.getByRole("checkbox")).toHaveCount(5);
  await expect(
    archiveGroup.getByRole("checkbox", { name: "Show archived", exact: true }),
  ).toBeVisible();
});

test("US-8: after Archive, focus moves to Unarchive, and after Unarchive back to Archive", async ({
  page,
}) => {
  await createAndOpen(page, uniqueName("Acme"));

  await archiveButton(page).click();
  await expect(unarchiveButton(page)).toBeFocused();

  await unarchiveButton(page).click();
  await expect(archiveButton(page)).toBeFocused();
});

// `not.toBeFocused()` passes at once if it runs before hydration, when a focus
// bug would only start. Playwright discourages networkidle, but the app has no
// hydration signal that doesn't move focus itself (the server HTML already
// matches the hydrated buttons, and the JS-only interactions such as the
// Delete dialog take focus), so waiting for the network to settle is the
// readiness check here: by then the JS chunks have loaded and hydrated.
async function reloadAndWaitForHydration(page: Page) {
  await page.reload();
  await page.waitForLoadState("networkidle");
}

test("US-8: a fresh load of the detail page focuses neither Archive nor Unarchive", async ({
  page,
}) => {
  await createAndOpen(page, uniqueName("Acme"));
  await reloadAndWaitForHydration(page);
  await expect(archiveButton(page)).toBeVisible();
  await expect(archiveButton(page)).not.toBeFocused();

  await archive(page);
  await reloadAndWaitForHydration(page);
  await expect(unarchiveButton(page)).toBeVisible();
  await expect(unarchiveButton(page)).not.toBeFocused();
});
