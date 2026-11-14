import { createBook, createLocation } from "../catalogue.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";
import { dnbOnlyIsbn, unknownIsbn } from "../metadata-stub.ts";

test.describe("looking for a cover", () => {
  test("finds one and shows it on the page and in the library", async ({
    page,
  }) => {
    await setupAdmin(page);
    const book = await createBook(page, {
      title: "Der Teepalast",
      isbns: [dnbOnlyIsbn],
      copy: {},
    });
    await page.route("**/cover/lookup", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });
    await page.goto(`/books/${book.id}`);
    const button = page.getByRole("button", { name: "Look for a cover" });
    await button.click();
    await expect(button).toBeDisabled();
    await expect(button).toBeHidden();
    const cover = `img[src^="/api/v1/books/${book.id}/cover"]`;
    await expect(page.locator(cover)).toBeVisible();

    await page
      .getByRole("link", { name: "Library", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await expect(
      page.getByRole("link", { name: /Der Teepalast/ }).locator(cover),
    ).toBeVisible();
  });

  test("says so when no catalogue has one", async ({ page }) => {
    await setupAdmin(page);
    const book = await createBook(page, {
      title: "Codex",
      isbns: [unknownIsbn],
      copy: {},
    });
    await page.goto(`/books/${book.id}`);
    await page.getByRole("button", { name: "Look for a cover" }).click();
    await expect(page.getByText("No cover found.")).toBeVisible();
  });

  test("is not offered without an ISBN", async ({ page }) => {
    await setupAdmin(page);
    const book = await createBook(page, { title: "Notes", copy: {} });
    await page.goto(`/books/${book.id}`);
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Look for a cover" }),
    ).toHaveCount(0);
  });
});

test("moving a copy to another location", async ({ page }) => {
  await setupAdmin(page);
  const home = await createLocation(page, "Home");
  const shelf = await createLocation(page, "Shelf A", home.id);
  await createLocation(page, "Lake house");
  const book = await createBook(page, {
    title: "Dune",
    authors: ["Frank Herbert"],
    copy: { locationId: shelf.id, format: "paperback" },
  });
  await page.goto(`/books/${book.id}`);
  await expect(page.getByRole("heading", { name: "Dune" })).toBeVisible();
  const copies = page.getByRole("region", { name: "Copies" });
  await expect(copies.getByText("Home › Shelf A")).toBeVisible();

  await copies.getByRole("button", { name: "Move", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Move this copy" });
  await dialog.getByLabel("Location").selectOption({ label: "Lake house" });
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(copies.getByText("Lake house")).toBeVisible();
  await expect(copies.getByText("Home › Shelf A")).toHaveCount(0);
});

test("removing the last copy of a book without history deletes it", async ({
  page,
}) => {
  await setupAdmin(page);
  const book = await createBook(page, { title: "Dune", copy: {} });
  await page.goto("/library");
  await page.getByRole("link", { name: /Dune/ }).click();

  await page
    .getByRole("region", { name: "Copies" })
    .getByRole("button", { name: "Remove" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Remove this copy?" });
  await expect(dialog).toContainText("It is the last copy");
  await dialog.getByRole("button", { name: "Remove copy" }).click();

  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByText("Your library is empty.")).toBeVisible();
  const res = await page.request.get(`/api/v1/books/${book.id}`);
  expect(res.status()).toBe(404);
});

test("adding a book whose ISBN is known offers another copy", async ({
  page,
}) => {
  await setupAdmin(page);
  const home = await createLocation(page, "Home");
  const book = await createBook(page, {
    title: "The Name of the Rose",
    authors: ["Umberto Eco"],
    isbns: ["9780156001311"],
    copy: { locationId: home.id },
  });
  await page.goto("/library");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Add book" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add a book" });
  await dialog.getByRole("tab", { name: "Enter manually" }).click();
  await dialog.getByLabel("Title", { exact: true }).fill("Name of the Rose");
  await dialog.getByRole("textbox", { name: "ISBN" }).fill("0-15-600131-4");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();

  const prompt = dialog.getByRole("region", {
    name: "This book is already in your library",
  });
  await expect(prompt).toContainText("The Name of the Rose");
  await expect(prompt).toContainText("Home");
  await dialog.getByRole("button", { name: "Add another copy" }).click();
  await expect(dialog).toBeHidden();

  const res = await page.request.get(`/api/v1/books/${book.id}`);
  expect((await res.json()).copies).toHaveLength(2);
  await expect(page.getByRole("link", { name: /Rose/ })).toHaveCount(1);
});

test("the duplicate prompt can be skipped", async ({ page }) => {
  await setupAdmin(page);
  await createBook(page, {
    title: "Dune",
    isbns: ["9780156001311"],
    copy: {},
  });
  await page.goto("/library?add=true");
  const dialog = page.getByRole("dialog", { name: "Add a book" });
  await dialog.getByRole("tab", { name: "Enter manually" }).click();
  await dialog.getByLabel("Title", { exact: true }).fill("Dune");
  await dialog.getByRole("textbox", { name: "ISBN" }).fill("9780156001311");
  await dialog.getByRole("button", { name: "Add and enter next" }).click();
  await dialog.getByRole("button", { name: "Skip" }).click();

  await expect(dialog.getByRole("textbox", { name: "ISBN" })).toBeFocused();
  await expect(dialog.getByRole("textbox", { name: "ISBN" })).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(page.getByText("1 of 1 shown")).toBeVisible();
});

test("the book page names the book's language", async ({ page }) => {
  await setupAdmin(page);
  const known = await createBook(page, {
    title: "Middlemarch",
    publishedYear: 1983,
    pageCount: 536,
    language: "en",
  });
  await page.goto(`/books/${known.id}`);
  await expect(page.getByText("1983 · 536 pages · English")).toBeVisible();

  const unknown = await createBook(page, { title: "Codex", language: "xx" });
  await page.goto(`/books/${unknown.id}`);
  await expect(page.getByText("xx", { exact: true })).toBeVisible();
});
