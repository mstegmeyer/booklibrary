import { expect, openAccountMenu, setupAdmin, test } from "../fixtures.ts";

test("switching to German changes the navigation labels", async ({ page }) => {
  await setupAdmin(page);
  await page.goto("/library");
  const nav = page.getByRole("navigation");
  await expect(
    nav.getByRole("link", { name: "Library", exact: true }),
  ).toBeVisible();

  await openAccountMenu(page);
  await page.getByRole("menuitemradio", { name: "Deutsch" }).click();

  for (const label of ["Bibliothek", "Lesen", "Ausleihen", "Statistik"]) {
    await expect(
      nav.getByRole("link", { name: label, exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Bibliothek" })).toBeVisible();

  await page.reload();
  await expect(
    nav.getByRole("link", { name: "Bibliothek", exact: true }),
  ).toBeVisible();
});
