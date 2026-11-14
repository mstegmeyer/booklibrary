import { expect, setupAdmin, test } from "../fixtures.ts";

test("the tab bar replaces the sidebar at phone size", async ({
  page,
  isMobile,
}) => {
  await setupAdmin(page);
  await page.goto("/library");
  const nav = page.getByRole("navigation");
  const addBook = nav.getByRole("link", { name: "Add book" });

  if (isMobile) {
    await expect(addBook).toBeVisible();
    await expect(nav.getByRole("link", { name: "Locations" })).toHaveCount(0);
    await expect(nav.getByText("Add book")).toHaveCount(0);
  } else {
    await expect(nav.getByRole("link", { name: "Locations" })).toBeVisible();
    await expect(nav.getByText("Add book")).toBeVisible();
  }

  await addBook.click();
  await expect(page).toHaveURL(/\/add$/);
});
