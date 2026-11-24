import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";
import { recordViewTransitions, settled } from "./view-transitions";

// US-7 parse UI against the local Claude API stub (e2e/anthropic-stub.ts,
// started by playwright.config.ts). The stub picks its reply from a marker
// in the posting text and counts its /v1/messages calls.

// The stub's address, as in playwright.config.ts.
const STUB_URL = "http://127.0.0.1:3101";

const POSTING = "We are hiring a frontend engineer. Remote.";
const NOT_A_POSTING = "E2E-NOT-A-POSTING just a shopping list";
const API_ERROR = "E2E-API-ERROR posting";
const SECOND = "E2E-SECOND posting";
const SLOW = "E2E-SLOW posting";

const NOTICE =
  "The text is sent to Anthropic's Claude API to fill in the form. This app doesn't store it.";
const EMPTY_TEXT = "Paste the text of a job posting";
const TOO_LONG = "The text is too long (max 20,000 characters)";
const NOT_A_POSTING_MESSAGE = "This doesn't look like a job posting.";
const GENERIC =
  "Couldn't parse the posting. Try again or fill in the form manually.";

// The stub's first reply as the form shows it (level is null there).
const FIRST_VALUES = {
  Company: "Stubbed Co",
  Role: "Frontend Engineer",
  Location: "Remote",
  Level: "",
  Stack: "React, TypeScript",
  Min: "100000",
  Max: "120000",
  Currency: "USD",
} as const;

const SECOND_VALUES = {
  Company: "Second Co",
  Role: "Backend Engineer",
  Location: "Kyiv",
  Level: "Senior",
  Stack: "Go",
  Min: "90000",
  Max: "95000",
  Currency: "EUR",
} as const;

type ParsedLabel = keyof typeof FIRST_VALUES;
const PARSED_LABELS = Object.keys(FIRST_VALUES) as ParsedLabel[];

async function stubRequests(): Promise<number> {
  const response = await fetch(`${STUB_URL}/requests`);
  const body = (await response.json()) as { requests: number };
  return body.requests;
}

const region = (page: Page) =>
  page
    .getByRole("main")
    .getByRole("region", { name: "Paste a job posting", exact: true });
const postingText = (page: Page) =>
  region(page).getByRole("textbox", { name: "Job posting", exact: true });
const parseButton = (page: Page) =>
  region(page).getByRole("button", { name: "Parse", exact: true });
const alert = (page: Page) => region(page).getByRole("alert");
const confirmDialog = (page: Page) =>
  page.getByRole("dialog", {
    name: "Replace the filled-in fields?",
    exact: true,
  });

// A form field by its label; Currency has a datalist, so it is a combobox.
function field(page: Page, label: string) {
  const role = label === "Currency" ? "combobox" : "textbox";
  return page.getByRole("main").getByRole(role, { name: label, exact: true });
}

async function expectValues(page: Page, values: Record<ParsedLabel, string>) {
  for (const label of PARSED_LABELS) {
    await expect(field(page, label), label).toHaveValue(values[label]);
  }
}

