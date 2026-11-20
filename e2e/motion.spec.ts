import { expect, test, type Locator, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";
import {
  allAnimations,
  clicks,
  expectAnimated,
  expectFadeOnly,
  expectNoTranslate,
  expectSlide,
  expectTypes,
  expectUntyped,
  recordViewTransitions,
  resetRecords,
  settled,
  stretchTransitions,
  transitions,
  waitForReady,
  type VtRecord,
} from "./view-transitions";

// SPEC section 7 "Motion" and the US-5 motion bullet (M5). View transitions
// are measured, not judged by eye: e2e/view-transitions.ts records every
// transition React starts and its ::view-transition-* animations at `ready`.
// Only this spec sets prefers-reduced-motion; the others keep the default.

const ROLE = "Frontend Engineer";
type Motion = "no-preference" | "reduce";

// Creates an application (status Wishlist) through the form; ends on "/".
async function create(page: Page, company: string) {
  await page.goto("/applications/new");
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill(company);
  await page.getByRole("textbox", { name: "Role", exact: true }).fill(ROLE);
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL("/");
  await expect(rowLink(page, company)).toBeVisible();
}

function main(page: Page) {
  return page.getByRole("main");
}

// A list row: a link in a list with no status select, so a board card's
// company link (same name) never matches.
function rowLink(page: Page, company: string) {
  return main(page)
    .getByRole("list")
    .filter({ hasNot: page.getByRole("combobox") })
    .getByRole("link", { name: company });
}

function views(page: Page) {
  return page.getByRole("navigation", { name: "Views", exact: true });
}

function detailHeading(page: Page, company: string) {
  return page.getByRole("heading", { level: 1, name: company });
}

function pageHeading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name, exact: true });
}

function column(page: Page, label: string) {
  return main(page).getByRole("region", {
    name: new RegExp(`^${label} · \\d+$`),
  });
}

// A board card: a list item inside a column, so a list row with the same
// company (on "/", before the navigation commits) never matches.
function card(page: Page, company: string) {
  return main(page)
    .getByRole("region", {
      name: /^(Wishlist|Applied|Interview|Offer|Rejected) · \d+$/,
    })
    .getByRole("listitem")
    .filter({ hasText: company });
}

function cardSelect(page: Page, company: string) {
  return page.getByRole("combobox", {
    name: `Status for ${company}, ${ROLE}`,
    exact: true,
  });
}

function moved(company: string, label: string) {
  return `Moved ${company} (${ROLE}) to ${label}.`;
}

function backLink(page: Page, name: "Applications" | "Board") {
  return main(page).getByRole("link", { name, exact: true });
}

// Resets the recorder, runs the navigation, waits for the destination, then
// for every transition it started to finish.
async function recordNavigation(
  page: Page,
  go: () => Promise<void>,
  arrived: Locator,
): Promise<VtRecord[]> {
  await resetRecords(page);
  await go();
  await expect(arrived).toBeVisible();
  return settled(page);
}

// The checks every directional navigation gets: its type, then a slide in
// the right direction without reduced motion, or a fade with it.
function expectDirectional(
  records: VtRecord[],
  direction: "forward" | "back",
  motion: Motion,
) {
  expectTypes(records, direction === "forward" ? "nav-forward" : "nav-back");
  if (motion === "reduce") expectFadeOnly(records);
  else expectSlide(records, direction);
}

// Navigations with no direction: no type, at least one animation, and an
// opacity-only crossfade under both settings.
function expectCrossfade(records: VtRecord[]) {
  expectUntyped(records);
  expectFadeOnly(records);
  expectNoTranslate(records);
}

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no bounding box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

