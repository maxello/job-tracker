import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// US-6 date range (`from`, `to`, `tz`), SPEC.md section 4 and the decision
// log, 2026-11-16 and 2026-11-17. The browser runs in Tokyo; rows can't be
// backdated, so the tests use today and yesterday in a named zone.
// Each test signs up its own user and creates its own applications.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

const NO_MATCH = "No applications match your filters";
const NO_APPLICATIONS = "No applications yet.";

// The calendar date (YYYY-MM-DD) of `instant` in `zone`.
function dateIn(zone: string, instant = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dayBefore(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

async function create(page: Page, company: string) {
  await page.goto("/applications/new");
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill(company);
  await page
    .getByRole("textbox", { name: "Role", exact: true })
    .fill("Engineer");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL("/");
}

// Opens the application from the list and sets a status on its detail page;
// the second history record means it's saved. Then back to the list.
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
  await page
    .getByRole("main")
    .getByRole("link", { name: "Applications", exact: true })
    .click();
  await expect(page).toHaveURL("/");
}

function dates(page: Page) {
  return page.getByRole("group", { name: "Updated", exact: true });
}

function fromInput(page: Page) {
  return dates(page).getByLabel("From", { exact: true });
}

function toInput(page: Page) {
  return dates(page).getByLabel("To", { exact: true });
}

// A hidden input has no role (see the e2e skill: CSS for hidden inputs).
function tzInput(page: Page) {
  return page.locator('input[type="hidden"][name="tz"]');
}

// Checks the input first, so a missing field fails on an assertion, not on
// fill's test timeout.
async function fillDate(input: ReturnType<typeof fromInput>, value: string) {
  await expect(input).toBeVisible();
  await input.fill(value);
}

function row(page: Page, company: string) {
  return page.getByRole("link", { name: company });
}

// tz is filled in after hydration; waiting for it means Apply sends it.
async function apply(page: Page) {
  await expect(tzInput(page)).toHaveValue(TOKYO);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
}

function rangeUrl(from: string | null, to: string | null, tz = TOKYO) {
  return (url: URL) =>
    url.pathname === "/" &&
    url.searchParams.get("from") === from &&
    url.searchParams.get("to") === to &&
    url.searchParams.get("tz") === tz;
}

test.beforeEach(async ({ page }) => {
  await signUpFreshUser(page);
});

test("R1 US-6: Apply with no dates adds the browser's zone as tz", async ({
  page,
}) => {
  await create(page, uniqueName("Zone Co"));

  await apply(page);

  await expect(page).toHaveURL(rangeUrl("", ""));
});

test("R2 §11 US-6: From and To filter by last updated, inclusive, and survive a reload", async ({
  page,
}) => {
  const company = uniqueName("Today Co");
  await create(page, company);
  // Computed once, right after the row is saved, and reused: a run that
  // crosses midnight in Tokyo between here and the last assertion can still
  // fail, but the dates never disagree with each other.
  const today = dateIn(TOKYO);
  const yesterday = dayBefore(today);

  await fillDate(fromInput(page), today);
  await fillDate(toInput(page), today);
  await apply(page);

  await expect(page).toHaveURL(rangeUrl(today, today));
  await expect(row(page, company)).toBeVisible();

  await page.reload();

  await expect(fromInput(page)).toHaveValue(today);
  await expect(toInput(page)).toHaveValue(today);
  await expect(row(page, company)).toBeVisible();

  await fillDate(fromInput(page), "");
  await fillDate(toInput(page), yesterday);
  await apply(page);

  await expect(page).toHaveURL(rangeUrl("", yesterday));
  await expect(page.getByText(NO_MATCH)).toBeVisible();
  await expect(row(page, company)).toHaveCount(0);
});

// Kiritimati (+14) and Pago Pago (−11) are 25 hours apart, so a day there
// never contains the same instant: the zone in the URL decides, not the
// browser's (and LocalDate still shows Tokyo dates, the accepted limitation).
test("R3 US-6: a bookmark filters by the tz in the URL, not the browser's zone", async ({
  page,
}) => {
  const company = uniqueName("Bookmark Co");
  await create(page, company);
  // Computed once, right after the row is saved (see R2 on midnight).
  const day = dateIn("Pacific/Kiritimati");

  await page.goto(`/?from=${day}&to=${day}&tz=Pacific/Kiritimati`);

  await expect(fromInput(page)).toHaveValue(day);
  await expect(row(page, company)).toBeVisible();

  await page.goto(`/?from=${day}&to=${day}&tz=Pacific/Pago_Pago`);

  await expect(fromInput(page)).toHaveValue(day);
  await expect(page.getByText(NO_MATCH)).toBeVisible();
  await expect(row(page, company)).toHaveCount(0);
});

test("R4 US-6: tz alone is not a filter, so a user with no applications sees No applications yet", async ({
  page,
}) => {
  await page.goto("/?tz=Europe/Kyiv");

  await expect(page.getByText(NO_APPLICATIONS)).toBeVisible();
  await expect(page.getByText(NO_MATCH)).toHaveCount(0);
});

test("R5 US-6: an invalid date is ignored without a redirect, and its input is empty", async ({
  page,
}) => {
  const company = uniqueName("Invalid Co");
  await create(page, company);

  await page.goto("/?from=2026-02-30&to=17.11.2026");

  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("from") === "2026-02-30" &&
      url.searchParams.get("to") === "17.11.2026",
  );
  await expect(row(page, company)).toBeVisible();
  await expect(fromInput(page)).toHaveValue("");
  await expect(toInput(page)).toHaveValue("");
});

