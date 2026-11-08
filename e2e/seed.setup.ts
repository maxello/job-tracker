import { expect, test as setup } from "@playwright/test";
import { USER_A } from "./users";

// Signs up through the real form, so the password is hashed by Better Auth.
setup(`sign up ${USER_A.email}`, async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Name", { exact: true }).fill(USER_A.name);
  await page.getByLabel("Email", { exact: true }).fill(USER_A.email);
  await page.getByLabel("Password", { exact: true }).fill(USER_A.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
});