for (const motion of ["no-preference", "reduce"] as const) {
  test.describe(`prefers-reduced-motion: ${motion}`, () => {
    test.use({ reducedMotion: motion });

    test.beforeEach(async ({ page }) => {
      await recordViewTransitions(page);
      await signUpFreshUser(page);
    });

    test(`M1 §7 Motion (${motion}): a list row opens the detail page with a forward transition`, async ({
      page,
    }) => {
      const company = uniqueName("Forward");
      await create(page, company);

      const records = await recordNavigation(
        page,
        () => rowLink(page, company).click(),
        detailHeading(page, company),
      );
      expectDirectional(records, "forward", motion);
      // The details replacing their skeleton start no second transition.
      expect(records, "transitions for one navigation").toHaveLength(1);
    });

    test(`M2 §7 Motion (${motion}): the back links of the detail and edit pages go back`, async ({
      page,
    }) => {
      const company = uniqueName("Back");
      await create(page, company);
      await rowLink(page, company).click();
      await expect(detailHeading(page, company)).toBeVisible();

      const fromDetail = await recordNavigation(
        page,
        () => backLink(page, "Applications").click(),
        rowLink(page, company),
      );
      expectDirectional(fromDetail, "back", motion);

      await rowLink(page, company).click();
      await main(page).getByRole("link", { name: "Edit", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Save changes" }),
      ).toBeVisible();
      const fromEdit = await recordNavigation(
        page,
        () => backLink(page, "Applications").click(),
        rowLink(page, company),
      );
      expectDirectional(fromEdit, "back", motion);
    });

    test(`M3 §7 Motion (${motion}): Edit, New application and the board card go forward; Cancel and the new form's back link go back`, async ({
      page,
    }) => {
      const company = uniqueName("Links");
      await create(page, company);
      await rowLink(page, company).click();
      await expect(detailHeading(page, company)).toBeVisible();

      const save = page.getByRole("button", { name: "Save changes" });
      const edit = await recordNavigation(
        page,
        () =>
          main(page).getByRole("link", { name: "Edit", exact: true }).click(),
        save,
      );
      expectDirectional(edit, "forward", motion);

      const cancelEdit = await recordNavigation(
        page,
        () =>
          main(page).getByRole("link", { name: "Cancel", exact: true }).click(),
        detailHeading(page, company),
      );
      expectDirectional(cancelEdit, "back", motion);

      await backLink(page, "Applications").click();
      await expect(rowLink(page, company)).toBeVisible();
      const saveNew = page.getByRole("button", { name: "Save application" });
      const newFromList = await recordNavigation(
        page,
        () =>
          main(page)
            .getByRole("link", { name: "New application", exact: true })
            .click(),
        saveNew,
      );
      expectDirectional(newFromList, "forward", motion);

      const newBack = await recordNavigation(
        page,
        () => backLink(page, "Applications").click(),
        rowLink(page, company),
      );
      expectDirectional(newBack, "back", motion);

      await main(page)
        .getByRole("link", { name: "New application", exact: true })
        .click();
      await expect(saveNew).toBeVisible();
      const cancelNew = await recordNavigation(
        page,
        () =>
          main(page).getByRole("link", { name: "Cancel", exact: true }).click(),
        rowLink(page, company),
      );
      expectDirectional(cancelNew, "back", motion);

      await views(page)
        .getByRole("link", { name: "Board", exact: true })
        .click();
      await expect(card(page, company)).toBeVisible();
      const newFromBoard = await recordNavigation(
        page,
        () =>
          main(page)
            .getByRole("link", { name: "New application", exact: true })
            .click(),
        saveNew,
      );
      expectDirectional(newFromBoard, "forward", motion);

      await backLink(page, "Applications").click();
      await views(page)
        .getByRole("link", { name: "Board", exact: true })
        .click();
      await expect(card(page, company)).toBeVisible();
      const fromCard = await recordNavigation(
        page,
        () => card(page, company).getByRole("link", { name: company }).click(),
        detailHeading(page, company),
      );
      expectDirectional(fromCard, "forward", motion);
      expect(fromCard, "transitions for one navigation").toHaveLength(1);

      // The not-found page's back link: a deleted application's detail URL.
      const gone = uniqueName("Gone");
      await create(page, gone);
      await rowLink(page, gone).click();
      await expect(detailHeading(page, gone)).toBeVisible();
      const goneUrl = page.url();
      await main(page)
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete permanently", exact: true })
        .click();
      await expect(page).toHaveURL("/");
      await page.goto(goneUrl);
      await expect(backLink(page, "Applications")).toBeVisible();
      const fromNotFound = await recordNavigation(
        page,
        () => backLink(page, "Applications").click(),
        rowLink(page, company),
      );
      // The not-found page has no slide wrapper (A2): only the list slides in.
      expectTypes(fromNotFound, "nav-back");
      if (motion === "reduce") expectFadeOnly(fromNotFound);
      else expectSlide(fromNotFound, "back", { oldSlides: false });
    });

    test(`M4 §7 Motion (${motion}): the header doesn't move during a navigation`, async ({
      page,
    }) => {
      const company = uniqueName("Header");
      await create(page, company);
      const header = page.getByRole("banner");
      await expect(header).toBeVisible();
      const before = await header.screenshot();
      await stretchTransitions(page);

      await resetRecords(page);
      await rowLink(page, company).click();
      const ready = await waitForReady(page);
      await page.waitForFunction(
        (at) => performance.now() >= at + 500,
        ready.readyAt!,
      );
      const during = await header.screenshot();
      expect(
        await header.evaluate((el) => getComputedStyle(el).viewTransitionName),
      ).toBe("site-header");
      const records = await settled(page);
      expectAnimated(records);
      const onHeader = allAnimations(records).filter(
        (a) => a.pseudo.includes("(site-header)") && a.duration > 0,
      );
      expect(onHeader, "animations on the header").toEqual([]);
      expect(during.equals(before), "header unchanged mid-transition").toBe(
        true,
      );
    });

    test(`M5 §7 Motion (${motion}): Views, the Server Action redirects and the empty-state link carry no direction`, async ({
      page,
    }) => {
      const company = uniqueName("Untyped");

      // Create redirect to "/": the list crossfades in (A1).
      await page.goto("/applications/new");
      await page
        .getByRole("textbox", { name: "Company", exact: true })
        .fill(company);
      await page.getByRole("textbox", { name: "Role", exact: true }).fill(ROLE);
      const created = await recordNavigation(
        page,
        () => page.getByRole("button", { name: "Save application" }).click(),
        rowLink(page, company),
      );
      expectCrossfade(created);

      // Views: the first visit to /board, then two pages kept by <Activity>.
      const board = views(page).getByRole("link", {
        name: "Board",
        exact: true,
      });
      const list = views(page).getByRole("link", { name: "List", exact: true });
      expectCrossfade(
        await recordNavigation(page, () => board.click(), card(page, company)),
      );
      expectCrossfade(
        await recordNavigation(
          page,
          () => list.click(),
          rowLink(page, company),
        ),
      );
      expectCrossfade(
        await recordNavigation(page, () => board.click(), card(page, company)),
      );

      // Positive control for the checks below, which allow zero transitions:
      // the recorder sees this forward navigation.
      await list.click();
      await expect(rowLink(page, company)).toBeVisible();
      expectAnimated(
        await recordNavigation(
          page,
          () => rowLink(page, company).click(),
          detailHeading(page, company),
        ),
      );

      // Save redirect to the detail page: no type, nothing moves.
      await main(page).getByRole("link", { name: "Edit", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Role", exact: true })
        .fill(`${ROLE} II`);
      const saved = await recordNavigation(
        page,
        () => page.getByRole("button", { name: "Save changes" }).click(),
        main(page).getByText(`${ROLE} II`).first(),
      );
      expectUntyped(saved);
      expectNoTranslate(saved);

      // Archive it, so the list shows the "all archived" empty state, whose
      // link stays on "/": no type, nothing moves.
      await page.getByRole("button", { name: "Archive", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Unarchive", exact: true }),
      ).toBeVisible();
      await backLink(page, "Applications").click();
      const showArchived = main(page).getByRole("link", {
        name: "Show archived",
        exact: true,
      });
      await expect(showArchived).toBeVisible();
      const emptyState = await recordNavigation(
        page,
        () => showArchived.click(),
        rowLink(page, company),
      );
      expectUntyped(emptyState);
      expectNoTranslate(emptyState);

      // Delete redirect to "/": the list crossfades in (A1).
      await rowLink(page, company).click();
      await expect(detailHeading(page, company)).toBeVisible();
      await main(page)
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      const deleted = await recordNavigation(
        page,
        () =>
          page
            .getByRole("dialog")
            .getByRole("button", { name: "Delete permanently", exact: true })
            .click(),
        pageHeading(page, "Applications"),
      );
      expectCrossfade(deleted);
    });

    test(`M8 US-5 (${motion}): moving a card, by drag or by Move, starts no view transition`, async ({
      page,
    }) => {
      const dragged = uniqueName("Dragged");
      const keyed = uniqueName("Keyed");
      await create(page, dragged);
      await create(page, keyed);
      await views(page)
        .getByRole("link", { name: "Board", exact: true })
        .click();
      await expect(card(page, keyed)).toBeVisible();

      // Positive control: the recorder sees navigations from and to the board.
      expectAnimated(
        await recordNavigation(
          page,
          () => card(page, keyed).getByRole("link", { name: keyed }).click(),
          detailHeading(page, keyed),
        ),
      );
      expectAnimated(
        await recordNavigation(
          page,
          () => backLink(page, "Board").click(),
          card(page, keyed),
        ),
      );

      const status = main(page).getByRole("status");
      await resetRecords(page);
      await card(page, dragged).dragTo(column(page, "Interview"));
      await expect(status).toHaveText(moved(dragged, "Interview"));
      await expect(cardSelect(page, dragged)).toBeEnabled();
      expect(await transitions(page), "transitions after a drop").toEqual([]);

      await resetRecords(page);
      await cardSelect(page, keyed).selectOption({ label: "Applied" });
      await page
        .getByRole("button", { name: `Move ${keyed}, ${ROLE}`, exact: true })
        .click();
      await expect(status).toHaveText(moved(keyed, "Applied"));
      await expect(cardSelect(page, keyed)).toBeEnabled();
      expect(await transitions(page), "transitions after a Move").toEqual([]);
    });

    test(`M11 §7 Motion (${motion}): button presses and list rows transition; reduced motion keeps the instant press`, async ({
      page,
    }) => {
      const company = uniqueName("Micro");
      await create(page, company);

      // name → its transition-duration for that property ("" when absent).
      async function durations(locator: Locator) {
        return locator.evaluate((el) => {
          const style = getComputedStyle(el);
          const props = style.transitionProperty
            .split(",")
            .map((s) => s.trim());
          const times = style.transitionDuration
            .split(",")
            .map((s) => s.trim());
          return Object.fromEntries(
            props.map((p, i) => [p, times[i % times.length]]),
          );
        });
      }

      const ink = main(page).getByRole("link", {
        name: "New application",
        exact: true,
      });
      await rowLink(page, company).click();
      await expect(detailHeading(page, company)).toBeVisible();
      const quiet = main(page).getByRole("link", { name: "Edit", exact: true });
      const danger = page
        .getByRole("dialog", { includeHidden: true })
        .getByRole("button", {
          name: "Delete permanently",
          exact: true,
          includeHidden: true,
        });
      for (const [what, button] of [
        ["button-quiet", quiet],
        ["button-danger", danger],
      ] as const) {
        const d = await durations(button);
        if (motion === "reduce") {
          expect(Object.values(d), `${what}: no transition`).toEqual(
            Object.values(d).map(() => "0s"),
          );
        } else {
          expect(d["translate"], `${what}: translate`).toBe("0.08s");
          expect(d["box-shadow"], `${what}: box-shadow`).toBe("0.08s");
        }
      }

      await backLink(page, "Applications").click();
      await expect(ink).toBeVisible();
      const inkDurations = await durations(ink);
      if (motion === "reduce") {
        expect(
          Object.values(inkDurations),
          "button-ink: no transition",
        ).toEqual(Object.values(inkDurations).map(() => "0s"));
        // The press still moves the button down, instantly. Pressed once the
        // back link's transition has finished: during one, clicks are lost.
        await settled(page);
        const { x, y } = await center(ink);
        await page.mouse.move(x, y);
        await page.mouse.down();
        expect(await ink.evaluate((el) => getComputedStyle(el).translate)).toBe(
          "0px 3px",
        );
        // Leave before releasing, so the press doesn't navigate.
        await page.mouse.move(0, 0);
        await page.mouse.up();
      } else {
        expect(inkDurations["translate"], "button-ink: translate").toBe(
          "0.08s",
        );
        expect(inkDurations["box-shadow"], "button-ink: box-shadow").toBe(
          "0.08s",
        );
      }

      const row = await durations(rowLink(page, company));
      expect(row["background-color"], "list row hover").toBe("0.08s");
      // The focus ring appears at once: only the hover tint transitions.
      expect(Object.keys(row), "list row: no outline transition").not.toContain(
        "outline-color",
      );
    });

    test(`M17 §7 Motion (${motion}): a filter navigation starts no view transition`, async ({
      page,
    }) => {
      const company = uniqueName("Filter");
      await create(page, company);

      // Positive control: the recorder sees a navigation's transition.
      const forward = await recordNavigation(
        page,
        () => rowLink(page, company).click(),
        detailHeading(page, company),
      );
      expectTypes(forward, "nav-forward");
      await backLink(page, "Applications").click();
      await expect(rowLink(page, company)).toBeVisible();
      await settled(page);

      // The row is Wishlist, so filtering by Applied removes it. React starts
      // a transition before it commits, so once the row is gone any
      // transition is already recorded.
      await resetRecords(page);
      await main(page)
        .getByRole("checkbox", { name: "Applied", exact: true })
        .check();
      await main(page)
        .getByRole("button", { name: "Apply", exact: true })
        .click();
      await expect(page).toHaveURL(/[?&]status=applied(&|$)/);
      await expect(rowLink(page, company)).toBeHidden();
      expect(
        await transitions(page),
        "transitions on a filter navigation",
      ).toEqual([]);
    });
  });
}

test.describe("prefers-reduced-motion: reduce", () => {
  test.use({ reducedMotion: "reduce" });

  test("M9 US-5: with reduced motion, dragging a card still moves it", async ({
    page,
  }) => {
    await signUpFreshUser(page);
    const company = uniqueName("ReduceDrag");
    await create(page, company);
    await views(page).getByRole("link", { name: "Board", exact: true }).click();
    await expect(card(page, company)).toBeVisible();

    await card(page, company).dragTo(column(page, "Interview"));
    await expect(main(page).getByRole("status")).toHaveText(
      moved(company, "Interview"),
    );
    await expect(column(page, "Interview").getByRole("listitem")).toHaveCount(
      1,
    );
    await expect(
      column(page, "Interview").getByRole("listitem").first(),
    ).toContainText(company);
  });
});

test("M10 §7 Motion: after a forward navigation, focus lands where it does without motion", async ({
  page,
}) => {
  await signUpFreshUser(page);
  const company = uniqueName("Focus");
  await create(page, company);
  await rowLink(page, company).click();
  await expect(detailHeading(page, company)).toBeVisible();
  // Measured on the branch before motion (2026-11-20): Next leaves focus on
  // the body after a client-side navigation.
  expect(
    await page.evaluate(() => document.activeElement === document.body),
    "focus on the body",
  ).toBe(true);
});

for (const setting of ["no-preference", "reduce", "forced-colors"] as const) {
  test(`M12 §7 Motion (${setting}): the account menu fades in when it opens`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    if (setting === "forced-colors") {
      await page.emulateMedia({ forcedColors: "active" });
    } else {
      await page.emulateMedia({ reducedMotion: setting });
    }
    await signUpFreshUser(page);
    const trigger = page.getByRole("button", {
      name: "Account menu",
      exact: true,
    });
    await expect(trigger).toBeVisible();

    // Opens and reads in one task: the transition from @starting-style
    // exists from the first style update after showing the popover.
    const running = await trigger.evaluate((button) => {
      (button as HTMLButtonElement).click();
      const menu = document.getElementById("account-menu")!;
      return menu
        .getAnimations()
        .map((a) => (a as CSSTransition).transitionProperty ?? "");
    });
    await expect(page.locator("#account-menu")).toBeVisible();
    expect(running, "transitions when the menu opens").toContain("opacity");
  });
}

test("M13 §7 Motion: without JavaScript, nothing but the skeleton pulse animates on load", async ({
  page,
  browser,
}) => {
  await signUpFreshUser(page);
  const company = uniqueName("Load");
  await create(page, company);
  await rowLink(page, company).click();
  await expect(detailHeading(page, company)).toBeVisible();
  const detail = new URL(page.url()).pathname;

  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  try {
    const plain = await noJs.newPage();
    for (const path of [
      "/",
      "/board",
      detail,
      "/applications/new",
      `${detail}/edit`,
    ]) {
      await plain.goto(path);
      const names = await plain.evaluate(() =>
        document
          .getAnimations()
          .map((a) => (a as CSSAnimation).animationName ?? "transition"),
      );
      expect(
        names.filter((name) => name !== "pulse"),
        `animations on load at ${path}`,
      ).toEqual([]);
    }
  } finally {
    await noJs.close();
  }
});

test.describe("overlay", () => {
  test.beforeEach(async ({ page }) => {
    await recordViewTransitions(page);
    await signUpFreshUser(page);
  });

  test("M15 §7 Motion: while a navigation transition runs, clicks are lost; after it they land", async ({
    page,
  }) => {
    const company = uniqueName("Overlay");
    await create(page, company);
    await stretchTransitions(page);

    await resetRecords(page);
    await rowLink(page, company).click();
    const ready = await waitForReady(page);
    // The detail page's back link and the header exist during the
    // navigation transition (the details only come after it).
    const back = await center(backLink(page, "Applications"));
    const logo = await center(
      page.getByRole("banner").getByText("Job Tracker", { exact: true }),
    );
    await page.mouse.click(back.x, back.y);
    await page.mouse.click(logo.x, logo.y);

    // From `ready` on: the row click that started the navigation came before.
    const during = (await clicks(page)).filter((c) => c.at >= ready.readyAt!);
    const [running] = await transitions(page);
    expect(running.finishedAt, "clicked while the transition ran").toBeNull();
    expect(during.length, "clicks recorded during the transition").toBe(2);
    expect(
      during.filter((c) => c.link === "Applications"),
      "back link clicks during the transition",
    ).toEqual([]);
    expect(
      during.filter((c) => c.inSiteHeader),
      "header clicks during the transition",
    ).toEqual([]);

    // Positive control: once the transition has finished, the same clicks
    // land in the header and on the back link.
    await settled(page);
    await resetRecords(page);
    await page.mouse.click(logo.x, logo.y);
    await page.mouse.click(back.x, back.y);
    const after = await clicks(page);
    expect(
      after.filter((c) => c.inSiteHeader).length,
      "header clicks after the transition",
    ).toBe(1);
    expect(
      after.filter((c) => c.link === "Applications").length,
      "back link clicks after the transition",
    ).toBe(1);
  });

  test("M16 §7 Motion: while a navigation transition runs, keyboard input isn't affected", async ({
    page,
  }) => {
    const company = uniqueName("Keys");
    await create(page, company);
    await stretchTransitions(page);

    await resetRecords(page);
    await rowLink(page, company).click();
    await waitForReady(page);

    // Tab moves focus: after the click, focus is on the body (M10).
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => document.activeElement === document.body),
      "focus moved off the body",
    ).toBe(false);
    // Tab on to the detail page's back link (the header's Sign out first).
    const back = backLink(page, "Applications");
    for (let i = 0; i < 5; i++) {
      if (await back.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(back, "back link focused by Tab").toBeFocused();
    const [running] = await transitions(page);
    expect(running.finishedAt, "tabbed while the transition ran").toBeNull();

    // Enter on the focused link navigates.
    await page.keyboard.press("Enter");
    const [afterEnter] = await transitions(page);
    expect(
      afterEnter.finishedAt,
      "Enter pressed while the transition ran",
    ).toBeNull();
    await expect(page, "Enter on the back link navigates").toHaveURL("/");
    await expect(rowLink(page, company)).toBeVisible();
  });
});
