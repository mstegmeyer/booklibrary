import type { Page } from "@playwright/test";
import { createBook, createLocation } from "../catalogue.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";
import { borrowBook, createContact, lendCopy, returnLoan } from "../loans.ts";

const section = (page: Page, name: RegExp) =>
  page.getByRole("region", { name });

/** The returned loans are folded away on the phone. */
async function showReturned(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("button", { name: "Returned loans" }).click();
  }
}

test("lending a copy from the book page shows it as lent in the library", async ({
  page,
  isMobile,
}) => {
  await setupAdmin(page);
  await createContact(page, "Sophie");
  const book = await createBook(page, {
    title: "Dune",
    authors: ["Frank Herbert"],
    copy: { format: "paperback" },
  });
  await page.goto(`/books/${book.id}`);

  const copies = page.getByRole("region", { name: "Copies" });
  await copies.getByRole("button", { name: "Lend", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Lend this book" });
  await expect(dialog).toContainText("Dune · Paperback");
  await dialog.getByRole("button", { name: "New person" }).click();
  await dialog.getByLabel("Name of the new person").fill("Lena K.");
  await dialog.getByLabel("Note (optional)").fill("Take care");
  await dialog.getByRole("button", { name: "Lend to Lena K." }).click();
  await expect(dialog).toBeHidden();
  await expect(
    copies.getByText(/Lent to Lena K\. since/).filter({ visible: true }),
  ).toBeVisible();

  await page.goto("/library");
  await expect(
    page.getByRole("link", {
      name: isMobile ? /^Lent out Dune/ : /Dune.*Lent to Lena K\./,
    }),
  ).toBeVisible();
});

test("marking a lent copy returned from the book page", async ({
  page,
  isMobile,
}) => {
  await setupAdmin(page);
  const book = await createBook(page, { title: "Dune", copy: {} });
  await lendCopy(page, book.copies[0]?.id ?? "", { name: "Lena K." });
  await page.goto(`/books/${book.id}`);

  const copies = page.getByRole("region", { name: "Copies" });
  await copies.getByRole("button", { name: "Mark returned" }).click();
  const dialog = page.getByRole("dialog", { name: "Mark as returned" });
  await dialog.getByLabel("Returned on").fill("2026-11-01");
  await dialog.getByRole("button", { name: "Mark returned" }).click();
  await expect(dialog).toBeHidden();
  await expect(copies.getByText("On the shelf")).toBeAttached();
  await expect(copies.getByRole("button", { name: "Lend" })).toBeVisible();

  await page.goto("/loans");
  await showReturned(page, isMobile);
  const returned = section(page, /^Returned/);
  await expect(returned.getByRole("link", { name: "Dune" })).toBeVisible();
});

test("the loans page lists lent, borrowed and returned books", async ({
  page,
  isMobile,
}) => {
  await setupAdmin(page);
  const home = await createLocation(page, "Home");
  const shelf = await createLocation(page, "Shelf A", home.id);
  const lena = await createContact(page, "Lena K.");
  const rose = await createBook(page, {
    title: "The Name of the Rose",
    authors: ["Umberto Eco"],
    copy: { locationId: shelf.id, format: "hardcover" },
  });
  await lendCopy(page, rose.copies[0]?.id ?? "", { id: lena.id });
  const klara = await createBook(page, { title: "Klara and the Sun" });
  await borrowBook(page, klara.id, { name: "Sophie" });
  const momo = await createBook(page, { title: "Momo", copy: {} });
  const old = await lendCopy(page, momo.copies[0]?.id ?? "", { id: lena.id });
  await returnLoan(page, old.id);

  await page.goto("/loans");
  await expect(page.getByText("1 book lent out · 1 borrowed")).toBeVisible();

  const lent = section(page, /^Lent out/);
  await expect(
    lent.getByRole("link", { name: "The Name of the Rose" }),
  ).toBeVisible();
  await expect(
    lent.getByText(/Lena K\./).filter({ visible: true }),
  ).toHaveCount(1);
  await expect(lent.getByRole("link", { name: "Momo" })).toHaveCount(0);

  const borrowed = section(page, /^Borrowed/);
  await expect(
    borrowed.getByRole("link", { name: "Klara and the Sun" }),
  ).toBeVisible();

  await showReturned(page, isMobile);
  const returned = section(page, /^Returned/);
  await expect(returned.getByRole("link", { name: "Momo" })).toBeVisible();
  await expect(
    returned.getByText(/Lent to Lena K\./).filter({ visible: true }),
  ).toHaveCount(1);
});

test("lending a book from the loans page", async ({ page }) => {
  await setupAdmin(page);
  await createContact(page, "Tobias");
  await createBook(page, { title: "Stoner", authors: ["John Williams"] });
  await createBook(page, {
    title: "Invisible Cities",
    authors: ["Italo Calvino"],
    copy: {},
  });
  await page.goto("/loans");

  await page.getByRole("button", { name: "Lend a book" }).click();
  const dialog = page.getByRole("dialog", { name: "Lend a book" });
  await dialog.getByLabel("Search the library").fill("i");
  const result = dialog.getByRole("button", { name: /Invisible Cities/ });
  await expect(result).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Stoner/ })).toHaveCount(0);
  await result.click();
  await dialog.getByRole("button", { name: "Tobias" }).click();
  await dialog.getByLabel("Lent on").fill("2026-11-02");
  await dialog.getByRole("button", { name: "Lend to Tobias" }).click();
  await expect(dialog).toBeHidden();

  const lent = section(page, /^Lent out/);
  await expect(
    lent.getByRole("link", { name: "Invisible Cities" }),
  ).toBeVisible();
  await expect(page.getByText("1 book lent out · 0 borrowed")).toBeVisible();
});

