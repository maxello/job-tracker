import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// Each test runs as its own new user, so its list starts empty.
test.beforeEach(async ({ page }) => {
  await signUpFreshUser(page);
});

async function fillRequired(page: Page, company: string, role: string) {
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill(company);
  await page.getByRole("textbox", { name: "Role", exact: true }).fill(role);
}

function save(page: Page) {
  return page.getByRole("button", { name: "Save application" }).click();
}

test("US-1: an application created through /applications/new appears in the list with status Wishlist", async ({
  page,
}) => {
  const company = uniqueName("Acme");
  await page.goto("/applications/new");
  await fillRequired(page, company, "Frontend Engineer");
  await save(page);

  await expect(page).toHaveURL("/");
  const row = page.getByRole("link", { name: company });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Frontend Engineer");
  await expect(row).toContainText("Wishlist");
});

test("US-1: its detail page shows the first history record (from none to Wishlist)", async ({
  page,
}) => {
  const company = uniqueName("Globex");
  await page.goto("/applications/new");
  await fillRequired(page, company, "Backend Engineer");
  await save(page);
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: company }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();

  const history = page.getByRole("region", { name: "Status history" });
  const records = history.getByRole("listitem");
  await expect(records).toHaveCount(1);
  await expect(records.first()).toContainText("Created as Wishlist");
});

test("US-1: an invalid job URL (javascript:alert(1)) shows a field error next to the field and creates nothing", async ({
  page,
}) => {
  const company = uniqueName("Initech");
  await page.goto("/applications/new");
  await fillRequired(page, company, "QA Engineer");
  await page
    .getByRole("textbox", { name: "Job URL", exact: true })
    .fill("javascript:alert(1)");
  await save(page);

  const url = page.getByRole("textbox", { name: "Job URL", exact: true });
  await expect(url).toHaveAttribute("aria-invalid", "true");
  await expect(url).toHaveAccessibleDescription("Must be an http or https URL");
  await expect(page).toHaveURL("/applications/new");

  await page.goto("/");
  await expect(page.getByText("No applications yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: company })).toHaveCount(0);
});

test("US-1: a whitespace-only company counts as empty and shows a field error", async ({
  page,
}) => {
  // The company is whitespace, so the unique name goes in the role.
  const role = uniqueName("Data Engineer");
  await page.goto("/applications/new");
  await fillRequired(page, "   ", role);
  await save(page);

  const company = page.getByRole("textbox", { name: "Company", exact: true });
  await expect(company).toHaveAttribute("aria-invalid", "true");
  await expect(company).toHaveAccessibleDescription("Required");
  await expect(
    page.getByRole("textbox", { name: "Role", exact: true }),
  ).toHaveAttribute("aria-invalid", "false");
  await expect(page).toHaveURL("/applications/new");
});

test("US-1: after saving, it appears in the list without a full page reload", async ({
  page,
}) => {
  const company = uniqueName("Umbrella");
  await page.goto("/applications/new");
  // A full page load creates a new window object and drops this marker.
  await page.evaluate(() => {
    (window as unknown as { __noReload?: boolean }).__noReload = true;
  });
  await fillRequired(page, company, "Platform Engineer");
  await save(page);

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: company })).toBeVisible();
  const marker = await page.evaluate(
    () => (window as unknown as { __noReload?: boolean }).__noReload,
  );
  expect(marker).toBe(true);
});
