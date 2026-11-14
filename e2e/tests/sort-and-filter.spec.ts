import type { Page } from "@playwright/test";
import { createBook } from "../catalogue.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";
import { setStatus } from "../reading.ts";

test.skip(({ isMobile }) => !isMobile, "the sheet is the phone's");

async function seedBooks(page: Page) {
  await setupAdmin(page);
  const books = [];
  for (const title of ["Dune", "Atlas", "Middlemarch"])
    books.push(await createBook(page, { title, copy: {} }));
  return books;
}

const openSheet = async (page: Page) => {
  await page.getByRole("button", { name: "Sort and filter" }).click();
  return page.getByRole("dialog", { name: "Sort and filter" });
};

test("sorting by title in the sheet survives a reload", async ({ page }) => {
  await seedBooks(page);
  await page.goto("/library");
  const books = page.getByRole("main").getByRole("listitem");
  await expect(books).toContainText(["Middlemarch", "Atlas", "Dune"]);

  const sheet = await openSheet(page);
  const sortBy = sheet.getByRole("radiogroup", { name: "Sort by" });
  await expect(
    sortBy.getByRole("radio", { name: "Recently added" }),
  ).toBeChecked();
  await sortBy.getByRole("radio", { name: "Title" }).click();
  await expect(page).toHaveURL(/sort=title/);
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(sheet).toBeHidden();
  await expect(books).toContainText(["Atlas", "Dune", "Middlemarch"]);

  await page.reload();
  await expect(books).toContainText(["Atlas", "Dune", "Middlemarch"]);
  await openSheet(page);
  await expect(sortBy.getByRole("radio", { name: "Title" })).toBeChecked();
});

test("a reading status narrows the list and Reset clears it", async ({
  page,
}) => {
  const [dune] = await seedBooks(page);
  await setStatus(page.request, dune?.id ?? "", "reading");
  await page.goto("/library");
  const books = page.getByRole("main").getByRole("listitem");
  const button = page.getByRole("button", { name: "Sort and filter" });
  const marker = "Sorting or filters are on";
  await expect(books).toHaveCount(3);
  await expect(button).not.toHaveAccessibleDescription(marker);

  const sheet = await openSheet(page);
  const reading = sheet.getByRole("radiogroup", { name: "My reading" });
  await reading.getByRole("radio", { name: "Reading", exact: true }).click();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(books).toHaveCount(1);
  await expect(books).toContainText(["Dune"]);
  await expect(button).toHaveAccessibleDescription(marker);

  const lentOut = page.getByRole("button", { name: "Lent out" });
  await lentOut.click();
  await page.getByRole("searchbox").fill("Dune");
  await expect(page).toHaveURL(/q=Dune/);
  await openSheet(page);
  await expect(
    sheet
      .getByRole("radiogroup", { name: "Availability" })
      .getByRole("radio", { name: "Lent out" }),
  ).toBeChecked();

  await sheet.getByRole("button", { name: "Reset" }).click();
  await expect(reading.getByRole("radio", { name: "Any" })).toBeChecked();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(lentOut).toHaveAttribute("aria-pressed", "false");
  await expect(button).not.toHaveAccessibleDescription(marker);
  await expect(page.getByRole("searchbox")).toHaveValue("Dune");
  await expect(books).toHaveCount(1);
});
