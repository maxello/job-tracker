import { expect, test, type Page } from "@playwright/test";
import { signUpFreshUser } from "./fresh-user";

// The production cookie name (Secure cookies in `next start`). The session read
// only looks at this name, so an unprefixed cookie would never be checked.
const SESSION_COOKIE = "__Secure-better-auth.session_token";

async function expectSignInForm(page: Page) {
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
}

async function expectSignUpForm(page: Page) {
  await expect(page.getByRole("heading", { name: "Sign up" })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeVisible();
}

async function expectApplicationsList(page: Page) {
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "Applications" }),
  ).toBeVisible();
}

test("a signed-in user who opens /sign-in lands on /", async ({ page }) => {
  await signUpFreshUser(page);

  await page.goto("/sign-in");
  await expectApplicationsList(page);
});

test("a signed-in user who opens /sign-up lands on /", async ({ page }) => {
  await signUpFreshUser(page);

  await page.goto("/sign-up");
  await expectApplicationsList(page);
});

test("a stale session cookie shows the sign-in form without a loop, and / still redirects to /sign-in", async ({
  context,
  page,
}) => {
  // Not a signed token, so the session read finds no session, while the proxy
  // (which only checks that the cookie exists) lets it through.
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: "stale-not-a-session",
      domain: "localhost",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  // Without this, a dropped cookie would turn the test into a no-cookie visit.
  const cookies = await context.cookies();
  expect(cookies.map((cookie) => cookie.name)).toContain(SESSION_COOKIE);

  const signIn = await page.goto("/sign-in");
  expect(signIn?.status()).toBe(200);
  expect(signIn?.request().redirectedFrom()).toBeNull();
  await expectSignInForm(page);
  await expect(page).toHaveURL("/sign-in");

  // 200, not the proxy's 307: the cookie got through, and the redirect comes
  // from the session check inside <Suspense>.
  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  expect(home?.request().redirectedFrom()).toBeNull();
  await expect(page).toHaveURL("/sign-in");
  await expectSignInForm(page);
});

test("a visitor with no cookie sees the sign-in and sign-up forms", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expectSignInForm(page);
  await expect(page).toHaveURL("/sign-in");

  await page.goto("/sign-up");
  await expectSignUpForm(page);
  await expect(page).toHaveURL("/sign-up");
});
