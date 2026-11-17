import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// US-6 search (`q`), SPEC.md section 4 and the decision log, 2026-11-16.
// Each test signs up its own user and creates its own applications.

const SEARCH_LABEL = "Search company or role";

async function create(page: Page, company: string, role = "Engineer") {
  await page.goto("/applications/new");
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill(company);
  await page.getByRole("textbox", { name: "Role", exact: true }).fill(role);
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL("/");
}

// Opens the application from the list and sets a status on its detail page;
// the second history record means it's saved.
async function setStatus(page: Page, company: string, label: string) {
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

async function archive(page: Page, company: string) {
  await page.getByRole("link", { name: company }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unarchive", exact: true }),
  ).toBeVisible();
}

function searchBox(page: Page) {
  return page.getByRole("searchbox", { name: SEARCH_LABEL, exact: true });
}

function row(page: Page, company: string) {
  return page.getByRole("link", { name: company });
}

async function apply(page: Page) {
  await page.getByRole("button", { name: "Apply", exact: true }).click();
}

async function searchFor(page: Page, text: string) {
  await searchBox(page).fill(text);
  await apply(page);
}

// Path "/" with exactly this `q` (null: no `q` key at all).
function searchUrl(q: string | null) {
  return (url: URL) => url.pathname === "/" && url.searchParams.get("q") === q;
}

async function expectRows(page: Page, shown: string[], hidden: string[]) {
  for (const company of shown) await expect(row(page, company)).toBeVisible();
  for (const company of hidden) await expect(row(page, company)).toHaveCount(0);
}

const NO_MATCH = "No applications match your filters";

test.beforeEach(async ({ page }) => {
  await signUpFreshUser(page);
});

test("E1 US-6: search matches company or role, is in the URL and survives a reload", async ({
  page,
}) => {
  const tag = uniqueName("Zephyr");
  const byCompany = `${tag} Labs`;
  const byRole = uniqueName("Other Co");
  const other = uniqueName("Unrelated Co");
  await create(page, byCompany);
  await create(page, byRole, `${tag} Developer`);
  await create(page, other);

  await searchFor(page, tag.toUpperCase());

  await expect(page).toHaveURL(searchUrl(tag.toUpperCase()));
  await expectRows(page, [byCompany, byRole], [other]);

  await page.reload();

  await expect(searchBox(page)).toHaveValue(tag.toUpperCase());
  await expectRows(page, [byCompany, byRole], [other]);
});

test("E2 §11 US-6: search and status combine and survive a reload", async ({
  page,
}) => {
  const tag = uniqueName("Combo");
  const appliedMatch = `${tag} Applied`;
  const wishlistMatch = `${tag} Wishlist`;
  const appliedOther = uniqueName("Elsewhere Applied");
  await create(page, appliedMatch);
  await create(page, wishlistMatch);
  await create(page, appliedOther);
  await setStatus(page, appliedMatch, "Applied");
  await page.goto("/");
  await setStatus(page, appliedOther, "Applied");
  await page.goto("/");

  await searchBox(page).fill(tag);
  await page.getByRole("checkbox", { name: "Applied", exact: true }).check();
  await apply(page);

  await expect(page).toHaveURL(
    (url) =>
      searchUrl(tag)(url) &&
      url.searchParams.getAll("status").join() === "applied",
  );
  await expectRows(page, [appliedMatch], [wishlistMatch, appliedOther]);

  await page.reload();

  await expect(searchBox(page)).toHaveValue(tag);
  await expect(
    page.getByRole("checkbox", { name: "Applied", exact: true }),
  ).toBeChecked();
  await expectRows(page, [appliedMatch], [wishlistMatch, appliedOther]);
});

test("E3 §11 US-6: search hides archived applications unless Show archived is on", async ({
  page,
}) => {
  const tag = uniqueName("Archy");
  const active = `${tag} Active`;
  const archived = `${tag} Archived`;
  await create(page, active);
  await create(page, archived);
  await archive(page, archived);
  await page.goto("/");

  await searchFor(page, tag);

  await expect(page).toHaveURL(searchUrl(tag));
  await expectRows(page, [active], [archived]);

  await page
    .getByRole("checkbox", { name: "Show archived", exact: true })
    .check();
  await apply(page);

  await expect(page).toHaveURL(
    (url) => searchUrl(tag)(url) && url.searchParams.get("archived") === "1",
  );
  await expectRows(page, [active, archived], []);
});

test("E4 US-6: a search with no match shows the empty-result message, and Clear filters resets the search", async ({
  page,
}) => {
  const company = uniqueName("Present Co");
  await create(page, company);
  const missing = uniqueName("Nowhere");

  await searchFor(page, missing);

  await expect(page).toHaveURL(searchUrl(missing));
  await expect(page.getByText(NO_MATCH)).toBeVisible();

  await page.getByRole("link", { name: "Clear filters", exact: true }).click();

  await expect(page).toHaveURL(searchUrl(null));
  await expect(searchBox(page)).toHaveValue("");
  await expectRows(page, [company], []);
});

test("E5 US-6: with no applications at all, a search shows the empty-result message, not No applications yet", async ({
  page,
}) => {
  await page.goto("/?q=x");

  await expect(page.getByText(NO_MATCH)).toBeVisible();
});

test("E6 US-6: Back after a second search restores the first search and its rows", async ({
  page,
}) => {
  const first = uniqueName("Alpha");
  const second = uniqueName("Bravo");
  await create(page, first);
  await create(page, second);

  await searchFor(page, first);
  await expect(page).toHaveURL(searchUrl(first));
  await searchFor(page, second);
  await expect(page).toHaveURL(searchUrl(second));
  await expectRows(page, [second], [first]);

  await page.goBack();

  await expect(page).toHaveURL(searchUrl(first));
  await expect(searchBox(page)).toHaveValue(first);
  await expectRows(page, [first], [second]);
});

test("E7 US-6: an ignored q shows the full list without a redirect, and a valid one shows trimmed", async ({
  page,
}) => {
  const company = uniqueName("Trim Co");
  const other = uniqueName("Second Co");
  await create(page, company);
  await create(page, other);

  const tooLong = "a".repeat(201);
  for (const q of [tooLong, "   "]) {
    await page.goto(`/?q=${encodeURIComponent(q)}`);

    await expect(page).toHaveURL(searchUrl(q));
    await expect(searchBox(page)).toHaveValue("");
    await expectRows(page, [company, other], []);
  }

  await page.goto(`/?q=${encodeURIComponent(`  ${company}  `)}`);

  await expect(searchBox(page)).toHaveValue(company);
  await expectRows(page, [company], [other]);
});

test("E8 US-6: Apply with an empty search sends q= and shows the full list", async ({
  page,
}) => {
  const company = uniqueName("Empty Co");
  await create(page, company);

  await searchFor(page, "");

  await expect(page).toHaveURL(searchUrl(""));
  await expectRows(page, [company], []);
});

// `/?q=` and `/` parse to the same "no search", so only a key built from the
// raw `q` re-mounts the form between them (SPEC.md decision log, 2026-11-17).
test("E9 US-6: Back drops search text that was typed but not applied", async ({
  page,
}) => {
  const company = uniqueName("Back Co");
  await create(page, company);
  await searchFor(page, "");
  await expect(page).toHaveURL(searchUrl(""));

  await searchBox(page).fill("unapplied");
  await expect(searchBox(page)).toHaveValue("unapplied");

  await page.goBack();

  await expect(page).toHaveURL(searchUrl(null));
  await expect(searchBox(page)).toHaveValue("");
});

// An ignored `q` is not an active filter, so the later empty states still
// apply (US-6 empty states 2 and 3).
test("E10 US-6: with every application archived, an empty q still shows All your applications are archived", async ({
  page,
}) => {
  const company = uniqueName("Archived Co");
  await create(page, company);
  await archive(page, company);

  await page.goto("/?q=");

  await expect(
    page.getByText("All your applications are archived"),
  ).toBeVisible();
});

test("E11 US-6: with no applications, a whitespace-only q still shows No applications yet", async ({
  page,
}) => {
  await page.goto("/?q=%20");

  await expect(page.getByText("No applications yet.")).toBeVisible();
});
