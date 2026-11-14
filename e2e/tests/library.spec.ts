import { createBook, createLocation } from "../catalogue.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";

test("adding a book by hand shows it in the grid", async ({ page }) => {
  await setupAdmin(page);
  const home = await createLocation(page, "Home");
  await createLocation(page, "Shelf A", home.id);
  await page.goto("/library");
  await expect(page.getByText("Your library is empty.")).toBeVisible();

  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Add book" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add a book" });
  await dialog.getByLabel("Title", { exact: true }).fill("Dune");
  await dialog.getByLabel("Authors").fill("Frank Herbert");
  await dialog.getByLabel("Pages").fill("612");
  await dialog.getByLabel("Shelf").selectOption({ label: "Home › Shelf A" });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();

  const card = page.getByRole("link", { name: /Dune/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Frank Herbert");
  await expect(page.getByText("1 book in 1 place")).toBeVisible();

  // The location is remembered for the next book.
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Add book" })
    .click();
  await expect(dialog.getByLabel("Shelf")).toHaveValue(/.+/);
  await expect(dialog.getByLabel("Shelf").locator("option:checked")).toHaveText(
    "Home › Shelf A",
  );
});

test("switching to the list view is remembered", async ({ page, isMobile }) => {
  await setupAdmin(page);
  await createBook(page, { title: "Dune", pageCount: 612, copy: {} });
  await page.goto("/library");

  if (isMobile) {
    // The phone layout only has the grid.
    await expect(page.getByRole("button", { name: "List view" })).toHaveCount(
      0,
    );
    return;
  }
  await page.getByRole("button", { name: "List view" }).click();
  await expect(
    page.getByText("My reading", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Dune/ })).toContainText("612");

  await page.reload();
  await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("link", { name: /Dune/ })).toContainText("612");
});

test("searching by title, author and ISBN", async ({ page }) => {
  await setupAdmin(page);
  await createBook(page, {
    title: "Dune",
    authors: ["Frank Herbert"],
    copy: {},
  });
  await createBook(page, {
    title: "The Name of the Rose",
    authors: ["Umberto Eco"],
    isbns: ["9780156001311"],
    copy: {},
  });
  await page.goto("/library");
  const search = page.getByRole("searchbox", { name: "Search the library" });

  await search.fill("herbert");
  await expect(page.getByRole("link", { name: /Dune/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Rose/ })).toHaveCount(0);

  await search.fill("0-15-600131-4");
  await expect(page.getByRole("link", { name: /Rose/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Dune/ })).toHaveCount(0);

  await search.fill("nothing like this");
  await expect(
    page.getByText("No books match your search and filters."),
  ).toBeVisible();
});

test("filtering by location", async ({ page }) => {
  await setupAdmin(page);
  const home = await createLocation(page, "Home");
  const shelf = await createLocation(page, "Shelf", home.id);
  const lake = await createLocation(page, "Lake house");
  await createBook(page, { title: "Dune", copy: { locationId: shelf.id } });
  await createBook(page, { title: "Momo", copy: { locationId: lake.id } });
  await page.goto("/library");

  await page.getByRole("button", { name: /^Lake house/ }).click();
  await expect(page.getByRole("link", { name: /Momo/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Dune/ })).toHaveCount(0);

  await page.getByRole("button", { name: /^Home/ }).click();
  await expect(page.getByRole("link", { name: /Dune/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Momo/ })).toHaveCount(0);

  await page.getByRole("button", { name: /^All/ }).click();
  await expect(page.getByRole("link", { name: /Momo/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Dune/ })).toBeVisible();
});

test("more books load while scrolling and come back after visiting one", async ({
  page,
}) => {
  await setupAdmin(page);
  for (let i = 1; i <= 45; i++) {
    await createBook(page, {
      title: `Book ${String(i).padStart(2, "0")}`,
      copy: {},
    });
  }
  await page.goto("/library");
  await expect(page.getByText("30 of 45 shown")).toBeVisible();

  // Newest first, so the first book is at the very end.
  const last = page.getByRole("link", { name: /Book 01/ });
  await expect(async () => {
    await page
      .getByRole("link", { name: /Book \d+/ })
      .last()
      .scrollIntoViewIfNeeded();
    await expect(last).toBeVisible({ timeout: 500 });
  }).toPass();
  await expect(page.getByText("45 of 45 shown")).toBeVisible();

  await last.scrollIntoViewIfNeeded();
  await last.click();
  await expect(page.getByRole("heading", { name: "Book 01" })).toBeVisible();

  await page.goBack();
  await expect(page.getByText("45 of 45 shown")).toBeVisible();
  await expect(last).toBeInViewport();
});