test("a borrowed book is listed under borrowed and can be returned", async ({
  page,
  isMobile,
}) => {
  await setupAdmin(page);
  const book = await createBook(page, {
    title: "Klara and the Sun",
    authors: ["Kazuo Ishiguro"],
  });
  await borrowBook(page, book.id, { name: "Sophie" });

  await page.goto("/library");
  await expect(page.getByText("Your library is empty.")).toBeVisible();

  await page.goto("/loans");
  const borrowed = section(page, /^Borrowed/);
  await expect(
    borrowed.getByRole("link", { name: "Klara and the Sun" }),
  ).toBeVisible();
  await borrowed.getByRole("button", { name: "Mark returned" }).click();
  const dialog = page.getByRole("dialog", { name: "Mark as returned" });
  await dialog.getByRole("button", { name: "Mark returned" }).click();
  await expect(dialog).toBeHidden();

  await expect(
    borrowed.getByText("You have not borrowed any books."),
  ).toBeVisible();
  await showReturned(page, isMobile);
  await expect(
    section(page, /^Returned/).getByRole("link", { name: "Klara and the Sun" }),
  ).toBeVisible();
});

test("correcting and deleting a loan", async ({ page }) => {
  await setupAdmin(page);
  await createContact(page, "Sophie");
  const book = await createBook(page, { title: "Dune", copy: {} });
  await lendCopy(page, book.copies[0]?.id ?? "", { name: "Lena K." });
  await page.goto("/loans");

  const lent = section(page, /^Lent out/);
  await lent.getByRole("button", { name: "More for Dune" }).click();
  await page.getByRole("menuitem", { name: "Edit loan" }).click();
  const edit = page.getByRole("dialog", { name: "Edit loan" });
  await edit.getByRole("button", { name: "Sophie" }).click();
  await edit.getByLabel("Started on").fill("2026-09-20");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  await expect(lent.getByText(/Sophie/).filter({ visible: true })).toHaveCount(
    1,
  );

  await lent.getByRole("button", { name: "More for Dune" }).click();
  await page.getByRole("menuitem", { name: "Delete loan" }).click();
  const remove = page.getByRole("dialog", { name: "Delete this loan?" });
  await remove.getByRole("button", { name: "Delete loan" }).click();
  await expect(remove).toBeHidden();
  await expect(lent.getByText("Nothing is lent out.")).toBeVisible();

  const res = await page.request.get(`/api/v1/books/${book.id}`);
  expect((await res.json()).copies[0].loan).toBeNull();
});

test("the people card adds, renames and deletes people", async ({ page }) => {
  await setupAdmin(page);
  const book = await createBook(page, { title: "Dune", copy: {} });
  await lendCopy(page, book.copies[0]?.id ?? "", { name: "Lena K." });
  await page.goto("/loans");

  const people = page.getByRole("region", { name: "People" });
  await expect(people.getByText("Has 1 of your books")).toBeVisible();

  await people.getByRole("button", { name: "Add a person" }).click();
  const add = page.getByRole("dialog", { name: "Add a person" });
  await add.getByLabel("Name").fill("Tobias");
  await add.getByRole("button", { name: "Add", exact: true }).click();
  await expect(add).toBeHidden();
  await expect(people.getByText("No open loans")).toBeVisible();

  await people.getByRole("button", { name: "More for Tobias" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("dialog", { name: "Rename Tobias" });
  await rename.getByLabel("Name").fill("Toby");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(people.getByText("Toby", { exact: true })).toBeVisible();

  await people.getByRole("button", { name: "More for Lena K." }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const refused = page.getByRole("dialog", { name: "Delete Lena K.?" });
  await refused.getByRole("button", { name: "Delete" }).click();
  await expect(refused.getByRole("alert")).toHaveText(
    "Lena K. still appears in loans and cannot be deleted.",
  );
  await refused.getByRole("button", { name: "Cancel" }).first().click();

  await people.getByRole("button", { name: "More for Toby" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: "Delete Toby?" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(people.getByText("Toby", { exact: true })).toHaveCount(0);
});

test("the loans page in German", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("language", "de"));
  await setupAdmin(page);
  const book = await createBook(page, { title: "Momo", copy: {} });
  await lendCopy(page, book.copies[0]?.id ?? "", { name: "Lena" });
  await page.goto("/loans");

  await expect(page.getByRole("heading", { name: "Ausleihen" })).toBeVisible();
  await expect(
    page.getByText("1 Buch verliehen · 0 ausgeliehen"),
  ).toBeVisible();
  const lent = section(page, /^Verliehen/);
  await expect(lent.getByRole("link", { name: "Momo" })).toBeVisible();
  await expect(
    lent.getByRole("button", { name: "Als zurückgegeben markieren" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Personen" })
      .getByText("Hat 1 deiner Bücher"),
  ).toBeVisible();
});