test("R5 US-6: one valid date alone is an active filter, even with no applications", async ({
  page,
}) => {
  await page.goto("/?from=2026-11-01&to=bad");

  await expect(page.getByText(NO_MATCH)).toBeVisible();
  await expect(fromInput(page)).toHaveValue("2026-11-01");
  await expect(page.getByText(NO_APPLICATIONS)).toHaveCount(0);
});

test("R6 US-6: From later than To shows no match and keeps both dates as given", async ({
  page,
}) => {
  const company = uniqueName("Swap Co");
  await create(page, company);
  const today = dateIn(TOKYO);
  const yesterday = dayBefore(today);
  await expect(row(page, company)).toBeVisible();

  await fillDate(fromInput(page), today);
  await fillDate(toInput(page), yesterday);
  await apply(page);

  await expect(page).toHaveURL(rangeUrl(today, yesterday));
  await expect(page.getByText(NO_MATCH)).toBeVisible();
  await expect(row(page, company)).toHaveCount(0);
  await expect(fromInput(page)).toHaveValue(today);
  await expect(toInput(page)).toHaveValue(yesterday);
});

test("R7 §11 US-6: dates, search and status combine (AND) and survive a reload", async ({
  page,
}) => {
  const tag = uniqueName("Combo");
  // Neither name contains the other, so the non-exact row links stay unique.
  const match = `${tag} Acme One`;
  const wishlist = `${tag} Acme Two`;
  const other = `${tag} Globex`;
  await create(page, match);
  await create(page, wishlist);
  await create(page, other);
  await setStatus(page, match, "Applied");
  await setStatus(page, other, "Applied");
  const today = dateIn(TOKYO);

  await page
    .getByRole("searchbox", { name: "Search", exact: true })
    .fill(`${tag} Acme`);
  await page.getByRole("checkbox", { name: "Applied", exact: true }).check();
  await fillDate(fromInput(page), today);
  await fillDate(toInput(page), today);
  await apply(page);

  await expect(page).toHaveURL(
    (url) =>
      rangeUrl(today, today)(url) &&
      url.searchParams.get("q") === `${tag} Acme` &&
      url.searchParams.getAll("status").join() === "applied",
  );
  await expect(row(page, match)).toBeVisible();
  await expect(row(page, wishlist)).toHaveCount(0);
  await expect(row(page, other)).toHaveCount(0);

  await page.reload();

  await expect(row(page, match)).toBeVisible();
  await expect(row(page, wishlist)).toHaveCount(0);
  await expect(row(page, other)).toHaveCount(0);
  await expect(fromInput(page)).toHaveValue(today);

  await fillDate(toInput(page), dayBefore(today));
  await fillDate(fromInput(page), "");
  await apply(page);

  await expect(page.getByText(NO_MATCH)).toBeVisible();
  await expect(row(page, match)).toHaveCount(0);
});

test("R8 US-6: Clear empties both dates", async ({ page }) => {
  const company = uniqueName("Clear Co");
  await create(page, company);
  const today = dateIn(TOKYO);
  await fillDate(fromInput(page), today);
  await fillDate(toInput(page), today);
  await apply(page);
  await expect(page).toHaveURL(rangeUrl(today, today));
  await expect(fromInput(page)).toHaveValue(today);
  await expect(toInput(page)).toHaveValue(today);

  await page.getByRole("link", { name: "Clear", exact: true }).click();

  await expect(page).toHaveURL("/");
  await expect(fromInput(page)).toHaveValue("");
  await expect(toInput(page)).toHaveValue("");
});

// `/?q=` and `/?q=&from=&to=&tz=…` have the same raw `q` and parse to the
// same "no dates", so only the raw `from` and `to` in the form's key tell
// them apart: with a key built from the parsed dates, Back keeps the typed
// date (like E9 for `q`).
test("R9 US-6: Back drops a date that was typed but not applied", async ({
  page,
}) => {
  await create(page, uniqueName("Back Co"));
  await page.goto("/?q=");
  await apply(page);
  await expect(page).toHaveURL(
    (url) => rangeUrl("", "")(url) && url.searchParams.get("q") === "",
  );

  await fillDate(fromInput(page), "2026-11-01");
  await expect(fromInput(page)).toHaveValue("2026-11-01");

  await page.goBack();

  await expect(page).toHaveURL(
    (url) => url.pathname === "/" && url.search === "?q=",
  );
  await expect(fromInput(page)).toHaveValue("");
});

// Two list URLs that differ only in `tz` (a bookmark from another zone, or a
// submit before hydration sent `tz=`): Apply replaces it with the browser's
// zone, so only the raw `tz` in the form's key tells them apart.
test("R11 US-6: Back between list URLs that differ only in tz drops a date typed but not applied", async ({
  page,
}) => {
  await create(page, uniqueName("Zone Back Co"));
  await page.goto("/?q=&from=&to=&tz=Pacific/Kiritimati");
  await apply(page);
  await expect(page).toHaveURL(
    (url) => rangeUrl("", "")(url) && url.searchParams.get("q") === "",
  );

  await fillDate(fromInput(page), "2026-11-01");
  await expect(fromInput(page)).toHaveValue("2026-11-01");

  await page.goBack();

  await expect(page).toHaveURL(
    (url) => url.searchParams.get("tz") === "Pacific/Kiritimati",
  );
  await expect(fromInput(page)).toHaveValue("");
});

// R10 checks what the browser ends up with. It can't see attribute
// mismatches: a server that rendered its own zone into the input still passed
// here. That `tz` is empty before hydration is guarded by the unit test F7
// (status-filter-form.test.tsx), which checks the server-rendered markup.
test("R10 US-6: the tz input fills in after hydration without a hydration error", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");

  await expect(tzInput(page)).toHaveValue(TOKYO);
  expect(errors.filter((text) => /hydrat|#418/i.test(text))).toEqual([]);
});
