import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// Two fresh users per test, signed in at the same time: the owner in the
// default page, the intruder in a separate browser context (its own cookies).
let owner: Page;
let ownerId: string;
let ownerCompany: string;
let intruderContext: BrowserContext;
let intruder: Page;

test.beforeEach(async ({ page, browser }) => {
  owner = page;
  await signUpFreshUser(owner);
  ownerCompany = uniqueName("Acme");
  ownerId = await createAndOpen(owner, ownerCompany);

  intruderContext = await browser.newContext();
  intruder = await intruderContext.newPage();
  await signUpFreshUser(intruder);
});

test.afterEach(async () => {
  await intruderContext.close();
});

// Creates an application (status Wishlist), opens its detail page and returns
// its id from the URL.
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

  const match = new URL(page.url()).pathname.match(/^\/applications\/([^/]+)$/);
  expect(match).not.toBeNull();
  return match![1];
}

// Shaped like a cuid (the Application id default) but never in the database,
// so it passes id validation and misses in the owner-scoped query.
function missingId() {
  return `c${randomUUID().replaceAll("-", "").slice(0, 24)}`;
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

function noindex(page: Page) {
  return page.locator('meta[name="robots"][content*="noindex"]');
}

async function expectNotFound(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Application not found" }),
  ).toBeVisible();
  await expect(
    page.getByText("It doesn't exist or isn't available."),
  ).toBeVisible();
  expect(await noindex(page).count()).toBeGreaterThan(0);
}

// What a visitor (or a crawler) can tell apart between two not-found pages.
async function notFoundSnapshot(page: Page) {
  return {
    title: await page.title(),
    main: await page.getByRole("main").innerText(),
    noindex: (await noindex(page).count()) > 0,
  };
}

// The hidden input is the only source of `id` in the action's FormData, so
// changing its value changes exactly that field of the POST, which still
// carries the intruder's real session cookie and action ID.
async function swapId(form: Locator, id: string) {
  await form
    .locator('input[type="hidden"][name="id"]')
    .evaluate((input: HTMLInputElement, value) => {
      input.value = value;
    }, id);
}

// Submits a Server Action and checks that the request carried the owner's id
// and the action answered with the not-found UI on the same URL. Actions that
// call notFound() answer HTTP 404; the status change answers 200 with a
// not-found result that its form turns into the same UI (US-5, SPEC.md
// decision log, 2026-11-17).
async function submitAndExpectNotFound(
  page: Page,
  submit: Locator,
  ownIdOfIntruder: string,
  actionStatus = 404,
) {
  const url = page.url();
  const isAction = (request: {
    method(): string;
    headers(): Record<string, string>;
  }) => request.method() === "POST" && "next-action" in request.headers();

  const [request, response] = await Promise.all([
    page.waitForRequest(isAction),
    page.waitForResponse((r) => isAction(r.request())),
    submit.click(),
  ]);

  const body = request.postData() ?? "";
  expect(body).toContain(ownerId);
  expect(body).not.toContain(ownIdOfIntruder);
  expect(response.status()).toBe(actionStatus);

  await expectNotFound(page);
  expect(page.url()).toBe(url);
}

test("US-0: another user's detail page shows the same not-found page as an id that doesn't exist", async () => {
  await intruder.goto(`/applications/${ownerId}`);
  await expectNotFound(intruder);
  const foreign = await notFoundSnapshot(intruder);

  await intruder.goto(`/applications/${missingId()}`);
  await expectNotFound(intruder);
  const missing = await notFoundSnapshot(intruder);

  expect(foreign).toEqual(missing);
  expect(foreign.main).not.toContain(ownerCompany);
});

test("US-0: another user's edit page shows the same not-found page as an id that doesn't exist", async () => {
  await intruder.goto(`/applications/${ownerId}/edit`);
  await expectNotFound(intruder);
  const foreign = await notFoundSnapshot(intruder);

  await intruder.goto(`/applications/${missingId()}/edit`);
  await expectNotFound(intruder);
  const missing = await notFoundSnapshot(intruder);

  expect(foreign).toEqual(missing);
  expect(foreign.main).not.toContain(ownerCompany);
});

test("US-0: the list on / doesn't show another user's application", async () => {
  await intruder.goto("/");
  await expect(intruder.getByText("No applications yet.")).toBeVisible();
  await expect(intruder.getByRole("link", { name: ownerCompany })).toHaveCount(
    0,
  );
  await expect(intruder.getByText(ownerCompany)).toHaveCount(0);
});

test("US-0 (from M5): user B's board shows none of user A's cards", async () => {
  const ownCompany = uniqueName("Globex");
  await createAndOpen(intruder, ownCompany);

  await intruder.goto("/board");
  await expect(
    intruder.getByRole("main").getByRole("link", { name: ownCompany }),
  ).toBeVisible();
  await expect(intruder.getByRole("main").getByText(ownerCompany)).toHaveCount(
    0,
  );
});

