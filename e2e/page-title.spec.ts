import { expect, test } from "@playwright/test";
import { signUpFreshUser } from "./fresh-user";

// US-2: the list has its own page title, like its h1 (SPEC decision log,
// 2026-11-20, "focus after navigation").
test("US-2: the list's page title is Applications", async ({ page }) => {
  await signUpFreshUser(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Applications", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Applications");
});
