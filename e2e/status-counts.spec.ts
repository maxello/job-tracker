import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// US-6 status counts and pipeline bar (SPEC.md decision log, 2026-11-18).
// Each test signs up its own user and creates its own applications.

const LABELS = ["Wishlist", "Applied", "Interview", "Offer", "Rejected"];

// Creates an application through the form, ending on "/". Any status other
// than Wishlist is then set on its detail page; the second history record
// means it's saved.
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
  await expect(historyRecords(page)).toHaveCount(2);
}

function historyRecords(page: Page) {
  return page
    .getByRole("region", { name: "Status history" })
    .getByRole("list")
    .getByRole("listitem");
}

// Opens the application's detail page from the list and archives it.
async function archiveFromList(page: Page, company: string) {
  await page.getByRole("link", { name: company }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unarchive", exact: true }),
  ).toBeVisible();
}

function checkbox(page: Page, label: string) {
  return page.getByRole("checkbox", { name: label, exact: true });
}

// The checkbox's label, which also holds the aria-hidden count.
function statusLabel(page: Page, label: string) {
  return page
    .getByRole("main")
    .locator("label")
    .filter({ has: checkbox(page, label) });
}

// The count at the end of the status row: aria-hidden, so it has no role.
function checkboxCount(page: Page, label: string) {
  return statusLabel(page, label).locator('[aria-hidden="true"]');
}

function pipeline(page: Page) {
  return page.getByRole("list", { name: "Pipeline", exact: true });
}

// The legend's visible texts, Wishlist → Rejected, e.g. ["Wishlist · 2", …].
function texts(counts: number[]) {
  return LABELS.map((label, i) => `${label} · ${counts[i]}`);
}

// Soft with a short timeout, so one run reports every status and five misses
// don't use up the test's time.
async function expectCheckboxCounts(page: Page, counts: number[]) {
  for (const [i, label] of LABELS.entries()) {
    await expect
      .soft(checkboxCount(page, label), label)
      .toHaveText(String(counts[i]), { timeout: 1000 });
  }
}

// One hard wait with the default timeout after a navigation, before the 1s
// soft checks: the counts have rendered once a row shows its count.
async function waitForCounts(page: Page) {
  await expect(checkboxCount(page, "Wishlist")).toBeVisible();
}

async function expectLegend(page: Page, counts: number[]) {
  await expect(pipeline(page).getByRole("listitem")).toHaveText(texts(counts));
}

test.beforeEach(async ({ page }) => {
  await signUpFreshUser(page);
});

test("C1 US-6: each status checkbox shows its count, keeps the status name as its name, and the Pipeline legend lists all five", async ({
  page,
}) => {
  await createWithStatus(page, uniqueName("Wish One"), "Wishlist");
  await createWithStatus(page, uniqueName("Wish Two"), "Wishlist");
  await createWithStatus(page, uniqueName("Applied Co"), "Applied");
  await page.goto("/");
  await waitForCounts(page);

  await expectCheckboxCounts(page, [2, 1, 0, 0, 0]);
  await expect(
    page.getByRole("main").locator('input[name="status"][value="applied"]'),
  ).toHaveAccessibleName("Applied");
  await expectLegend(page, [2, 1, 0, 0, 0]);
});

test("C2 US-6: search and the status filter don't change the counts, and the bar shows above empty state 1", async ({
  page,
}) => {
  await createWithStatus(page, uniqueName("Wish Co"), "Wishlist");
  await createWithStatus(page, uniqueName("Applied Co"), "Applied");
  await page.goto("/?status=applied&q=zzz-no-match");
  await waitForCounts(page);

  const empty = page.getByText("No applications match your filters.");
  await expect(empty).toBeVisible();
  await expectCheckboxCounts(page, [1, 1, 0, 0, 0]);
  await expectLegend(page, [1, 1, 0, 0, 0]);

  const legendBox = await pipeline(page).boundingBox();
  const emptyBox = await empty.boundingBox();
  if (!legendBox || !emptyBox) throw new Error("no bounding box");
  expect(legendBox.y + legendBox.height).toBeLessThanOrEqual(emptyBox.y);
});

