import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// The detail and form skeletons keep the loaded page's boxes (SPEC.md
// decision log, 2026-11-19), so nothing moves when the data arrives. Without
// JavaScript the streamed content never replaces the fallback, so the
// skeleton stays on screen to be measured through its data-skeleton hooks;
// the hidden streamed content has none. Same technique as the skeleton test
// in e2e/filter-layout.spec.ts.

type Key = "x" | "y" | "width" | "height";
const ALL: readonly Key[] = ["x", "y", "width", "height"];
// The badge's width is the status label, which is data.
const NO_WIDTH: readonly Key[] = ["x", "y", "height"];

// [what, loaded locator, skeleton hook, compared keys]
type Pair = readonly [string, Locator, string, readonly Key[]];

const WIDTHS = [360, 768, 1280];

// Opens `path` in a JavaScript-off context with the loaded page's session and
// compares every pair at every width, within 1px. Every element is checked on
// both pages once, so a missing one is reported once and skipped, instead of
// waiting at every width. `beforeEach` runs on the loaded page at each width
// before it's measured.
async function compareWithSkeleton(
  page: Page,
  browser: Browser,
  path: string,
  pairs: readonly Pair[],
  beforeEach?: (width: number) => Promise<void>,
) {
  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  try {
    const skeleton = await noJs.newPage();
    await skeleton.goto(path);
    const present = [];
    for (const [what, loaded, hook, keys] of pairs) {
      const fake = skeleton.locator(`[data-skeleton="${hook}"]`);
      await expect.soft(loaded, `${what}: loaded`).toBeVisible();
      // No waiting: without JavaScript the skeleton is final once goto has
      // loaded the document.
      expect.soft(await fake.isVisible(), `${what}: skeleton`).toBe(true);
      if ((await loaded.isVisible()) && (await fake.isVisible())) {
        present.push({ what, loaded, fake, keys });
      }
    }

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await skeleton.setViewportSize({ width, height: 900 });
      // After a client-side navigation Next can keep the previous scroll;
      // the skeleton (no JS) is always at the top.
      await page.evaluate(() => window.scrollTo(0, 0));
      await beforeEach?.(width);
      for (const { what, loaded, fake, keys } of present) {
        const real = await loaded.boundingBox();
        const shown = await fake.boundingBox();
        if (!real || !shown) throw new Error(`${what} has no bounding box`);
        for (const key of keys) {
          expect
            .soft(
              Math.abs(shown[key] - real[key]),
              `${width}px ${what} ${key}: skeleton ${shown[key]} vs loaded ${real[key]}`,
            )
            .toBeLessThanOrEqual(1);
        }
      }
    }
  } finally {
    await noJs.close();
  }
}

// The detail page's eight fields: [label, hook slug].
const FIELDS = [
  ["Job URL", "url"],
  ["Location", "location"],
  ["Level", "level"],
  ["Stack", "stack"],
  ["Salary (annual gross)", "salary"],
  ["Notes", "notes"],
  ["Created", "created"],
  ["Last updated", "updated"],
] as const;

// The form's ten fields: [label, role, hook slug]. Currency has a datalist,
// which makes it a combobox.
const FORM_FIELDS = [
  ["Company", "textbox", "company"],
  ["Role", "textbox", "role"],
  ["Job URL", "textbox", "url"],
  ["Location", "textbox", "location"],
  ["Level", "textbox", "level"],
  ["Stack", "textbox", "stack"],
  ["Min", "textbox", "salary-min"],
  ["Max", "textbox", "salary-max"],
  ["Currency", "combobox", "currency"],
  ["Notes", "textbox", "notes"],
] as const;

const exactText = (text: string) =>
  new RegExp(`^${text.replace(/[()]/g, "\\$&")}$`);

