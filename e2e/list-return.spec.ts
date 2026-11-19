import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// The detail and edit pages keep the list's filters or the board (US-5,
// US-6, SPEC.md decision log, 2026-11-19). The browser runs in Tokyo, so the
// filter form's tz is known. Each test signs up its own user.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

test.beforeEach(async ({ page }) => {
  await signUpFreshUser(page);
});

// Today's calendar date (YYYY-MM-DD) in Tokyo, the browser's zone.
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TOKYO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// The canonical query the app builds: parsed values in the filter form's
// order, defaults left out.
function query(params: [string, string][]) {
  return `?${new URLSearchParams(params).toString()}`;
}

async function create(page: Page, company: string, role = "Engineer") {
  await page.goto("/applications/new");
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill(company);
  await page.getByRole("textbox", { name: "Role", exact: true }).fill(role);
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL("/");
}

function main(page: Page) {
  return page.getByRole("main");
}

function backTo(page: Page, name: "Applications" | "Board") {
  return main(page).getByRole("link", { name, exact: true });
}

function searchBox(page: Page) {
  return page.getByRole("searchbox", { name: "Search", exact: true });
}

// tz is filled in after hydration; waiting for it means Apply sends it.
async function apply(page: Page) {
  await expect(page.locator('input[type="hidden"][name="tz"]')).toHaveValue(
    TOKYO,
  );
  await page.getByRole("button", { name: "Apply", exact: true }).click();
}

// Opens the application from the list and returns its id.
async function openRow(page: Page, company: string) {
  await main(page).getByRole("link", { name: company }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: company }),
  ).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2]!;
}

test("LR-E1 US-6: the detail page opened from a filtered list links back to it, and the list keeps its filters", async ({
  page,
}) => {
  const company = uniqueName("Return");
  await create(page, company);
  const day = today();

  await searchBox(page).fill(company);
  await page.getByRole("checkbox", { name: "Wishlist", exact: true }).check();
  await page
    .getByRole("group", { name: "Updated", exact: true })
    .getByLabel("From", { exact: true })
    .fill(day);
  await page
    .getByRole("checkbox", { name: "Show archived", exact: true })
    .check();
  await apply(page);
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === company);

  const filters = query([
    ["q", company],
    ["status", "wishlist"],
    ["from", day],
    ["tz", TOKYO],
    ["archived", "1"],
  ]);
  const id = await openRow(page, company);
  await expect(page).toHaveURL(`/applications/${id}${filters}`);

  const back = backTo(page, "Applications");
  await expect(back).toHaveAttribute("href", `/${filters}`);
  await back.click();

  await expect(page).toHaveURL(`/${filters}`);
  await expect(main(page).getByRole("link", { name: company })).toBeVisible();
  await expect(searchBox(page)).toHaveValue(company);
  await expect(
    page.getByRole("checkbox", { name: "Wishlist", exact: true }),
  ).toBeChecked();
  await expect(
    page
      .getByRole("group", { name: "Updated", exact: true })
      .getByLabel("From", { exact: true }),
  ).toHaveValue(day);
  await expect(
    page.getByRole("checkbox", { name: "Show archived", exact: true }),
  ).toBeChecked();
});

test("LR-E2 US-6: Edit, Cancel and Save keep the list's filters", async ({
  page,
}) => {
  const company = uniqueName("Edit");
  const role = uniqueName("Role");
  await create(page, company);

  // Filtered by company, so the edited application stays inside the filter.
  await searchBox(page).fill(company);
  await apply(page);
  const filters = query([
    ["q", company],
    ["tz", TOKYO],
  ]);
  const id = await openRow(page, company);

  await main(page).getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(`/applications/${id}/edit${filters}`);
  await expect(backTo(page, "Applications")).toHaveAttribute(
    "href",
    `/${filters}`,
  );

  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(`/applications/${id}${filters}`);

  await main(page).getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(`/applications/${id}/edit${filters}`);
  await page.getByRole("textbox", { name: "Role", exact: true }).fill(role);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(`/applications/${id}${filters}`);
  await expect(main(page).getByText(role)).toBeVisible();
  const back = backTo(page, "Applications");
  await expect(back).toHaveAttribute("href", `/${filters}`);
  await back.click();

  await expect(page).toHaveURL(`/${filters}`);
  await expect(
    main(page).getByRole("link", { name: company }).getByText(role),
  ).toBeVisible();
});

test("LR-E3 US-5: from the board, the detail page, Edit and Save link back to the board", async ({
  page,
}) => {
  const company = uniqueName("Board");
  const role = uniqueName("Role");
  await create(page, company);

  await page
    .getByRole("navigation", { name: "Views", exact: true })
    .getByRole("link", { name: "Board", exact: true })
    .click();
  await expect(page).toHaveURL("/board");
  await main(page).getByRole("link", { name: company }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: company }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split("/")[2]!;
  await expect(page).toHaveURL(`/applications/${id}?view=board`);
  await expect(backTo(page, "Board")).toHaveAttribute("href", "/board");
  await expect(backTo(page, "Applications")).toHaveCount(0);

  await main(page).getByRole("link", { name: "Edit", exact: true }).click();
  await expect(page).toHaveURL(`/applications/${id}/edit?view=board`);
  await expect(backTo(page, "Board")).toHaveAttribute("href", "/board");
  await expect(backTo(page, "Applications")).toHaveCount(0);

  await page.getByRole("textbox", { name: "Role", exact: true }).fill(role);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(`/applications/${id}?view=board`);
  await expect(main(page).getByText(role)).toBeVisible();

  await backTo(page, "Board").click();
  await expect(page).toHaveURL("/board");
  await expect(main(page).getByRole("link", { name: company })).toBeVisible();
});

test("LR-E4 US-6: a deep link's back link keeps only valid list parameters; an old from=board link is a plain detail page", async ({
  page,
}) => {
  const company = uniqueName("Deep");
  await create(page, company);
  const id = await openRow(page, company);

  await page.goto(
    `/applications/${id}?q=x&status=foo&from=board&next=https://evil.example`,
  );
  await expect(backTo(page, "Applications")).toHaveAttribute("href", "/?q=x");

  await page.goto(`/applications/${id}?from=board`);
  await expect(backTo(page, "Applications")).toHaveAttribute("href", "/");
  // Paired with LR-E3, where the same locator finds the Board link.
  await expect(backTo(page, "Board")).toHaveCount(0);
});
