import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

// A name no other test uses, so tests don't depend on order or on each other.
export function uniqueName(prefix: string) {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

// Signs up a new user through the real form and returns signed in on "/".
// Tests that create data use their own user, so the shared users stay as the
// other specs expect them.
export async function signUpFreshUser(page: Page) {
  const id = randomUUID();
  const user = {
    name: `E2E ${id.slice(0, 8)}`,
    email: `e2e-${id}@example.com`,
    password: `e2e-password-${id}`,
  };

  await page.goto("/sign-up");
  await page.getByLabel("Name", { exact: true }).fill(user.name);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");

  return user;
}
