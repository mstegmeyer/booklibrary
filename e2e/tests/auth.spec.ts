import {
  admin,
  expect,
  openAccountMenu,
  setupAdmin,
  test,
} from "../fixtures.ts";

test("signing out and in again", async ({ page }) => {
  await setupAdmin(page);
  await page.goto("/library");

  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/library");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The email or password is incorrect.",
  );

  await page.getByLabel("Password").fill(admin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
});
