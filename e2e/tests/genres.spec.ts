import type { Page } from "@playwright/test";
import { createBook } from "../catalogue.ts";
import { expect, openAccountMenu, setupAdmin, test } from "../fixtures.ts";
import { finishBook } from "../reading.ts";

// In the metadata stub, 9783897484832 is "Kochen mit Bibi Blocksberg": the
// DNB calls it a cookbook ("Kochbuch") bound in boards ("Pp.").
const cookbookIsbn = "9783897484832";

async function genreId(page: Page, key: string) {
  const res = await page.request.get("/api/v1/genres");
  const { items } = await res.json();
  return items.find((g: { key: string }) => g.key === key).id as string;
}

test("adding, renaming and deleting genres", async ({ page }) => {
  await setupAdmin(page);
  const crime = await genreId(page, "crime");
  await createBook(page, { title: "Dune", copy: {} });
  const book = await createBook(page, { title: "Verblendung", copy: {} });
  await page.request.patch(`/api/v1/books/${book.id}`, {
    data: { genreId: crime },
  });

  await page.goto("/library");
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Genres" }).click();
  await expect(page).toHaveURL(/\/genres$/);
  const list = page.getByRole("list", { name: "Genres" });
  // Built-in genres in the interface language, alphabetically.
  await expect(list.getByRole("button").first()).toHaveText(
    /^Art & photography/,
  );
  await expect(list.getByRole("button", { name: /^Crime/ })).toHaveText(
    "Crime1",
  );

  await page.getByRole("button", { name: "Add genre" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a genre" });
  await dialog.getByLabel("Name").fill("Cozy mystery");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog).toBeHidden();
  const cozy = page.getByRole("region", { name: "Cozy mystery" });
  await expect(cozy).toContainText("0 books");

  await page.getByRole("button", { name: "Add genre" }).click();
  await dialog.getByLabel("Name").fill("cozy MYSTERY");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog).toContainText(
    "There is already a genre with this name.",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await list.getByRole("button", { name: /^Crime/ }).click();
  const panel = page.getByRole("region", { name: "Crime" });
  await panel.getByLabel("Name").fill("Krimi");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(list.getByRole("button", { name: /^Krimi/ })).toBeVisible();

  await page
    .getByRole("region", { name: "Krimi" })
    .getByRole("button", { name: "Delete genre" })
    .click();
  const confirm = page.getByRole("dialog", { name: "Delete Krimi?" });
  await expect(confirm).toContainText(
    "1 book has this genre. It will then have none.",
  );
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(confirm).toBeHidden();
  await expect(list.getByRole("button", { name: /^Krimi/ })).toHaveCount(0);

  await page.goto(`/books/${book.id}`);
  await expect(
    page.getByRole("region", { name: "Details" }).getByText("No genre"),
  ).toBeVisible();
});

test("choosing a genre when adding by hand, and changing it", async ({
  page,
}) => {
  await setupAdmin(page);
  await page.goto("/library?add=true");
  const dialog = page.getByRole("dialog", { name: "Add a book" });
  await dialog.getByRole("tab", { name: "Enter manually" }).click();
  await dialog.getByLabel("Title", { exact: true }).fill("Dune");
  const genre = dialog.getByLabel("Genre");
  await expect(genre).toHaveValue("");
  await expect(genre.locator("option").first()).toHaveText("No genre");
  await genre.selectOption({ label: "Science fiction" });
  await dialog.getByLabel("Format").selectOption({ label: "Hardcover" });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name: /Dune/ }).click();
  const details = page.getByRole("region", { name: "Details" });
  await expect(details).toContainText("Science fiction");
  await expect(page.getByRole("region", { name: "Copies" })).toContainText(
    "Hardcover",
  );

  await page.getByRole("button", { name: /^Edit/ }).first().click();
  const edit = page.getByRole("dialog", { name: "Edit details" });
  await expect(edit.getByLabel("Genre")).toHaveValue(
    await genreId(page, "science-fiction"),
  );
  await edit.getByLabel("Genre").selectOption({ label: "Fantasy" });
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  await expect(details).toContainText("Fantasy");
});

