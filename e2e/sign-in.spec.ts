import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { USER_A } from "./users";

test("sign-in with a seeded user lands on the list", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(USER_A.email);
  await page.getByLabel("Password", { exact: true }).fill(USER_A.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "Applications" }),
  ).toBeVisible();
  await expect(page.getByText("No applications yet.")).toBeVisible();
});

// The email limit (5 per 15 minutes) is never raised in e2e; the IP limit is
// (E2E_AUTH_IP_LIMIT in playwright.config.ts), so only the email counter is hit.
test("US-0: the 6th sign-in attempt for one email shows the rate limit", async ({
  page,
}) => {
  const email = `e2e-limit-${randomUUID()}@example.com`;
  // Scoped to main: Next's route announcer is also an alert.
  const alert = page.getByRole("main").getByRole("alert");

  await page.goto("/sign-in");
  for (let attempt = 1; attempt <= 6; attempt++) {
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    // Waits for this attempt's response, so the same alert text left from
    // the previous attempt can't pass for this one.
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/sign-in",
      ),
      page.getByRole("button", { name: "Sign in", exact: true }).click(),
    ]);
    if (attempt <= 5) {
      await expect(alert, `attempt ${attempt}`).toHaveText(
        "Invalid email or password.",
      );
    }
  }

  await expect(alert).toHaveText("Too many attempts. Try again in 15 minutes.");
});
