import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// US-6 status filter, pulled into M3 (SPEC.md decision log, 2026-11-11).
// Each test signs up its own user and creates its own applications.

const LABELS = ["Wishlist", "Applied", "Interview", "Offer", "Rejected"];

// Creates an application through the form. Any status other than Wishlist is
// then set on its detail page; the second history record means it's saved.
async function createWithStatus(page: Page, company: string, label: string) {
  await page.goto("/applications/new");
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill(company);
  await page
    .getByRole("textbox", { name: "Role", exact: true })
    .fill("Frontend Engineer");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL("/");
  if (label === "Wishlist") return;

  await page.getByRole("link", { name: company }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption({ label });
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(
    page.getByRole("region", { name: "Status history" }).getByRole("listitem"),
  ).toHaveCount(2);
}

// One application per status used by the tests: Wishlist, Applied, Interview.
async function createThree(page: Page) {
  const data = {
    wishlist: uniqueName("Wishlist Co"),
    applied: uniqueName("Applied Co"),
    interview: uniqueName("Interview Co"),
  };
  await createWithStatus(page, data.wishlist, "Wishlist");
  await createWithStatus(page, data.applied, "Applied");
  await createWithStatus(page, data.interview, "Interview");
  await page.goto("/");
  return data;
}

function checkbox(page: Page, label: string) {
  return page.getByRole("checkbox", { name: label, exact: true });
}

function row(page: Page, company: string) {
  return page.getByRole("link", { name: company });
}

async function select(page: Page, labels: string[]) {
  for (const label of LABELS) {
    await checkbox(page, label).setChecked(labels.includes(label));
  }
}

async function apply(page: Page) {
  await page.getByRole("button", { name: "Apply", exact: true }).click();
}

// Path "/" and exactly these `status` values, as repeated keys (a single
// comma-separated value would not match).
function filterUrl(values: string[]) {
  const expected = [...values].sort().join("&");
  return (url: URL) =>
    url.pathname === "/" &&
    url.searchParams.getAll("status").sort().join("&") === expected;
}

async function expectChecked(page: Page, labels: string[]) {
  for (const label of LABELS) {
    if (labels.includes(label)) {
      await expect(checkbox(page, label)).toBeChecked();
    } else {
      await expect(checkbox(page, label)).not.toBeChecked();
    }
  }
}

async function expectRows(page: Page, shown: string[], hidden: string[]) {
  for (const company of shown) await expect(row(page, company)).toBeVisible();
  for (const company of hidden) await expect(row(page, company)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await signUpFreshUser(page);
});

test("US-6: selecting Applied and Interview and Apply puts both in the URL as repeated status keys and lists only those", async ({
  page,
}) => {
  const data = await createThree(page);

  await select(page, ["Applied", "Interview"]);
  await apply(page);

  await expect(page).toHaveURL(filterUrl(["applied", "interview"]));
  await expectRows(page, [data.applied, data.interview], [data.wishlist]);
});

test("US-6: a reload keeps the filter and the checked boxes", async ({
  page,
}) => {
  const data = await createThree(page);
  await select(page, ["Applied", "Interview"]);
  await apply(page);
  await expect(page).toHaveURL(filterUrl(["applied", "interview"]));

  await page.reload();

  await expect(page).toHaveURL(filterUrl(["applied", "interview"]));
  await expectChecked(page, ["Applied", "Interview"]);
  await expectRows(page, [data.applied, data.interview], [data.wishlist]);
});

test("US-6: Clear returns to the full list with nothing checked", async ({
  page,
}) => {
  const data = await createThree(page);
  await select(page, ["Applied"]);
  await apply(page);
  await expect(page).toHaveURL(filterUrl(["applied"]));

  await page.getByRole("link", { name: "Clear", exact: true }).click();

  await expect(page).toHaveURL(filterUrl([]));
  await expectChecked(page, []);
  await expectRows(page, [data.wishlist, data.applied, data.interview], []);
});

test("US-6: Back after Apply restores the previous checkboxes and list", async ({
  page,
}) => {
  const data = await createThree(page);
  await select(page, ["Applied"]);
  await apply(page);
  await expect(page).toHaveURL(filterUrl(["applied"]));
  await select(page, ["Interview"]);
  await apply(page);
  await expect(page).toHaveURL(filterUrl(["interview"]));

  await page.goBack();

  await expect(page).toHaveURL(filterUrl(["applied"]));
  await expectChecked(page, ["Applied"]);
  await expectRows(page, [data.applied], [data.wishlist, data.interview]);

  await page.goBack();

  await expect(page).toHaveURL(filterUrl([]));
  await expectChecked(page, []);
  await expectRows(page, [data.wishlist, data.applied, data.interview], []);
});

test("US-6: an unknown status value (?status=foo) shows the full list without a redirect", async ({
  page,
}) => {
  const data = await createThree(page);

  await page.goto("/?status=foo");

  await expect(page).toHaveURL(filterUrl(["foo"]));
  await expectChecked(page, []);
  await expectRows(page, [data.wishlist, data.applied, data.interview], []);
  await expect(
    page.getByText("No applications match your filters"),
  ).toHaveCount(0);
});

test("US-6: a filter with no match shows the empty-result message and a link that clears it", async ({
  page,
}) => {
  const data = await createThree(page);
  await select(page, ["Offer"]);
  await apply(page);
  await expect(page).toHaveURL(filterUrl(["offer"]));

  await expect(
    page.getByText("No applications match your filters"),
  ).toBeVisible();
  await expect(page.getByText("No applications yet.")).toHaveCount(0);
  await expectRows(page, [], [data.wishlist, data.applied, data.interview]);

  await page.getByRole("link", { name: "Clear filters", exact: true }).click();

  await expect(page).toHaveURL(filterUrl([]));
  await expectRows(page, [data.wishlist, data.applied, data.interview], []);
});

test("US-0: another user's applications never appear in a filtered list", async ({
  page,
  browser,
}) => {
  const ownerCompany = uniqueName("Owner Applied");
  await createWithStatus(page, ownerCompany, "Applied");

  const context = await browser.newContext();
  try {
    const intruder = await context.newPage();
    await signUpFreshUser(intruder);
    const ownApplied = uniqueName("Own Applied");
    const ownWishlist = uniqueName("Own Wishlist");
    await createWithStatus(intruder, ownApplied, "Applied");
    await createWithStatus(intruder, ownWishlist, "Wishlist");

    await intruder.goto("/?status=applied");

    await expect(row(intruder, ownApplied)).toBeVisible();
    // Hidden only when the filter actually ran.
    await expect(row(intruder, ownWishlist)).toHaveCount(0);
    await expect(intruder.getByText(ownerCompany)).toHaveCount(0);
  } finally {
    await context.close();
  }
});