test("an ISBN lookup prefills the genre and the format", async ({ page }) => {
  await setupAdmin(page);
  await page.goto("/library?add=true");
  const dialog = page.getByRole("dialog", { name: "Add a book" });
  await dialog.getByRole("textbox", { name: "ISBN" }).fill(cookbookIsbn);
  await dialog.getByRole("button", { name: "Look up" }).click();
  await expect(dialog).toContainText("Kochen mit Bibi Blocksberg");

  const genre = dialog.getByLabel("Genre");
  await expect(genre.locator("option:checked")).toHaveText("Cookbook");
  await expect(
    dialog.getByLabel("Format").locator("option:checked"),
  ).toHaveText("Hardcover");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name: /Kochen mit Bibi/ }).click();
  await expect(page.getByRole("region", { name: "Details" })).toContainText(
    "Cookbook",
  );
  await expect(page.getByRole("region", { name: "Copies" })).toContainText(
    "Hardcover",
  );

  // Looked up again, the book is known: no genre to choose, the copy's
  // format still comes prefilled.
  await page.goto("/library?add=true");
  await dialog.getByRole("textbox", { name: "ISBN" }).fill(cookbookIsbn);
  await dialog.getByRole("button", { name: "Look up" }).click();
  await expect(dialog).toContainText("Kochen mit Bibi Blocksberg");
  await expect(dialog.getByLabel("Genre")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toContainText("This book is already in your library");
  await expect(
    dialog.getByLabel("Format").locator("option:checked"),
  ).toHaveText("Hardcover");
});

test("filtering the library by genre and by no genre", async ({
  page,
  isMobile,
}) => {
  await setupAdmin(page);
  const crime = await genreId(page, "crime");
  for (const [title, id] of [
    ["Verblendung", crime],
    ["Dune", null],
    ["Sakrileg", crime],
  ] as const) {
    const book = await createBook(page, { title, copy: {} });
    if (id) {
      await page.request.patch(`/api/v1/books/${book.id}`, {
        data: { genreId: id },
      });
    }
  }
  await page.goto("/library");
  const books = page.getByRole("main").getByRole("listitem");
  await expect(books).toHaveCount(3);

  const choose = async (label: string) => {
    if (isMobile) {
      await page.getByRole("button", { name: "Sort and filter" }).click();
      const sheet = page.getByRole("dialog", { name: "Sort and filter" });
      await sheet
        .getByRole("radiogroup", { name: "Genre" })
        .getByRole("radio", { name: label, exact: true })
        .click();
      await sheet.getByRole("button", { name: "Done" }).click();
    } else {
      await page.getByRole("button", { name: /^Genre/ }).click();
      await page
        .getByRole("menuitemradio", { name: label, exact: true })
        .click();
    }
  };

  await choose("Crime");
  await expect(books).toHaveCount(2);
  await expect(books).toContainText(["Sakrileg", "Verblendung"]);
  await choose("No genre");
  await expect(books).toHaveCount(1);
  await expect(books).toContainText(["Dune"]);
  await choose("Any genre");
  await expect(books).toHaveCount(3);
});

test("the statistics break the year's books down by genre", async ({
  page,
}) => {
  await setupAdmin(page);
  const year = new Date().getFullYear();
  const crime = await genreId(page, "crime");
  for (const [title, id] of [
    ["Verblendung", crime],
    ["Sakrileg", crime],
    ["Dune", null],
  ] as const) {
    const book = await createBook(page, { title, copy: {} });
    if (id) {
      await page.request.patch(`/api/v1/books/${book.id}`, {
        data: { genreId: id },
      });
    }
    await finishBook(page.request, book.id, `${year}-01-10`);
  }

  await page.goto("/statistics");
  const card = page.getByRole("region", { name: "By genre" });
  await expect(card.getByRole("term")).toHaveText(["Crime", "No genre"]);
  await expect(card.getByRole("definition")).toHaveText(["2", "1"]);
});

test("updating a book from the catalogue", async ({ page, isMobile }) => {
  await setupAdmin(page);
  const book = await createBook(page, {
    title: "Kochen",
    isbns: [cookbookIsbn],
    copy: {},
  });
  const noIsbn = await createBook(page, { title: "Notes", copy: {} });

  await page.goto(`/books/${noIsbn.id}`);
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Update from the catalogue" }),
  ).toHaveCount(0);

  await page.goto(`/books/${book.id}`);
  const action = page.getByRole("button", {
    name: "Update from the catalogue",
  });
  if (isMobile) {
    const box = await action.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  await action.click();
  const dialog = page.getByRole("dialog", {
    name: "Update from the catalogue?",
  });
  await expect(dialog).toContainText("will be replaced");
  await dialog.getByRole("button", { name: "Update" }).click();
  await expect(dialog).toBeHidden();

  await expect(
    page.getByRole("heading", { name: "Kochen mit Bibi Blocksberg" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Details" })).toContainText(
    "Cookbook",
  );
  await expect(page.getByRole("region", { name: "Copies" })).toContainText(
    "Hardcover",
  );
});
