import type { Locator, Page } from "@playwright/test";
import { createBook, createLocation } from "../catalogue.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";
import { dnbOnlyIsbn, unknownIsbn, unreachableIsbn } from "../metadata-stub.ts";

// The metadata stub answers with recorded catalogue data: 9780140328721 is
// "Fantastic Mr. Fox", 9780547928227 "The Hobbit", 9783257229530 "Der Vorleser".

async function openDialog(page: Page, search = "") {
  await page.goto(`/library?add=true${search}`);
  return page.getByRole("dialog", { name: "Add a book" });
}

async function lookUp(dialog: Locator, isbn: string) {
  await dialog.getByRole("textbox", { name: "ISBN" }).fill(isbn);
  await dialog.getByRole("button", { name: "Look up" }).click();
}

/** The phone shows short labels on the segmented control. */
const borrowedChoice = (dialog: Locator) =>
  dialog.getByRole("radio", { name: /^Borrowed/ });
const readingListChoice = (dialog: Locator) =>
  dialog.getByRole("radio", { name: /reading list/i });

async function bookWithIsbn(page: Page, isbn: string) {
  const res = await page.request.get(`/api/v1/books?q=${isbn}`);
  const [item] = (await res.json()).items;
  return (await page.request.get(`/api/v1/books/${item.id}`)).json();
}

