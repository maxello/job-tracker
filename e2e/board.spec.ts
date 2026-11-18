import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type Route,
} from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// US-5 kanban board. Each test runs as its own new user (signed in on "/").
test.beforeEach(async ({ page }) => {
  await signUpFreshUser(page);
});

const ROLE = "Frontend Engineer";
const STATUS_LABELS = ["Wishlist", "Applied", "Interview", "Offer", "Rejected"];
const STATUS_FAILED = "Couldn't update the status. Please try again.";

// Creates an application (status Wishlist) through the form; ends on "/".
async function create(page: Page, company: string) {
  await page.goto("/applications/new");
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill(company);
  await page.getByRole("textbox", { name: "Role", exact: true }).fill(ROLE);
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL("/");
}

function views(page: Page) {
  return page.getByRole("navigation", { name: "Views", exact: true });
}

// Through the switcher, as a user gets there.
async function openBoard(page: Page) {
  const link = views(page).getByRole("link", { name: "Board", exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL("/board");
}

function headings(page: Page) {
  return page.getByRole("main").getByRole("heading", { level: 2 });
}

// A column is a section labelled by its heading, "Applied · 3".
function column(page: Page, label: string) {
  return page
    .getByRole("main")
    .getByRole("region", { name: new RegExp(`^${label} · \\d+$`) });
}

function columnHeading(page: Page, label: string) {
  return page
    .getByRole("main")
    .getByRole("heading", { level: 2, name: new RegExp(`^${label} · \\d+$`) });
}

function cards(scope: Locator) {
  return scope.getByRole("listitem");
}

function card(page: Page, company: string) {
  return cards(page.getByRole("main")).filter({ hasText: company });
}

function cardSelect(page: Page, company: string) {
  return page.getByRole("combobox", {
    name: `Status for ${company}, ${ROLE}`,
    exact: true,
  });
}

function moveButton(page: Page, company: string) {
  return page.getByRole("button", {
    name: `Move ${company}, ${ROLE}`,
    exact: true,
  });
}

function messages(page: Page) {
  return page.getByRole("main").getByRole("status");
}

function moved(company: string, label: string) {
  return `Moved ${company} (${ROLE}) to ${label}.`;
}

async function keyboardMove(page: Page, company: string, label: string) {
  await cardSelect(page, company).selectOption({ label });
  await moveButton(page, company).click();
}

function isAction(request: Request) {
  return request.method() === "POST" && "next-action" in request.headers();
}

// Holds Server Action responses on /board until release() is called; other
// requests pass. Returns how many action requests were seen.
async function holdActions(page: Page, { holdFirstOnly = false } = {}) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let seen = 0;
  await page.route("**/board", async (route: Route) => {
    if (!isAction(route.request())) return route.continue();
    seen += 1;
    if (!holdFirstOnly || seen === 1) await held;
    await route.continue();
  });
  return { release, seen: () => seen };
}

async function historyOf(page: Page, company: string) {
  await page.getByRole("link", { name: company }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
  return page
    .getByRole("region", { name: "Status history" })
    .getByRole("list")
    .getByRole("listitem");
}

test("US-5: the Views nav on / and /board links both views, marks the current one and drops list filters", async ({
  page,
}) => {
  const list = views(page).getByRole("link", { name: "List", exact: true });
  const board = views(page).getByRole("link", { name: "Board", exact: true });
  await expect(list).toHaveAttribute("aria-current", "page");
  await expect(board).not.toHaveAttribute("aria-current", "page");

  await openBoard(page);
  await expect(board).toHaveAttribute("aria-current", "page");
  await expect(list).not.toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { level: 1, name: "Board", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/Board/);
  await expect(
    page.getByRole("main").getByRole("link", { name: "New application" }),
  ).toBeVisible();

  await list.click();
  await expect(page).toHaveURL("/");

  await page.goto("/?status=APPLIED&q=acme");
  await expect(list).toHaveAttribute("href", "/");
  await expect(board).toHaveAttribute("href", "/board");
});

test("US-5: from lg the switcher sits above the list column without moving the filter column; below lg it sits above the filter form", async ({
  page,
}) => {
  await create(page, uniqueName("Acme"));
  const form = page
    .getByRole("main")
    .locator("form")
    .filter({ has: page.getByRole("searchbox") });
  // The rows list: the Pipeline legend (US-6) is a list too, with no links.
  const rows = page
    .getByRole("main")
    .getByRole("list")
    .filter({ has: page.getByRole("link") });

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(rows).toBeVisible();
  await expect(views(page)).toBeVisible();
  const nav = await views(page).boundingBox();
  const filter = await form.boundingBox();
  const listBox = await rows.boundingBox();
  if (!nav || !filter || !listBox) throw new Error("no bounding box");
  expect(Math.abs(nav.x - listBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(nav.y - filter.y)).toBeLessThanOrEqual(1);
  expect(nav.y + nav.height).toBeLessThanOrEqual(listBox.y);

  await page.setViewportSize({ width: 390, height: 800 });
  const narrowNav = await views(page).boundingBox();
  const narrowFilter = await form.boundingBox();
  if (!narrowNav || !narrowFilter) throw new Error("no bounding box");
  expect(narrowNav.y + narrowNav.height).toBeLessThanOrEqual(narrowFilter.y);
});

test("US-5: five columns with counts, empty ones included; cards newest first; archived applications never appear; the company opens the detail page", async ({
  page,
}) => {
  const older = uniqueName("Older");
  const newer = uniqueName("Newer");
  const archived = uniqueName("Archived");
  await create(page, older);
  await create(page, newer);
  await create(page, archived);
  await page.getByRole("link", { name: archived }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unarchive", exact: true }),
  ).toBeVisible();
  await page.goto("/");

  await openBoard(page);
  await expect(headings(page)).toHaveText([
    "Wishlist · 2",
    "Applied · 0",
    "Interview · 0",
    "Offer · 0",
    "Rejected · 0",
  ]);
  const wishlist = cards(column(page, "Wishlist"));
  await expect(wishlist).toHaveCount(2);
  await expect(wishlist.nth(0)).toContainText(newer);
  await expect(wishlist.nth(1)).toContainText(older);
  await expect(card(page, newer)).toContainText(ROLE);
  await expect(card(page, newer).locator("time")).toHaveCount(1);
  await expect(page.getByRole("main").getByText(archived)).toHaveCount(0);

  await card(page, newer).getByRole("link", { name: newer }).click();
  await expect(page).toHaveURL(/\/applications\/[^/]+$/);
  await expect(page.getByRole("heading", { name: newer })).toBeVisible();
});

test("US-5: the detail page opened from the board links back to the board; opened from the list it links back to the list", async ({
  page,
}) => {
  const company = uniqueName("Back");
  await create(page, company);
  await openBoard(page);

  await card(page, company).getByRole("link", { name: company }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
  const toBoard = page
    .getByRole("main")
    .getByRole("link", { name: "Board", exact: true });
  await expect(toBoard).toHaveAttribute("href", "/board");
  await expect(
    page.getByRole("main").getByRole("link", { name: "Applications" }),
  ).toHaveCount(0);
  await toBoard.click();
  await expect(page).toHaveURL("/board");
  await expect(card(page, company)).toHaveCount(1);

  await views(page).getByRole("link", { name: "List", exact: true }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("main").getByRole("link", { name: company }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
  const toList = page
    .getByRole("main")
    .getByRole("link", { name: "Applications", exact: true });
  await expect(toList).toHaveAttribute("href", "/");
  await expect(
    page.getByRole("main").getByRole("link", { name: "Board", exact: true }),
  ).toHaveCount(0);
  await toList.click();
  await expect(page).toHaveURL("/");
});

test("US-5: with no active applications the board shows the list's empty states instead of the columns", async ({
  page,
}) => {
  await openBoard(page);
  await expect(
    page.getByRole("main").getByText("No applications yet."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add your first application" }),
  ).toBeVisible();
  await expect(headings(page)).toHaveCount(0);

  const company = uniqueName("Acme");
  await create(page, company);
  await page.getByRole("link", { name: company }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unarchive", exact: true }),
  ).toBeVisible();
  await page.goto("/board");
  await expect(
    page.getByRole("main").getByText("All your applications are archived."),
  ).toBeVisible();
  await expect(headings(page)).toHaveCount(0);
  const showArchived = page.getByRole("link", { name: "Show archived" });
  await expect(showArchived).toHaveAttribute("href", "/?archived=1");

  await showArchived.click();
  await expect(page).toHaveURL("/?archived=1");
  await page.getByRole("link", { name: company }).click();
  await page.getByRole("button", { name: "Unarchive", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Archive", exact: true }),
  ).toBeVisible();
  await page.goto("/board");
  await expect(headings(page)).toHaveCount(5);
});

test("US-5: a keyboard Move puts the card first in its new column, announces it, focuses its select, and persists with history", async ({
  page,
}) => {
  const first = uniqueName("First");
  const second = uniqueName("Second");
  await create(page, first);
  await create(page, second);
  await openBoard(page);

  await expect(moveButton(page, first)).toBeDisabled();
  await cardSelect(page, first).selectOption({ label: "Applied" });
  await expect(moveButton(page, first)).toBeEnabled();
  await moveButton(page, first).click();
  await expect(messages(page)).toHaveText(moved(first, "Applied"));
  await expect(cards(column(page, "Applied"))).toHaveCount(1);

  await keyboardMove(page, second, "Applied");
  await expect(messages(page)).toHaveText(moved(second, "Applied"));
  const applied = cards(column(page, "Applied"));
  await expect(applied).toHaveCount(2);
  await expect(applied.nth(0)).toContainText(second);
  await expect(applied.nth(1)).toContainText(first);
  await expect(cardSelect(page, second)).toBeFocused();
  await expect(cardSelect(page, second)).toHaveValue("APPLIED");
  await expect(moveButton(page, second)).toBeDisabled();
  await expect(columnHeading(page, "Wishlist")).toHaveText("Wishlist · 0");

  await page.reload();
  await expect(cards(column(page, "Applied"))).toHaveCount(2);
  const history = await historyOf(page, second);
  await expect(history).toHaveCount(2);
  await expect(history.nth(1)).toContainText("Applied");
});

test("US-5: dragging a card onto another column moves it there, announces it, and persists with history", async ({
  page,
}) => {
  const company = uniqueName("Dragged");
  await create(page, company);
  await openBoard(page);

  await card(page, company).dragTo(column(page, "Interview"));
  await expect(cards(column(page, "Interview"))).toHaveCount(1);
  await expect(cards(column(page, "Interview")).first()).toContainText(company);
  await expect(messages(page)).toHaveText(moved(company, "Interview"));
  await expect(cards(column(page, "Wishlist"))).toHaveCount(0);

  await page.reload();
  await expect(cards(column(page, "Interview"))).toHaveCount(1);
  const history = await historyOf(page, company);
  await expect(history).toHaveCount(2);
  await expect(history.nth(1)).toContainText("Interview");
});

test("US-5: dropping a card on its own column sends no request and shows no message", async ({
  page,
}) => {
  const company = uniqueName("Stays");
  await create(page, company);
  await openBoard(page);
  let actions = 0;
  page.on("request", (request) => {
    if (isAction(request)) actions += 1;
  });

  await card(page, company).dragTo(column(page, "Wishlist"));
  await expect(cards(column(page, "Wishlist"))).toHaveCount(1);
  await expect(messages(page)).toHaveText("");

  // A real move afterwards sends exactly one request and fills the region,
  // so the counter and the region are proved to work.
  await keyboardMove(page, company, "Offer");
  await expect(messages(page)).toHaveText(moved(company, "Offer"));
  expect(actions).toBe(1);
});

test("US-5: moving an application deleted in another tab removes the card, says it no longer exists and focuses its column heading", async ({
  page,
}) => {
  const company = uniqueName("Gone");
  const other = uniqueName("Other");
  await create(page, company);
  await create(page, other);
  await openBoard(page);
  await expect(card(page, company)).toHaveCount(1);

  const tab = await page.context().newPage();
  try {
    await tab.goto("/");
    await tab.getByRole("link", { name: company }).click();
    await tab.getByRole("button", { name: "Delete", exact: true }).click();
    await tab
      .getByRole("dialog")
      .getByRole("button", { name: "Delete permanently" })
      .click();
    await expect(tab).toHaveURL("/");
  } finally {
    await tab.close();
  }

  await keyboardMove(page, company, "Applied");
  await expect(messages(page)).toHaveText("This application no longer exists");
  await expect(card(page, company)).toHaveCount(0);
  await expect(card(page, other)).toHaveCount(1);
  await expect(headings(page)).toHaveCount(5);
  await expect(columnHeading(page, "Wishlist")).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Application not found" }),
  ).toHaveCount(0);
});

test("US-5: moving the only active card after it was deleted in another tab shows the empty state, keeps the message and focuses the empty state's text", async ({
  page,
}) => {
  const company = uniqueName("Last");
  await create(page, company);
  await openBoard(page);
  await expect(card(page, company)).toHaveCount(1);
  await expect(headings(page)).toHaveCount(5);

  const tab = await page.context().newPage();
  try {
    await tab.goto("/");
    await tab.getByRole("link", { name: company }).click();
    await tab.getByRole("button", { name: "Delete", exact: true }).click();
    await tab
      .getByRole("dialog")
      .getByRole("button", { name: "Delete permanently" })
      .click();
    await expect(tab).toHaveURL("/");
  } finally {
    await tab.close();
  }

  await keyboardMove(page, company, "Applied");
  const empty = page.getByRole("main").getByText("No applications yet.");
  await expect(empty).toBeVisible();
  await expect(headings(page)).toHaveCount(0);
  await expect(messages(page)).toHaveText("This application no longer exists");
  await expect(empty).toBeFocused();
});

// Review finding #2: a keyboard Move whose card then leaves the board (it was
// archived in another tab) must not leave a focus target behind, which a
// later refresh bringing the card back would act on.
test("US-5: a later move's refresh doesn't pull focus to a card from an earlier keyboard Move", async ({
  page,
}) => {
  const returns = uniqueName("Returns");
  const dragged = uniqueName("Dragged");
  await create(page, returns);
  await create(page, dragged);
  await openBoard(page);

  const tab = await page.context().newPage();
  try {
    await tab.goto("/");
    await tab.getByRole("link", { name: returns }).click();
    await tab.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(
      tab.getByRole("button", { name: "Unarchive", exact: true }),
    ).toBeVisible();

    // A status change on an archived application is allowed (US-8), so the
    // move succeeds and the refresh drops the archived card.
    await keyboardMove(page, returns, "Applied");
    await expect(messages(page)).toHaveText(moved(returns, "Applied"));
    await expect(card(page, returns)).toHaveCount(0);

    await tab.getByRole("button", { name: "Unarchive", exact: true }).click();
    await expect(
      tab.getByRole("button", { name: "Archive", exact: true }),
    ).toBeVisible();
  } finally {
    await tab.close();
  }

  await card(page, dragged).dragTo(column(page, "Interview"));
  await expect(messages(page)).toHaveText(moved(dragged, "Interview"));
  await expect(cardSelect(page, returns)).toBeVisible();
  // Two frames, so React's effects for the refreshed board have run before
  // focus is checked (a wait on the browser, not on a timeout).
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(cardSelect(page, returns)).not.toBeFocused();
});

// Round-2 review finding: when no next move happens (the board went empty),
// the unresolved focus target must still be dropped, or revealing the board
// again (Activity keeps it mounted) would focus the returning card.
test("US-5: coming back to the board doesn't pull focus to a card from an earlier keyboard Move", async ({
  page,
}) => {
  const company = uniqueName("Only");
  await create(page, company);
  await openBoard(page);

  const tab = await page.context().newPage();
  try {
    await tab.goto("/");
    await tab.getByRole("link", { name: company }).click();
    await tab.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(
      tab.getByRole("button", { name: "Unarchive", exact: true }),
    ).toBeVisible();

    await keyboardMove(page, company, "Applied");
    await expect(messages(page)).toHaveText(moved(company, "Applied"));
    await expect(
      page.getByRole("main").getByText("All your applications are archived."),
    ).toBeVisible();

    await tab.getByRole("button", { name: "Unarchive", exact: true }).click();
    await expect(
      tab.getByRole("button", { name: "Archive", exact: true }),
    ).toBeVisible();
  } finally {
    await tab.close();
  }

  await views(page).getByRole("link", { name: "List", exact: true }).click();
  await expect(page).toHaveURL("/");
  await openBoard(page);
  await expect(cardSelect(page, company)).toBeVisible();
  // Two frames, so React's effects for the revealed board have run before
  // focus is checked (a wait on the browser, not on a timeout).
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(cardSelect(page, company)).not.toBeFocused();
});

test("US-5: when the move fails, the card returns to its column, a generic error shows and focus stays on its select", async ({
  page,
}) => {
  const company = uniqueName("Fails");
  await create(page, company);
  await openBoard(page);
  await page.route("**/board", (route) =>
    isAction(route.request()) ? route.abort() : route.continue(),
  );

  await keyboardMove(page, company, "Offer");
  await expect(messages(page)).toHaveText(STATUS_FAILED);
  await expect(cards(column(page, "Wishlist"))).toHaveCount(1);
  await expect(cards(column(page, "Wishlist")).first()).toContainText(company);
  await expect(cards(column(page, "Offer"))).toHaveCount(0);
  await expect(cardSelect(page, company)).toBeFocused();
});

test("US-5: two quick moves of different cards both stay after the refresh", async ({
  page,
}) => {
  const first = uniqueName("First");
  const second = uniqueName("Second");
  await create(page, first);
  await create(page, second);
  await openBoard(page);
  const hold = await holdActions(page, { holdFirstOnly: true });

  await keyboardMove(page, first, "Applied");
  await keyboardMove(page, second, "Interview");
  // Both moves show at once, and both cards are locked, while the first
  // response is held.
  await expect(cards(column(page, "Applied")).first()).toContainText(first);
  await expect(cards(column(page, "Interview")).first()).toContainText(second);
  await expect(cardSelect(page, first)).toBeDisabled();
  await expect(cardSelect(page, second)).toBeDisabled();
  hold.release();
  // Both selects are enabled only once both moves have settled, so the checks
  // below run on the refreshed board, not on the optimistic one.
  await expect(cardSelect(page, first)).toBeEnabled();
  await expect(cardSelect(page, second)).toBeEnabled();

  await expect(cards(column(page, "Applied"))).toHaveCount(1);
  await expect(cards(column(page, "Applied")).first()).toContainText(first);
  await expect(cards(column(page, "Interview"))).toHaveCount(1);
  await expect(cards(column(page, "Interview")).first()).toContainText(second);
  await expect(moveButton(page, first)).toBeDisabled();

  await page.reload();
  await expect(cards(column(page, "Applied")).first()).toContainText(first);
  await expect(cards(column(page, "Interview")).first()).toContainText(second);
  await expect(cards(column(page, "Wishlist"))).toHaveCount(0);
});

test("US-5: a pending move shows optimistically and locks only that card", async ({
  page,
}) => {
  const moving = uniqueName("Moving");
  const idle = uniqueName("Idle");
  await create(page, moving);
  await create(page, idle);
  await openBoard(page);
  const hold = await holdActions(page);

  await keyboardMove(page, moving, "Applied");
  await expect(cards(column(page, "Applied"))).toHaveCount(1);
  await expect(cards(column(page, "Applied")).first()).toContainText(moving);
  await expect(cardSelect(page, moving)).toBeDisabled();
  await expect(moveButton(page, moving)).toBeDisabled();
  await expect(card(page, moving)).toHaveAttribute("draggable", "false");
  await expect(cardSelect(page, idle)).toBeEnabled();
  await expect(card(page, idle)).toHaveAttribute("draggable", "true");

  hold.release();
  await expect(messages(page)).toHaveText(moved(moving, "Applied"));
  await expect(cardSelect(page, moving)).toBeEnabled();
  await expect(card(page, moving)).toHaveAttribute("draggable", "true");
});

test("US-5: columns fit at 1280px, the board scrolls inside its container below that, and one column fills the screen on a phone", async ({
  page,
}) => {
  const company = uniqueName("Acme");
  await create(page, company);
  await openBoard(page);
  const container = column(page, "Wishlist").locator("xpath=..");
  const overflow = () =>
    container.evaluate((element) => element.scrollWidth - element.clientWidth);
  const pageOverflow = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(headings(page)).toHaveCount(5);
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.setViewportSize({ width: 1024, height: 800 });
  await expect.poll(overflow).toBeGreaterThan(0);
  expect(await pageOverflow()).toBeLessThanOrEqual(0);
  // At the 13rem minimum the select and Move lie inside the card.
  const box = await card(page, company).boundingBox();
  const select = await cardSelect(page, company).boundingBox();
  const move = await moveButton(page, company).boundingBox();
  if (!box || !select || !move) throw new Error("no bounding box");
  for (const control of [select, move]) {
    expect(control.x).toBeGreaterThanOrEqual(box.x);
    expect(control.x + control.width).toBeLessThanOrEqual(box.x + box.width);
  }

  await page.setViewportSize({ width: 360, height: 800 });
  await expect.poll(overflow).toBeGreaterThan(0);
  expect(await pageOverflow()).toBeLessThanOrEqual(0);
  const width = await container.evaluate((element) => element.clientWidth);
  const columnBox = await column(page, "Wishlist").boundingBox();
  if (!columnBox) throw new Error("no bounding box");
  expect(Math.abs(columnBox.width - width)).toBeLessThanOrEqual(1);
  expect(
    await container.evaluate(
      (element) => getComputedStyle(element).scrollSnapType,
    ),
  ).toContain("x");
});

// The skeleton keeps the loaded board's positions (SPEC.md decision log,
// 2026-11-16). Without JavaScript the streamed board never replaces the
// fallback, so the skeleton stays on screen to be measured (the technique of
// filter-layout.spec.ts).
test("US-5: the skeleton's column headings sit where the loaded board's do", async ({
  page,
  browser,
}) => {
  await create(page, uniqueName("Acme"));
  await openBoard(page);
  await expect(headings(page)).toHaveCount(5);

  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  try {
    const skeleton = await noJs.newPage();
    await skeleton.goto("/board");
    // The skeleton is aria-hidden, so it has no roles: CSS locators.
    const fake = skeleton.locator('[aria-hidden="true"] h2');
    await expect(fake).toHaveCount(5);
    await expect(fake.first()).toHaveText(STATUS_LABELS[0]!);

    for (const width of [390, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await skeleton.setViewportSize({ width, height: 900 });
      for (const [i, label] of STATUS_LABELS.entries()) {
        const real = await headings(page).nth(i).boundingBox();
        const ghost = await fake.nth(i).boundingBox();
        if (!real || !ghost) throw new Error(`${label} has no bounding box`);
        expect
          .soft(
            Math.abs(ghost.x - real.x) + Math.abs(ghost.y - real.y),
            `${width}px ${label}: skeleton (${ghost.x}, ${ghost.y}) vs loaded (${real.x}, ${real.y})`,
          )
          .toBeLessThanOrEqual(1);
      }
    }
  } finally {
    await noJs.close();
  }
});
