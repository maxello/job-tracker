import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// Each test runs as its own new user, so its list starts empty.
test.beforeEach(async ({ page }) => {
  await signUpFreshUser(page);
});

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

function statusSelect(page: Page) {
  return page.getByRole("combobox", { name: "Status", exact: true });
}

// While the action runs the button is named "Updating…", so this locator
// matches again only once the update has finished.
function updateButton(page: Page) {
  return page.getByRole("button", { name: "Update status" });
}

function historyList(page: Page) {
  return page.getByRole("region", { name: "Status history" }).getByRole("list");
}

function historyRecords(page: Page) {
  return historyList(page).getByRole("listitem");
}

// The new history record and the reset form arrive in the same refresh, so
// waiting for the record count is waiting for the update to finish.
async function changeStatus(page: Page, label: string, expectedCount: number) {
  await statusSelect(page).selectOption({ label });
  await updateButton(page).click();
  await expect(historyRecords(page)).toHaveCount(expectedCount);
  await expect(updateButton(page)).toBeDisabled();
}

// History rows render "Wishlist <aria-hidden →><sr-only to> Applied", so they
// are matched on accessible text, not on textContent. The date after the
// transition depends on the locale, so only the start of each row is matched.
// "/children: equal" checks the exact rows in order (oldest first).

test("US-3: changing Wishlist to Applied adds a second history record after the first one, and the select shows Applied", async ({
  page,
}) => {
  await createAndOpen(page, uniqueName("Acme"));

  await changeStatus(page, "Applied", 2);

  await expect(historyList(page)).toMatchAriaSnapshot(`
    - list:
      - /children: equal
      - listitem: /^Created as Wishlist\\b/
      - listitem: /^Wishlist to Applied\\b/
  `);
  await expect(statusSelect(page)).toHaveValue("APPLIED");
});

test("US-3: a backward transition is allowed (Wishlist to Interview to Wishlist)", async ({
  page,
}) => {
  await createAndOpen(page, uniqueName("Globex"));

  await changeStatus(page, "Interview", 2);
  await changeStatus(page, "Wishlist", 3);

  await expect(historyList(page)).toMatchAriaSnapshot(`
    - list:
      - /children: equal
      - listitem: /^Created as Wishlist\\b/
      - listitem: /^Wishlist to Interview\\b/
      - listitem: /^Interview to Wishlist\\b/
  `);
  await expect(statusSelect(page)).toHaveValue("WISHLIST");
});

test("US-3: the list on / shows the new status", async ({ page }) => {
  const company = uniqueName("Initech");
  await createAndOpen(page, company);

  await changeStatus(page, "Applied", 2);

  await page.goto("/");
  const row = page.getByRole("link", { name: company });
  await expect(row).toContainText("Applied");
  await expect(row).not.toContainText("Wishlist");
});

test("US-3: the current status can't be submitted again", async ({ page }) => {
  await createAndOpen(page, uniqueName("Umbrella"));
  const records = historyRecords(page);

  await expect(updateButton(page)).toBeDisabled();
  await expect(records).toHaveCount(1);

  await statusSelect(page).selectOption({ label: "Applied" });
  await expect(updateButton(page)).toBeEnabled();

  await statusSelect(page).selectOption({ label: "Wishlist" });
  await expect(updateButton(page)).toBeDisabled();
  await expect(records).toHaveCount(1);

  await changeStatus(page, "Applied", 2);
  await expect(statusSelect(page)).toHaveValue("APPLIED");
  await expect(updateButton(page)).toBeDisabled();
  await expect(records).toHaveCount(2);
});

// SPEC.md section 11, first bullet. Rows are matched as text plus time, which
// also checks that each timestamp is shown.
test("US-3: after a reload the detail page still shows the new status and both history records with timestamps", async ({
  page,
}) => {
  const company = uniqueName("Hooli");
  await createAndOpen(page, company);
  await changeStatus(page, "Applied", 2);

  await page.reload();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();

  await expect(statusSelect(page)).toHaveValue("APPLIED");
  await expect(historyList(page)).toMatchAriaSnapshot(`
    - list:
      - /children: equal
      - listitem:
        - text: Created as Wishlist
        - time: /\\d/
      - listitem:
        - text: Wishlist to Applied
        - time: /\\d/
  `);

  for (const record of await historyRecords(page).all()) {
    const stamp = Date.parse(
      (await record.getByRole("time").getAttribute("datetime")) ?? "",
    );
    expect(stamp).not.toBeNaN();
  }
});
