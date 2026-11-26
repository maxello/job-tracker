import { expect, test } from "@playwright/test";
import { USER_A } from "./users";

test("sign-in with a seeded user lands on the list", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(USER_A.email);
  await page.getByLabel("Password", { exact: true }).fill(USER_A.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "Applications (red proof)" }),
  ).toBeVisible();
  await expect(page.getByText("No applications yet.")).toBeVisible();
});
