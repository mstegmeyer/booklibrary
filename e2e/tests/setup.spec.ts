import { admin, expect, test } from "../fixtures.ts";

test("a fresh instance asks for setup and then opens the empty library", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(
    page.getByRole("heading", { name: "Set up your library" }),
  ).toBeVisible();

  await page.getByLabel("Name").fill(admin.name);
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
  await expect(page.getByText("Nothing here yet.")).toBeVisible();
});