test("US-4: the detail skeleton keeps the loaded page's boxes", async ({
  page,
  browser,
}) => {
  await signUpFreshUser(page);
  // One-line data at 360: a short company and role, short field values, no
  // URL and no notes. The status stays Wishlist, the width the skeleton's
  // select is sized for.
  const company = uniqueName("Co");
  await page
    .getByRole("link", { name: "New application", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill(company);
  await page.getByRole("textbox", { name: "Role", exact: true }).fill("Dev");
  await page
    .getByRole("textbox", { name: "Location", exact: true })
    .fill("Kyiv");
  await page
    .getByRole("textbox", { name: "Level", exact: true })
    .fill("Senior");
  await page.getByRole("textbox", { name: "Stack", exact: true }).fill("React");
  await page.getByRole("textbox", { name: "Min", exact: true }).fill("100000");
  await page
    .getByRole("combobox", { name: "Currency", exact: true })
    .fill("USD");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("link", { name: company }).click();
  await expect(page).toHaveURL(/\/applications\/[^/]+$/);

  const main = page.getByRole("main");
  const header = main.locator("header");
  const statusSelect = main.getByRole("combobox", {
    name: "Status",
    exact: true,
  });
  const history = main.getByRole("region", {
    name: "Status history",
    exact: true,
  });
  const term = (label: string) =>
    main.locator("dt").filter({ hasText: exactText(label) });

  const pairs: Pair[] = [
    ["header card", header, "header", ALL],
    ["company", main.getByRole("heading", { level: 1 }), "company", ALL],
    ["role", header.getByText("Dev", { exact: true }), "role", ALL],
    ["badge", header.getByText("Wishlist", { exact: true }), "badge", NO_WIDTH],
    [
      "Edit",
      main.getByRole("link", { name: "Edit", exact: true }),
      "edit",
      ALL,
    ],
    [
      "Archive",
      main.getByRole("button", { name: "Archive", exact: true }),
      "archive",
      ALL,
    ],
    [
      "Delete",
      main.getByRole("button", { name: "Delete", exact: true }),
      "delete",
      ALL,
    ],
    [
      "status form",
      // `has` resolves inside the form, so the select is rooted at the page.
      main.locator("form").filter({
        has: page.getByRole("combobox", { name: "Status", exact: true }),
      }),
      "status-form",
      ALL,
    ],
    [
      "status label",
      main.locator("label").filter({ hasText: /^Status$/ }),
      "status-label",
      ALL,
    ],
    ["status select", statusSelect, "status-select", ALL],
    [
      "Update status",
      main.getByRole("button", { name: "Update status", exact: true }),
      "update-status",
      ALL,
    ],
    ["dl", main.locator("dl"), "dl", ALL],
    ...FIELDS.flatMap(
      ([label, slug]) =>
        [
          [`${label} label`, term(label), `${slug}-label`, ALL],
          [
            `${label} value`,
            term(label).locator("xpath=following-sibling::dd[1]"),
            `${slug}-value`,
            ALL,
          ],
        ] as const,
    ),
    [
      "history heading",
      history.getByRole("heading", { name: "Status history", exact: true }),
      "history-heading",
      ALL,
    ],
    ["history list", history.getByRole("list"), "history", ALL],
    ["history row", history.getByRole("listitem").first(), "history-row", ALL],
  ];

  const path = new URL(page.url()).pathname;
  await compareWithSkeleton(page, browser, path, pairs, async (width) => {
    if (width !== 360) return;
    // Precondition: the test data is one line at the narrowest width (the
    // h1 is 32px there), or the comparison measures the data, not the
    // skeleton.
    const h1 = await main.getByRole("heading", { level: 1 }).boundingBox();
    expect(h1?.height, "company is one line at 360px").toBeLessThanOrEqual(33);
  });
});

test("US-1: the new-form skeleton keeps the loaded form's boxes", async ({
  page,
  browser,
}) => {
  await signUpFreshUser(page);
  await page
    .getByRole("link", { name: "New application", exact: true })
    .click();
  await expect(page).toHaveURL("/applications/new");

  const main = page.getByRole("main");
  const pairs: Pair[] = [
    ["form card", main.locator("form"), "form", ALL],
    ["required note", main.getByText(/^Fields marked/), "required-note", ALL],
    ...FORM_FIELDS.flatMap(
      ([label, role, slug]) =>
        [
          [
            `${label} label`,
            main.locator("label").filter({
              hasText: new RegExp(`^${label}( \\*)?$`),
            }),
            `label-${slug}`,
            ALL,
          ],
          [
            `${label} control`,
            main.getByRole(role, { name: label, exact: true }),
            `control-${slug}`,
            ALL,
          ],
        ] as const,
    ),
    [
      "Stack hint",
      main.getByText("Comma-separated, e.g. React, Node", { exact: true }),
      "hint",
      ALL,
    ],
    ["Salary legend", main.locator("legend"), "legend", ALL],
    [
      "Save application",
      main.getByRole("button", { name: "Save application", exact: true }),
      "save",
      ALL,
    ],
    [
      "Cancel",
      main.getByRole("link", { name: "Cancel", exact: true }),
      "cancel",
      ALL,
    ],
  ];

  await compareWithSkeleton(page, browser, "/applications/new", pairs);
});