test("adding a book by ISBN into the library", async ({ page }) => {
  await setupAdmin(page);
  await createLocation(page, "Home");
  const dialog = await openDialog(page);
  await expect(dialog.getByRole("tab", { name: "ISBN" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await lookUp(dialog, "978-0-14-032872-1");

  await expect(dialog).toContainText("Fantastic Mr. Fox");
  await expect(dialog).toContainText("Roald Dahl");
  await expect(dialog).toContainText("1988 · 96 pages · English");
  await expect(dialog).toContainText("Found on Open Library and Google Books");
  await dialog.getByLabel("Shelf").selectOption({ label: "Home" });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(
    page.getByRole("link", { name: /Fantastic Mr\. Fox/ }),
  ).toBeVisible();
  const book = await bookWithIsbn(page, "9780140328721");
  expect(book).toMatchObject({
    metadataSource: "openlibrary,googlebooks",
    copies: [{ location: { path: ["Home"] } }],
  });
  expect(book.coverUrl).not.toBeNull();
});

test("a book only the DNB knows arrives with its cover", async ({ page }) => {
  await setupAdmin(page);
  const dialog = await openDialog(page);
  await lookUp(dialog, dnbOnlyIsbn);
  await expect(dialog).toContainText("Der Teepalast");
  await expect(dialog).toContainText("Found on Deutsche Nationalbibliothek");
  // The DNB's cover service does not answer browsers, so nothing is previewed.
  await expect(dialog.locator("img")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();

  const book = await bookWithIsbn(page, dnbOnlyIsbn);
  expect(book.metadataSource).toBe("dnb");
  expect(book.coverUrl).not.toBeNull();
});

test("adding and entering the next book twice", async ({ page }) => {
  await setupAdmin(page);
  await createLocation(page, "Home");
  const dialog = await openDialog(page);
  const isbn = dialog.getByRole("textbox", { name: "ISBN" });

  await lookUp(dialog, "9780140328721");
  await dialog.getByLabel("Shelf").selectOption({ label: "Home" });
  await dialog.getByRole("button", { name: "Add and enter next" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "“Fantastic Mr. Fox” was added.",
  );
  await expect(isbn).toBeFocused();
  await expect(isbn).toHaveValue("");

  await lookUp(dialog, "9780547928227");
  await expect(dialog).toContainText("The Hobbit");
  await expect(dialog.getByLabel("Shelf").locator("option:checked")).toHaveText(
    "Home",
  );
  await dialog.getByRole("button", { name: "Add and enter next" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "“The Hobbit” was added.",
  );
  await expect(isbn).toBeFocused();
  await expect(isbn).toHaveValue("");

  await page.keyboard.press("Escape");
  await expect(page.getByText("2 of 2 shown")).toBeVisible();
});

test("an ISBN no catalogue knows leads to manual entry", async ({ page }) => {
  await setupAdmin(page);
  const dialog = await openDialog(page);
  await lookUp(dialog, unknownIsbn);
  await expect(dialog.getByRole("alert")).toHaveText(
    "None of the catalogues knows this ISBN.",
  );
  await dialog.getByRole("button", { name: "Enter manually" }).click();

  await expect(
    dialog.getByRole("tab", { name: "Enter manually" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("textbox", { name: "ISBN" })).toHaveValue(
    unknownIsbn,
  );
  await dialog.getByLabel("Title", { exact: true }).fill("Self-published");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("link", { name: /Self-published/ }),
  ).toBeVisible();
});

test("unreachable catalogues offer to try again or enter by hand", async ({
  page,
}) => {
  await setupAdmin(page);
  const dialog = await openDialog(page);
  await lookUp(dialog, unreachableIsbn);
  const message = dialog.getByText(
    "The catalogues cannot be reached right now.",
  );
  await expect(message).toBeVisible();
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(message).toBeVisible();
  await dialog.getByRole("button", { name: "Enter manually" }).click();
  await expect(dialog.getByRole("textbox", { name: "ISBN" })).toHaveValue(
    unreachableIsbn,
  );
});

test("an invalid ISBN is pointed out", async ({ page }) => {
  await setupAdmin(page);
  const dialog = await openDialog(page);
  await lookUp(dialog, "9780140328722");
  await expect(dialog.getByRole("alert")).toHaveText(
    "This is not a valid ISBN. Please check its digits.",
  );
});

test("searching by title and adding a result", async ({ page }) => {
  await setupAdmin(page);
  const dialog = await openDialog(page);
  await dialog.getByRole("tab", { name: "Search by title" }).click();
  await dialog
    .getByRole("searchbox", { name: "Title or author" })
    .fill("Der Vorleser");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  const results = dialog.getByRole("list", { name: "Search results" });
  await expect(results.getByRole("listitem")).toHaveCount(7);
  await results.getByRole("button").first().click();

  await expect(dialog).toContainText("Bernhard Schlink");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("link", { name: /Der Vorleser/ })).toBeVisible();
});

test("a book borrowed from a new person is a loan, not in the library", async ({
  page,
}) => {
  await setupAdmin(page);
  const dialog = await openDialog(page);
  await lookUp(dialog, "9780140328721");
  await borrowedChoice(dialog).check();
  await dialog.getByRole("button", { name: "New person" }).click();
  await dialog.getByLabel("Name of the new person").fill("Lena");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Your library is empty.")).toBeVisible();

  await page.goto("/loans");
  const borrowed = page.getByRole("region", { name: /^Borrowed/ });
  await expect(
    borrowed.getByRole("link", { name: "Fantastic Mr. Fox" }),
  ).toBeVisible();
  await expect(
    borrowed.getByText(/Lena/).filter({ visible: true }).first(),
  ).toBeVisible();
});

test("a book only on the reading list is in the wishlist", async ({
  page,
  isMobile,
}) => {
  await setupAdmin(page);
  const dialog = await openDialog(page);
  await lookUp(dialog, "9780140328721");
  await readingListChoice(dialog).check();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Your library is empty.")).toBeVisible();

  await page.goto("/reading");
  if (isMobile) {
    await page
      .getByRole("group", { name: "Reading lists" })
      .getByRole("button", { name: "Want to read", exact: true })
      .click();
  }
  await expect(
    page
      .getByRole("region", { name: "Wishlist" })
      .getByRole("link", { name: /Fantastic Mr\. Fox/ }),
  ).toBeVisible();
});

test("the ISBN of a wishlist book moves it into the library", async ({
  page,
}) => {
  await setupAdmin(page);
  const res = await page.request.post("/api/v1/books", {
    data: {
      title: "Fantastic Mr Fox",
      isbns: ["9780140328721"],
      wantToRead: true,
    },
  });
  expect(res.status()).toBe(201);
  const dialog = await openDialog(page);
  await lookUp(dialog, "9780140328721");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "“Fantastic Mr Fox” was already known. It is now in your library.",
  );
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /Fantastic Mr Fox/ }),
  ).toBeVisible();
  await expect(page.getByText("1 of 1 shown")).toBeVisible();
});

test("an ISBN already in the library offers another copy", async ({ page }) => {
  await setupAdmin(page);
  const home = await createLocation(page, "Home");
  const book = await createBook(page, {
    title: "Fantastic Mr Fox",
    authors: ["Roald Dahl"],
    isbns: ["9780140328721"],
    copy: { locationId: home.id },
  });
  const dialog = await openDialog(page);
  await lookUp(dialog, "9780140328721");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();

  const prompt = dialog.getByRole("region", {
    name: "This book is already in your library",
  });
  await expect(prompt).toContainText("Fantastic Mr Fox");
  await expect(prompt).toContainText("Home");
  await prompt.getByRole("button", { name: "Add another copy" }).click();
  await expect(dialog).toBeHidden();
  const res = await page.request.get(`/api/v1/books/${book.id}`);
  expect((await res.json()).copies).toHaveLength(2);
});

test.describe("the same book under another ISBN", () => {
  async function askSameBook(page: Page) {
    await setupAdmin(page);
    const existing = await createBook(page, {
      title: "Der Vorleser",
      authors: ["Bernhard Schlink"],
      isbns: ["9783257073690"],
      copy: {},
    });
    const dialog = await openDialog(page);
    await lookUp(dialog, "9783257229530");
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    const question = dialog.getByRole("region", { name: "Same book?" });
    await expect(question).toContainText("Der Vorleser");
    return { dialog, question, existing };
  }

  test("is added to that book", async ({ page }) => {
    const { dialog, question, existing } = await askSameBook(page);
    await question.getByRole("button", { name: "Add to that book" }).click();
    await expect(dialog).toBeHidden();
    const res = await page.request.get(`/api/v1/books/${existing.id}`);
    expect(await res.json()).toMatchObject({
      isbns: ["9783257073690", "9783257229530"],
      copies: [{}, {}],
    });
    await expect(page.getByText("1 of 1 shown")).toBeVisible();
  });

  test("is kept as a separate book", async ({ page }) => {
    const { dialog, question } = await askSameBook(page);
    await question
      .getByRole("button", { name: "Keep as a separate book" })
      .click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("2 of 2 shown")).toBeVisible();
  });
});

test("the own parameter preselects the ownership", async ({ page }) => {
  await setupAdmin(page);
  let dialog = await openDialog(page, "&own=borrowed");
  await lookUp(dialog, "9780140328721");
  await expect(borrowedChoice(dialog)).toBeChecked();

  dialog = await openDialog(page, "&own=reading-list");
  await lookUp(dialog, "9780140328721");
  await expect(readingListChoice(dialog)).toBeChecked();

  dialog = await openDialog(page);
  await lookUp(dialog, "9780140328721");
  await expect(
    dialog.getByRole("radio", { name: "In our library" }),
  ).toBeChecked();
});

test("the loans page opens the dialog for a borrowed book", async ({
  page,
}) => {
  await setupAdmin(page);
  await page.goto("/loans");
  await page
    .getByRole("link", { name: /^(Add a borrowed book|Add)$/ })
    .filter({ visible: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add a book" });
  await lookUp(dialog, "9780140328721");
  await expect(borrowedChoice(dialog)).toBeChecked();
});

test("adding a book by ISBN in German", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("language", "de"));
  await setupAdmin(page);
  await page.goto("/library?add=true");
  const dialog = page.getByRole("dialog", { name: "Buch hinzufügen" });
  await expect(dialog.getByRole("tab", { name: "Titelsuche" })).toBeVisible();
  await dialog.getByRole("textbox", { name: "ISBN" }).fill("3-257-22953-4");
  await dialog.getByRole("button", { name: "Nachschlagen" }).click();
  await expect(dialog).toContainText("1997 · 206 Seiten · Deutsch");
  await expect(dialog).toContainText(
    "Gefunden in: Deutsche Nationalbibliothek und Google Books",
  );
  await dialog.getByRole("button", { name: "Hinzufügen und nächstes" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "„Der Vorleser“ wurde hinzugefügt.",
  );
});
