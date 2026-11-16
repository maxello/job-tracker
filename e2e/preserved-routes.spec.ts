import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// Cache Components keeps up to 3 previous routes per route level in the DOM,
// hidden with <Activity> (display: none). Ids must stay unique across them, or
// labels and ARIA references attach to the wrong or to several elements
// (issue #26). Every navigation here is client-side: links and buttons only,
// except the first page load.

// Every id in the document, visible or hidden, appears once.
async function expectUniqueIds(page: Page) {
  const duplicates = await page.evaluate(() => {
    const counts = new Map<string, number>();
    for (const element of document.querySelectorAll("[id]")) {
      counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    }
    return [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  });
  expect.soft(duplicates, "duplicate ids").toEqual([]);
}

// From "/": creates an application through the "New application" link and
// returns to the list.
async function createFromList(page: Page, company: string, role: string) {
  await page
    .getByRole("link", { name: "New application", exact: true })
    .click();
  await expect(page).toHaveURL("/applications/new");
  await page
    .getByRole("textbox", { name: "Company", exact: true })
    .fill(company);
  await page.getByRole("textbox", { name: "Role", exact: true }).fill(role);
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL("/");
}

async function openFromList(page: Page, company: string) {
  await page.getByRole("link", { name: company }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
}

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signUpFreshUser(page);
  });

  test("#26: the edit form reached by links after creating an application has one name per field", async ({
    page,
  }) => {
    const company = uniqueName("Acme");
    await createFromList(page, company, "Frontend Engineer");
    await openFromList(page, company);

    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page).toHaveURL(/\/applications\/[^/]+\/edit$/);

    await expect(
      page.getByRole("button", { name: "Save changes" }),
    ).toBeVisible();

    // Soft with a short timeout (the form is already rendered), so one run
    // reports every field. Currency has a datalist, which makes it a combobox.
    for (const [role, name] of [
      ["textbox", "Company"],
      ["textbox", "Role"],
      ["textbox", "Job URL"],
      ["textbox", "Location"],
      ["textbox", "Level"],
      ["textbox", "Stack"],
      ["textbox", "Min"],
      ["textbox", "Max"],
      ["combobox", "Currency"],
      ["textbox", "Notes"],
    ] as const) {
      await expect
        .soft(page.getByRole(role, { name, exact: true }), `${role} "${name}"`)
        .toBeVisible({ timeout: 1000 });
    }

    // The label focuses the visible field, not a hidden form's copy.
    await page
      .getByRole("main")
      .locator("label")
      .filter({ visible: true, hasText: /^Role/ })
      .click();
    await expect
      .soft(page.getByRole("textbox", { name: "Role", exact: true }))
      .toBeFocused();

    await expectUniqueIds(page);
  });

  test("#26: the second of two detail pages reached by links keeps its own status label and delete description", async ({
    page,
  }) => {
    const first = { company: uniqueName("Acme"), role: "Frontend Engineer" };
    const second = { company: uniqueName("Globex"), role: "Backend Engineer" };
    await createFromList(page, first.company, first.role);
    await createFromList(page, second.company, second.role);

    await openFromList(page, first.company);
    await page.getByRole("link", { name: "Applications", exact: true }).click();
    await expect(page).toHaveURL("/");
    await openFromList(page, second.company);

    await expect
      .soft(page.getByRole("combobox", { name: "Status", exact: true }))
      .toBeVisible();
    await expect
      .soft(page.getByRole("region", { name: "Status history", exact: true }))
      .toBeVisible();

    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveAccessibleName("Delete this application?");
    await expect(dialog).toHaveAccessibleDescription(
      new RegExp(`The application for ${second.role} at ${second.company} `),
    );
    await expect(dialog).not.toHaveAccessibleDescription(
      new RegExp(first.company),
    );

    await expectUniqueIds(page);

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });
});

test("#26: the sign-up form reached by a link from sign-in has one name per field", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await page.getByRole("main").getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/sign-up");

  for (const name of ["Name", "Email", "Password"]) {
    await expect
      .soft(
        page.getByRole("textbox", { name, exact: true }),
        `textbox "${name}"`,
      )
      .toBeVisible();
  }

  await expectUniqueIds(page);
});
