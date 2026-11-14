import { expect, openAccountMenu, setupAdmin, test } from "../fixtures.ts";

test("the admin adds a member who can sign in but not manage users", async ({
  page,
}) => {
  await setupAdmin(page);
  await page.goto("/library");
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Users" }).click();
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

  await page.getByRole("button", { name: "Add user" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a user" });
  await dialog.getByLabel("Name").fill("Ben");
  await dialog.getByLabel("Email").fill("ben@example.com");
  await dialog.getByLabel("Password").fill("password123");
  await dialog.getByRole("button", { name: "Add user" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("ben@example.com")).toBeVisible();

  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill("ben@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/library$/);

  await openAccountMenu(page);
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Users" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/users");
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
});

test("the admin resets a member's password", async ({ page }) => {
  await setupAdmin(page);
  await page.request.post("/api/v1/users", {
    data: { name: "Ben", email: "ben@example.com", password: "password123" },
  });
  await page.goto("/users");

  await page
    .getByRole("listitem")
    .filter({ hasText: "ben@example.com" })
    .getByRole("button", { name: "Reset password" })
    .click();
  const dialog = page.getByRole("dialog", { name: "New password for Ben" });
  await dialog.getByLabel("New password").fill("another-password");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "The password for Ben was changed.",
  );
});