test('C3 US-6: the counts leave archived applications out, and count them with "Show archived"', async ({
  page,
}) => {
  const kept = uniqueName("Kept Co");
  const archived = uniqueName("Archived Co");
  await createWithStatus(page, kept, "Wishlist");
  await createWithStatus(page, archived, "Wishlist");
  await archiveFromList(page, archived);
  await page.goto("/");
  await waitForCounts(page);

  await expect(page.getByRole("link", { name: kept })).toBeVisible();
  await expectCheckboxCounts(page, [1, 0, 0, 0, 0]);
  await expectLegend(page, [1, 0, 0, 0, 0]);

  await page
    .getByRole("checkbox", { name: "Show archived", exact: true })
    .check();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("link", { name: archived })).toBeVisible();
  await expectCheckboxCounts(page, [2, 0, 0, 0, 0]);
  await expectLegend(page, [2, 0, 0, 0, 0]);
});

test("C4 US-6: archiving the last active application hides the bar and the legend, and the checkboxes show 0", async ({
  page,
}) => {
  const company = uniqueName("Last Co");
  await createWithStatus(page, company, "Wishlist");
  await expect(pipeline(page)).toBeVisible();

  await archiveFromList(page, company);
  await page.goto("/");
  await waitForCounts(page);

  await expect(
    page.getByText("All your applications are archived"),
  ).toBeVisible();
  await expectCheckboxCounts(page, [0, 0, 0, 0, 0]);
  await expect(pipeline(page)).toHaveCount(0);
});

test("C5 US-6: with no applications there is no bar, also in empty state 1, and the checkboxes show 0", async ({
  page,
}) => {
  await page.goto("/");
  await waitForCounts(page);
  await expect(page.getByText("No applications yet.")).toBeVisible();
  await expectCheckboxCounts(page, [0, 0, 0, 0, 0]);
  await expect(pipeline(page)).toHaveCount(0);

  await page.goto("/?status=applied");
  await waitForCounts(page);
  await expect(
    page.getByText("No applications match your filters."),
  ).toBeVisible();
  await expect(pipeline(page)).toHaveCount(0);

  // The same locator finds the legend once there is something to count.
  await createWithStatus(page, uniqueName("First Co"), "Wishlist");
  await expect(pipeline(page)).toBeVisible();
});

test("C6 US-6: with a single status, its one segment fills the bar", async ({
  page,
}) => {
  await createWithStatus(page, uniqueName("Only Co"), "Wishlist");
  // The bar is aria-hidden, so it has no role: a CSS locator.
  const bar = page.locator("[data-pipeline-bar]").filter({ visible: true });
  const segments = bar.locator(":scope > *");

  await expect(segments).toHaveCount(1);
  const barBox = await bar.boundingBox();
  const segmentBox = await segments.first().boundingBox();
  if (!barBox || !segmentBox) throw new Error("no bounding box");
  expect(Math.abs(segmentBox.width - barBox.width)).toBeLessThanOrEqual(1);
});

// The list hidden by <Activity> is restored on Back, not loaded again; the
// counts must still show the change made on the detail page (SPEC.md
// decision log, 2026-11-18, freshness).
test("C7 US-6: after a status change on the detail page, Back to the preserved list shows the new counts", async ({
  page,
}) => {
  const company = uniqueName("Fresh Co");
  await createWithStatus(page, company, "Wishlist");
  await expectLegend(page, [1, 0, 0, 0, 0]);

  await page.getByRole("link", { name: company }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
  const detailPath = new URL(page.url()).pathname;
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption({ label: "Applied" });
  // Waits for the action's response, not for the refreshed history, so the
  // test reaches Back even when the action doesn't refresh.
  const action = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === detailPath,
  );
  await page.getByRole("button", { name: "Update status" }).click();
  expect((await action).ok()).toBe(true);

  const documents: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents.push(request.url());
  });
  await page.goBack();
  await expect(page).toHaveURL("/");
  await expectLegend(page, [0, 1, 0, 0, 0]);
  await expectCheckboxCounts(page, [0, 1, 0, 0, 0]);
  expect(documents, "Back restored the page, no document request").toEqual([]);
});
