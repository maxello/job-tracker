import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser, uniqueName } from "./fresh-user";

// Like signUpFreshUser, but the email has no hyphens: a hyphen is a line-break
// opportunity, so only an email without one proves the menu wraps it.
async function signUpWithUnbreakableEmail(page: Page) {
  const id = randomUUID().replaceAll("-", "");
  const email = `e2e${id}@example.com`;

  await page.goto("/sign-up");
  await page.getByLabel("Name", { exact: true }).fill(`E2E ${id.slice(0, 8)}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(`e2e-password-${id}`);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");

  return { email };
}

// Header locators. Hidden elements are excluded from getByRole by default, so
// `signOut` counts only the visible Sign out button; the trigger includes
// hidden ones so the desktop test can check it exists but is hidden.
function header(page: Page, email: string) {
  const banner = page.getByRole("banner");
  return {
    banner,
    trigger: banner.getByRole("button", {
      name: "Account menu",
      exact: true,
      includeHidden: true,
    }),
    // The popover has no role.
    menu: page.locator("#account-menu"),
    signOut: banner.getByRole("button", { name: "Sign out", exact: true }),
    visibleEmail: banner.getByText(email).filter({ visible: true }),
  };
}

test.describe("below sm (360px)", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("account menu below sm: open, email, sign out", async ({ page }) => {
    const user = await signUpWithUnbreakableEmail(page);
    const { banner, trigger, menu, signOut, visibleEmail } = header(
      page,
      user.email,
    );

    await expect(trigger).toBeVisible();
    await expect(visibleEmail).toHaveCount(0);
    await expect(signOut).toHaveCount(0);

    await trigger.click();
    await expect(menu).toBeVisible();

    const menuEmail = menu.getByText(user.email);
    await expect(menuEmail).toBeVisible();
    await expect(signOut).toHaveCount(1);

    // The menu sits inside the 16px gutters, and the long email wraps inside
    // it. Unwrapped, it overflows to the left (items-end), where nothing
    // scrolls, so compare boxes rather than scrollWidth.
    const box = await menu.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(16);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360 - 16);
    const emailBox = await menuEmail.boundingBox();
    expect(emailBox).not.toBeNull();
    expect(emailBox!.x).toBeGreaterThanOrEqual(box!.x);
    expect(emailBox!.x + emailBox!.width).toBeLessThanOrEqual(
      box!.x + box!.width,
    );

    await menu.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL("/sign-in");
    await expect(
      banner.getByRole("link", { name: "Sign in", exact: true }),
    ).toBeVisible();
  });

  test("account menu below sm: keyboard and dismiss", async ({ page }) => {
    const user = await signUpFreshUser(page);
    const { trigger, menu } = header(page, user.email);
    const menuSignOut = menu.getByRole("button", {
      name: "Sign out",
      exact: true,
    });

    // A full load, so the menu is the server-rendered HTML: after sign-up's
    // client-side redirect React builds it in the browser, where attributes
    // such as autofocus aren't set and a mistake there would go unnoticed.
    await page.goto("/");

    // Opening doesn't move focus; the menu comes next in tab order.
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(menuSignOut).toBeFocused();

    // Esc closes it and returns focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    // A click outside closes it (light dismiss).
    await trigger.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(5, 790);
    await expect(menu).toBeHidden();
  });

  test("#26: the fixed account-menu id stays unique across client-side navigation", async ({
    page,
  }) => {
    const user = await signUpFreshUser(page);
    const { trigger, menu } = header(page, user.email);
    const menuIds = page.locator('[id="account-menu"]');
    const company = uniqueName("Acme");
    const newApplication = page.getByRole("link", {
      name: "New application",
      exact: true,
    });

    await newApplication.click();
    await expect(page).toHaveURL("/applications/new");
    await page
      .getByRole("textbox", { name: "Company", exact: true })
      .fill(company);
    await page
      .getByRole("textbox", { name: "Role", exact: true })
      .fill("Frontend Engineer");
    await page.getByRole("button", { name: "Save application" }).click();
    await expect(page).toHaveURL("/");

    await page.getByRole("link", { name: company }).click();
    await expect(page).toHaveURL(/\/applications\/[^/]+$/);
    await expect(menuIds).toHaveCount(1);

    await page
      .getByRole("link", { name: "← Applications", exact: true })
      .click();
    await expect(page).toHaveURL("/");
    await newApplication.click();
    await expect(page).toHaveURL("/applications/new");
    await page.goBack();
    await expect(page).toHaveURL("/");
    await expect(menuIds).toHaveCount(1);

    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(menu.getByText(user.email)).toBeVisible();
  });
});

test.describe("from sm (1280px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("from sm the header is inline", async ({ page }) => {
    const user = await signUpFreshUser(page);
    const { trigger, signOut, visibleEmail } = header(page, user.email);

    await expect(visibleEmail).toBeVisible();
    await expect(signOut).toHaveCount(1);
    await expect(trigger).toBeHidden();
  });
});