test("US-0: a status change with another user's id swapped in gets the not-found response and changes nothing", async () => {
  const ownId = await createAndOpen(intruder, uniqueName("Globex"));

  const form = intruder.locator("form").filter({ has: statusSelect(intruder) });
  await statusSelect(intruder).selectOption({ label: "Applied" });
  await swapId(form, ownerId);
  await submitAndExpectNotFound(
    intruder,
    intruder.getByRole("button", { name: "Update status" }),
    ownId,
    200,
  );
  const afterAction = await intruder.getByRole("main").innerText();

  await intruder.goto(`/applications/${missingId()}`);
  await expectNotFound(intruder);
  expect(afterAction).toBe(await intruder.getByRole("main").innerText());

  await owner.goto(`/applications/${ownerId}`);
  await expect(
    owner.getByRole("heading", { name: ownerCompany }),
  ).toBeVisible();
  await expect(statusSelect(owner)).toHaveValue("WISHLIST");
  await expect(historyRecords(owner)).toHaveCount(1);
  await expect(historyRecords(owner).first()).toContainText(
    "Created as Wishlist",
  );
});

test("US-0: an edit with another user's id swapped in gets the not-found response and changes nothing", async () => {
  const ownId = await createAndOpen(intruder, uniqueName("Initech"));
  await intruder.goto(`/applications/${ownId}/edit`);

  const company = intruder.getByRole("textbox", {
    name: "Company",
    exact: true,
  });
  const newCompany = uniqueName("Hacked");
  await company.fill(newCompany);
  await swapId(intruder.locator("form").filter({ has: company }), ownerId);
  await submitAndExpectNotFound(
    intruder,
    intruder.getByRole("button", { name: "Save changes" }),
    ownId,
  );
  const afterAction = await intruder.getByRole("main").innerText();

  await intruder.goto(`/applications/${missingId()}/edit`);
  await expectNotFound(intruder);
  expect(afterAction).toBe(await intruder.getByRole("main").innerText());

  await owner.goto(`/applications/${ownerId}`);
  await expect(
    owner.getByRole("heading", { name: ownerCompany }),
  ).toBeVisible();
  await expect(owner.getByText(newCompany)).toHaveCount(0);
});

test("US-0: a delete with another user's id swapped in gets the not-found response and changes nothing", async () => {
  const ownId = await createAndOpen(intruder, uniqueName("Umbrella"));

  await intruder.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = intruder.getByRole("dialog", {
    name: "Delete this application?",
  });
  await expect(dialog).toBeVisible();
  await swapId(dialog.locator("form"), ownerId);
  await submitAndExpectNotFound(
    intruder,
    dialog.getByRole("button", { name: "Delete permanently" }),
    ownId,
  );
  const afterAction = await intruder.getByRole("main").innerText();

  await intruder.goto(`/applications/${missingId()}`);
  await expectNotFound(intruder);
  expect(afterAction).toBe(await intruder.getByRole("main").innerText());

  await owner.goto("/");
  await expect(owner.getByRole("link", { name: ownerCompany })).toBeVisible();
  await owner.goto(`/applications/${ownerId}`);
  await expect(
    owner.getByRole("heading", { name: ownerCompany }),
  ).toBeVisible();
});

test("US-0: an archive with another user's id swapped in gets the not-found response and changes nothing", async () => {
  const ownId = await createAndOpen(intruder, uniqueName("Hooli"));

  const archive = intruder.getByRole("button", {
    name: "Archive",
    exact: true,
  });
  await swapId(intruder.locator("form").filter({ has: archive }), ownerId);
  await submitAndExpectNotFound(intruder, archive, ownId);
  const afterAction = await intruder.getByRole("main").innerText();

  await intruder.goto(`/applications/${missingId()}`);
  await expectNotFound(intruder);
  expect(afterAction).toBe(await intruder.getByRole("main").innerText());

  await owner.goto("/");
  await expect(owner.getByRole("link", { name: ownerCompany })).toBeVisible();
  await owner.goto(`/applications/${ownerId}`);
  await expect(
    owner.getByRole("button", { name: "Archive", exact: true }),
  ).toBeVisible();
  await expect(owner.getByText("Archived", { exact: true })).toHaveCount(0);
});

test("US-0: an unarchive with another user's id swapped in gets the not-found response and changes nothing", async () => {
  await owner.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    owner.getByRole("button", { name: "Unarchive", exact: true }),
  ).toBeVisible();

  const ownId = await createAndOpen(intruder, uniqueName("Pied Piper"));
  await intruder.getByRole("button", { name: "Archive", exact: true }).click();
  const unarchive = intruder.getByRole("button", {
    name: "Unarchive",
    exact: true,
  });
  await expect(unarchive).toBeVisible();
  await swapId(intruder.locator("form").filter({ has: unarchive }), ownerId);
  await submitAndExpectNotFound(intruder, unarchive, ownId);
  const afterAction = await intruder.getByRole("main").innerText();

  await intruder.goto(`/applications/${missingId()}`);
  await expectNotFound(intruder);
  expect(afterAction).toBe(await intruder.getByRole("main").innerText());

  await owner.goto("/");
  await expect(owner.getByRole("link", { name: ownerCompany })).toHaveCount(0);
  await owner.goto(`/applications/${ownerId}`);
  await expect(
    owner.getByRole("button", { name: "Unarchive", exact: true }),
  ).toBeVisible();
  await expect(owner.getByText("Archived", { exact: true })).toBeVisible();
});