async function openNewForm(page: Page) {
  await page
    .getByRole("link", { name: "New application", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL("/applications/new");
  await expect(field(page, "Company")).toBeVisible();
}

// To the list with the back link and back with "New application", waiting
// for each view transition, since clicks during one are lost.
async function leaveAndComeBack(page: Page) {
  await page
    .getByRole("main")
    .getByRole("link", { name: "Applications", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  await settled(page);
  await openNewForm(page);
  await settled(page);
}

test.beforeEach(async ({ page }) => {
  await recordViewTransitions(page);
  await signUpFreshUser(page);
  await openNewForm(page);
});

test("US-7: parsing fills the 8 parsed fields, keeps Job URL, Notes and the text, and saves nothing", async ({
  page,
}) => {
  await expect(region(page)).toBeVisible();
  await field(page, "Job URL").fill("https://example.com/job/1");
  await field(page, "Notes").fill("My own notes");
  await postingText(page).fill(POSTING);
  await parseButton(page).click();

  await expectValues(page, FIRST_VALUES);
  await expect(field(page, "Job URL")).toHaveValue("https://example.com/job/1");
  await expect(field(page, "Notes")).toHaveValue("My own notes");
  await expect(postingText(page)).toHaveValue(POSTING);
  await expect(field(page, "Company")).toBeFocused();

  // A failed Save re-renders the form; the parsed values stay.
  await field(page, "Role").fill("");
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(
    page.getByRole("main").getByText("Role is required", { exact: true }),
  ).toBeVisible();
  await expectValues(page, { ...FIRST_VALUES, Role: "" });

  // Nothing was saved.
  await page
    .getByRole("main")
    .getByRole("link", { name: "Applications", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("main").getByText("No applications yet.", { exact: true }),
  ).toBeVisible();
});

test("US-7: with a parsed field filled, Parse asks first; Cancel sends nothing, confirm replaces the fields", async ({
  page,
}) => {
  await postingText(page).fill(SECOND);
  await parseButton(page).click();
  await expectValues(page, SECOND_VALUES);

  await field(page, "Company").fill("My edit");
  const before = await stubRequests();
  await postingText(page).fill(POSTING);
  await parseButton(page).click();

  await expect(confirmDialog(page)).toBeVisible();
  await expect(
    confirmDialog(page).getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await confirmDialog(page)
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(confirmDialog(page)).toBeHidden();
  await expect(field(page, "Company")).toHaveValue("My edit");

  // A confirmed request whose reply differs from what a Cancel that sent
  // would bring back, so the alert is a point after both replies.
  await postingText(page).fill(NOT_A_POSTING);
  await parseButton(page).click();
  await confirmDialog(page)
    .getByRole("button", { name: "Replace fields", exact: true })
    .click();
  await expect(alert(page)).toHaveText(NOT_A_POSTING_MESSAGE);
  // One request: a Cancel that sent would make it two.
  expect(await stubRequests()).toBe(before + 1);
  await expect(field(page, "Company")).toHaveValue("My edit");

  await postingText(page).fill(POSTING);
  await parseButton(page).click();
  await confirmDialog(page)
    .getByRole("button", { name: "Replace fields", exact: true })
    .click();
  // Level goes from "Senior" to "": an empty parsed field is written too.
  await expectValues(page, FIRST_VALUES);
});

test("US-7: with only Job URL and Notes filled, Parse sends without asking", async ({
  page,
}) => {
  await field(page, "Job URL").fill("https://example.com/job/2");
  await field(page, "Notes").fill("Notes only");
  await postingText(page).fill(POSTING);
  await parseButton(page).click();

  await expectValues(page, FIRST_VALUES);
  await expect(confirmDialog(page)).toBeHidden();
});

test("US-7: empty and too-long text get a field error before any API call", async ({
  page,
}) => {
  await field(page, "Company").fill("Mine Co");
  const before = await stubRequests();

  for (const [text, message] of [
    ["   ", EMPTY_TEXT],
    ["a".repeat(20_001), TOO_LONG],
  ] as const) {
    await postingText(page).fill(text);
    await parseButton(page).click();
    await confirmDialog(page)
      .getByRole("button", { name: "Replace fields", exact: true })
      .click();

    await expect(
      region(page).getByText(message, { exact: true }),
    ).toBeVisible();
    await expect(postingText(page)).toHaveAttribute("aria-invalid", "true");
    await expect(postingText(page)).toHaveAccessibleDescription(
      `${message} ${NOTICE}`,
    );
    await expect(postingText(page)).toBeFocused();
    await expect(postingText(page)).toHaveValue(text);
    await expect(field(page, "Company")).toHaveValue("Mine Co");
  }
  expect(await stubRequests()).toBe(before);
});

test("US-7: 'not a job posting' and an API error show an alert, focus Parse and change no field", async ({
  page,
}) => {
  await postingText(page).fill(NOT_A_POSTING);
  await parseButton(page).click();
  await expect(alert(page)).toHaveText(NOT_A_POSTING_MESSAGE);
  await expect(parseButton(page)).toBeFocused();
  await expect(postingText(page)).toHaveValue(NOT_A_POSTING);

  await field(page, "Company").fill("Mine Co");
  await postingText(page).fill(API_ERROR);
  await parseButton(page).click();
  await confirmDialog(page)
    .getByRole("button", { name: "Replace fields", exact: true })
    .click();
  await expect(alert(page)).toHaveText(GENERIC);
  await expect(parseButton(page)).toBeFocused();
  await expect(field(page, "Company")).toHaveValue("Mine Co");
  await expect(postingText(page)).toHaveValue(API_ERROR);
});

test("US-7: the edit page has no parse block", async ({ page }) => {
  await expect(region(page)).toBeVisible();
  const company = uniqueName("Co");
  await field(page, "Company").fill(company);
  await field(page, "Role").fill("Dev");
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: company }).click();
  await expect(page).toHaveURL(/\/applications\/[^/]+$/);
  await page
    .getByRole("main")
    .getByRole("link", { name: "Edit", exact: true })
    .click();
  await expect(page).toHaveURL(/\/applications\/[^/]+\/edit$/);
  await expect(field(page, "Company")).toHaveValue(company);

  await expect(
    page.getByRole("heading", { name: "Paste a job posting" }),
  ).toHaveCount(0);
});

// "Focus doesn't move on return" is a manual check: a focus() during the
// re-show never lands here (measured), so no assertion could fail.
test("US-7: coming back to the page doesn't fill the fields again", async ({
  page,
}) => {
  await postingText(page).fill(POSTING);
  await parseButton(page).click();
  await expect(field(page, "Company")).toBeFocused();
  await field(page, "Company").fill("Edited Co");
  const before = await stubRequests();

  await leaveAndComeBack(page);

  await expect(field(page, "Company")).toHaveValue("Edited Co");
  expect(await stubRequests()).toBe(before);

  // The next parse doesn't apply the old result again either.
  await postingText(page).fill(NOT_A_POSTING);
  await parseButton(page).click();
  await confirmDialog(page)
    .getByRole("button", { name: "Replace fields", exact: true })
    .click();
  await expect(alert(page)).toHaveText(NOT_A_POSTING_MESSAGE);
  await expect(field(page, "Company")).toHaveValue("Edited Co");
});

test("US-7: after coming back, the cleared message doesn't reappear while the next parse runs", async ({
  page,
}) => {
  await postingText(page).fill(NOT_A_POSTING);
  await parseButton(page).click();
  await expect(alert(page)).toHaveText(NOT_A_POSTING_MESSAGE);

  await leaveAndComeBack(page);
  await expect(alert(page)).toHaveCount(0);

  await postingText(page).fill(SLOW);
  await parseButton(page).click();
  const parsing = region(page).getByRole("button", {
    name: "Parsing…",
    exact: true,
  });
  await expect(parsing).toBeDisabled();
  // One look while the 1.5 s reply is pending: a retrying toHaveCount(0)
  // would also pass once the reply clears the old message.
  expect(await alert(page).count()).toBe(0);
  expect(await parsing.isVisible()).toBe(true);

  await expectValues(page, FIRST_VALUES);
});

test("US-7: coming back clears the parse message and keeps the text; the next parse shows it again", async ({
  page,
}) => {
  await postingText(page).fill(NOT_A_POSTING);
  await parseButton(page).click();
  await expect(alert(page)).toHaveText(NOT_A_POSTING_MESSAGE);

  await leaveAndComeBack(page);
  await expect(postingText(page)).toHaveValue(NOT_A_POSTING);
  await expect(alert(page)).toHaveCount(0);

  await parseButton(page).click();
  await expect(alert(page)).toHaveText(NOT_A_POSTING_MESSAGE);

  // The text field error too.
  await postingText(page).fill("   ");
  await parseButton(page).click();
  await expect(
    region(page).getByText(EMPTY_TEXT, { exact: true }),
  ).toBeVisible();
  await expect(postingText(page)).toHaveAttribute("aria-invalid", "true");

  await leaveAndComeBack(page);
  await expect(postingText(page)).toHaveValue("   ");
  await expect(region(page).getByText(EMPTY_TEXT, { exact: true })).toHaveCount(
    0,
  );
  await expect(postingText(page)).not.toHaveAttribute("aria-invalid", "true");
});

test("US-7: after 20 parses in 24 hours the 21st shows the limit and the form stays usable", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await postingText(page).fill(NOT_A_POSTING);
  const start = await stubRequests();

  for (let n = 1; n <= 20; n++) {
    await parseButton(page).click();
    await expect.poll(stubRequests).toBe(start + n);
    await expect(parseButton(page)).toBeEnabled();
  }
  await expect(alert(page)).toHaveText(NOT_A_POSTING_MESSAGE);

  await parseButton(page).click();
  await expect(alert(page)).toHaveText(
    /^Daily limit reached\. You can parse again after \d\d:\d\d\.$/,
  );
  expect(await stubRequests()).toBe(start + 20);

  await field(page, "Company").fill("Manual Co");
  await expect(field(page, "Company")).toHaveValue("Manual Co");
});

test("US-7: while a parse runs, the button reads Parsing… and is disabled", async ({
  page,
}) => {
  await postingText(page).fill(SLOW);
  await parseButton(page).click();

  await expect(
    region(page).getByRole("button", { name: "Parsing…", exact: true }),
  ).toBeDisabled();
  await expect(parseButton(page)).toBeEnabled();
  await expectValues(page, FIRST_VALUES);
});

test("US-7: a parse that finishes while the page is hidden is dropped", async ({
  page,
}) => {
  const before = await stubRequests();
  await postingText(page).fill(SLOW);
  await parseButton(page).click();
  await page
    .getByRole("main")
    .getByRole("link", { name: "Applications", exact: true })
    .click();
  await expect(page).toHaveURL("/");

  // The stub got the call (it counts on arrival, before its 1.5 s delay).
  // The reply has come back once the hidden copy of the page shows "Parse"
  // again (CSS locator: hidden by <Activity>).
  await expect.poll(stubRequests).toBe(before + 1);
  await expect(
    page.locator("button[type=submit]").filter({ hasText: /^Parse$/ }),
  ).toHaveCount(1);
  await settled(page);

  await openNewForm(page);
  await settled(page);
  for (const label of PARSED_LABELS) {
    await expect(field(page, label), label).toHaveValue("");
  }
  await expect(alert(page)).toHaveCount(0);
  await expect(postingText(page)).toHaveValue(SLOW);
});

test("US-7: Save's field errors stay after a parse", async ({ page }) => {
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  const main = page.getByRole("main");
  await expect(
    main.getByText("Company is required", { exact: true }),
  ).toBeVisible();
  await expect(
    main.getByText("Role is required", { exact: true }),
  ).toBeVisible();

  await postingText(page).fill(POSTING);
  await parseButton(page).click();

  await expectValues(page, FIRST_VALUES);
  await expect(
    main.getByText("Company is required", { exact: true }),
  ).toBeVisible();
  await expect(
    main.getByText("Role is required", { exact: true }),
  ).toBeVisible();
});

// After a client navigation the prefetched shell shows the parse block
// before the form streams in. The navigation's RSC response is held until
// the test releases it, so the window is deterministic. Its own context: the
// beforeEach has already visited the new page, which <Activity> keeps.
test("US-7: Parse stays disabled until the form has streamed in", async ({
  browser,
}) => {
  const context = await browser.newContext();
  let release = () => {};
  try {
    const page = await context.newPage();
    await signUpFreshUser(page);
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = 0;
    await page.route(/\/applications\/new(\?|$)/, async (route) => {
      const request = route.request();
      const headers = request.headers();
      const prefetch = Object.keys(headers).some((name) =>
        /^next-router-(segment-)?prefetch/.test(name),
      );
      if (request.method() === "GET" && headers["rsc"] === "1" && !prefetch) {
        held += 1;
        await gate;
      }
      await route.continue();
    });

    await page
      .getByRole("link", { name: "New application", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL("/applications/new");
    await expect.poll(() => held).toBeGreaterThan(0);
    await expect(
      page.getByRole("main").getByText("Loading form", { exact: true }),
    ).toHaveCount(1);
    await expect(region(page)).toBeVisible();
    await expect(parseButton(page)).toBeDisabled();

    release();
    await expect(field(page, "Company")).toBeVisible();
    await expect(parseButton(page)).toBeEnabled();
  } finally {
    release();
    await context.close();
  }
});
