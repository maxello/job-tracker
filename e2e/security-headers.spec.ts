import {
  expect,
  test,
  type APIResponse,
  type Response,
} from "@playwright/test";
import { signUpFreshUser } from "./fresh-user";

// Literal values from the decision log (2026-11-27), not imported from
// next.config.ts, so a mistake in the config's string fails here.
const CSP =
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

// Runs after each test's status checks, so a red run still measures them.
function expectSecurityHeaders(response: APIResponse | Response) {
  const headers = response.headers();
  expect(headers["content-security-policy"], "CSP").toBe(CSP);
  expect(headers["x-content-type-options"], "nosniff").toBe("nosniff");
}

test("M7 security headers: signed-out page", async ({ request }) => {
  const response = await request.get("/sign-in");

  expect(response.status()).toBe(200);
  expectSecurityHeaders(response);
});

test("M7 security headers: proxy redirect", async ({ request }) => {
  const response = await request.get("/", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toMatch(/\/sign-in$/);
  expectSecurityHeaders(response);
});

test("M7 security headers: static file", async ({ page, request }) => {
  await page.goto("/sign-in");
  const src = await page
    .locator('script[src^="/_next/static/"]')
    .first()
    .getAttribute("src");
  if (!src) throw new Error("no /_next/static/ script on /sign-in");

  const response = await request.get(src);

  expect(response.status()).toBe(200);
  expectSecurityHeaders(response);
});

test("M7 security headers: public/ file", async ({ request }) => {
  const response = await request.get("/next.svg");

  expect(response.status()).toBe(200);
  expectSecurityHeaders(response);
});

test.describe("signed in", () => {
  test.beforeEach(async ({ page }) => {
    await signUpFreshUser(page);
  });

  test("M7 security headers: signed-in page", async ({ page }) => {
    const response = await page.goto("/");
    if (!response) throw new Error("no response for /");

    expect(response.status()).toBe(200);
    // `/` is 200 without a session too (the redirect is inside <Suspense>).
    await expect(
      page
        .getByRole("banner")
        .getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();
    expectSecurityHeaders(response);
  });

  test("M7 security headers: 404", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    if (!response) throw new Error("no response for /no-such-page");

    expect(response.status()).toBe(404);
    expectSecurityHeaders(response);
  });
});
