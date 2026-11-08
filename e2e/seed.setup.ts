import { expect, test as setup } from "@playwright/test";
import { USER_A, USER_B } from "./users";

// Signs up through the real form, so passwords are hashed by Better Auth.
for (const user of [USER_A, USER_B]) {
  setup(`sign up ${user.email}`, async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Name", { exact: true }).fill(user.name);
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL("/");
  });
}
