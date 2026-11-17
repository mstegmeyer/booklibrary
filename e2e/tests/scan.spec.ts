import type { Page } from "@playwright/test";
import { createBook, createLocation } from "../catalogue.ts";
import { installFakeShell } from "../fake-shell.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";
import { unknownIsbn, unreachableIsbn } from "../metadata-stub.ts";

// The metadata stub answers with recorded catalogue data: 9780140328721 is
// "Fantastic Mr. Fox", 9780547928227 "The Hobbit", 9783257229530 "Der Vorleser".
const fox = "9780140328721";
const hobbit = "9780547928227";

const sheet = (page: Page) => page.getByRole("region", { name: "Scan books" });

/**
 * Opens the scan screen from the tab bar inside the (fake) app, after `seed`
 * has added what the test needs.
 */
async function openScanner(
  page: Page,
  options: Parameters<typeof installFakeShell>[1] = {},
  seed = async () => {},
) {
  const shell = await installFakeShell(page, options);
  await setupAdmin(page);
  await seed();
  await page.goto("/library");
  await page.getByRole("link", { name: "Add book" }).click();
  await expect(page.getByRole("heading", { name: "Scan books" })).toBeVisible();
  // The screen listens for barcodes from when it starts the scan.
  await expect
    .poll(async () => (await shell.state()).calls.map((c) => c.action))
    .toContain("startScan");
  return shell;
}

async function booksWithIsbn(page: Page, isbn: string) {
  const res = await page.request.get(`/api/v1/books?q=${isbn}`);
  return (await res.json()).items as { id: string }[];
}

async function bookWithIsbn(page: Page, isbn: string) {
  const [item] = await booksWithIsbn(page, isbn);
  return (await page.request.get(`/api/v1/books/${item?.id}`)).json();
}

test.describe("inside the app", () => {
  test.skip(({ isMobile }) => !isMobile, "the iOS app runs on phones");

  test("a scanned book comes with its genre and format guessed", async ({
    page,
  }) => {
    const shell = await openScanner(page);
    // The DNB calls this one a cookbook bound in boards.
    await shell.scan("9783897484832");
    const found = sheet(page);
    await expect(found).toContainText("Kochen mit Bibi Blocksberg");
    await expect(
      found.getByLabel("Genre").locator("option:checked"),
    ).toHaveText("Cookbook");
    await found.getByLabel("Genre").selectOption({ label: "Children's book" });
    await expect(
      found.getByLabel("Format").locator("option:checked"),
    ).toHaveText("Hardcover");
    await found.getByRole("button", { name: "Add and scan next" }).click();
    await expect(found).toContainText("1 book added in this session");

    const book = await bookWithIsbn(page, "9783897484832");
    expect(book).toMatchObject({
      genre: { key: "childrens-book" },
      copies: [{ format: "hardcover" }],
    });

    // Scanned again, the book is known: its genre is not offered.
    await shell.scan("9783897484832");
    await expect(found).toContainText("Kochen mit Bibi Blocksberg");
    await expect(found.getByLabel("Format")).toBeVisible();
    await expect(found.getByLabel("Genre")).toHaveCount(0);
  });

  test("scanning books and adding them one after another", async ({ page }) => {
    const shell = await openScanner(page);
    await expect(page).toHaveURL(/\/scan$/);
    expect((await shell.state()).scanning).toBe(true);
    await expect(sheet(page)).toContainText("0 books added in this session");

    await shell.scan(fox);
    await expect(sheet(page)).toContainText("Fantastic Mr. Fox");
    await expect(sheet(page)).toContainText("Roald Dahl");
    await expect(sheet(page)).toContainText(
      "96 pages · found on Open Library and Google Books",
    );
    // Further barcodes wait until this book is dealt with.
    await shell.scan(hobbit);
    await expect(sheet(page)).not.toContainText("The Hobbit");

    await sheet(page)
      .getByRole("button", { name: "Add and scan next" })
      .click();
    await expect(sheet(page).getByRole("status")).toHaveText(
      "“Fantastic Mr. Fox” was added.",
    );
    await expect(sheet(page)).toContainText("1 book added in this session");

    await shell.scan(hobbit);
    await expect(sheet(page)).toContainText("The Hobbit");
    await sheet(page)
      .getByRole("button", { name: "Add and scan next" })
      .click();
    await expect(sheet(page)).toContainText("2 books added in this session");

    await sheet(page).getByRole("link", { name: "Done" }).click();
    await expect(page.getByText("2 of 2 shown")).toBeVisible();
  });

  test("“Not this book” drops the result and scans on", async ({ page }) => {
    const shell = await openScanner(page);
    await shell.scan(fox);
    await sheet(page).getByRole("button", { name: "Not this book" }).click();
    await expect(sheet(page)).not.toContainText("Fantastic Mr. Fox");
    await shell.scan(hobbit);
    await expect(sheet(page)).toContainText("The Hobbit");
    expect(await booksWithIsbn(page, fox)).toHaveLength(0);
  });

  test("the shelf stays chosen and is the one the Add dialog remembers", async ({
    page,
  }) => {
    const shell = await openScanner(page, {}, async () => {
      await createLocation(page, "Attic");
      await createLocation(page, "Home");
    });
    const shelf = sheet(page).getByLabel("Shelf");

    await shell.scan(fox);
    await shelf.selectOption({ label: "Home" });
    await sheet(page)
      .getByRole("button", { name: "Add and scan next" })
      .click();
    await expect(sheet(page)).toContainText("1 book added in this session");
    await shell.scan(hobbit);
    await expect(shelf.locator("option:checked")).toHaveText("Home");
    await sheet(page)
      .getByRole("button", { name: "Add and scan next" })
      .click();
    await expect(sheet(page)).toContainText("2 books added in this session");

    for (const isbn of [fox, hobbit]) {
      expect(await bookWithIsbn(page, isbn)).toMatchObject({
        copies: [{ location: { path: ["Home"] } }],
      });
    }

    await sheet(page).getByRole("button", { name: "Type an ISBN" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a book" });
    await expect(dialog.getByRole("tab", { name: "ISBN" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect((await shell.state()).scanning).toBe(false);
    await dialog.getByRole("textbox", { name: "ISBN" }).fill(fox);
    await dialog.getByRole("button", { name: "Look up" }).click();
    await expect(
      dialog.getByLabel("Shelf").locator("option:checked"),
    ).toHaveText("Home");
  });

  test("a book typed in the Add dialog counts in the session", async ({
    page,
  }) => {
    const shell = await openScanner(page);
    await shell.scan(fox);
    await sheet(page)
      .getByRole("button", { name: "Add and scan next" })
      .click();
    await expect(sheet(page)).toContainText("1 book added in this session");

    await sheet(page).getByRole("button", { name: "Type an ISBN" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a book" });
    await dialog.getByRole("textbox", { name: "ISBN" }).fill(hobbit);
    await dialog.getByRole("button", { name: "Look up" }).click();
    await dialog.getByRole("button", { name: "Add", exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/scan$/);
    await expect(sheet(page)).toContainText("2 books added in this session");
    await expect.poll(async () => (await shell.state()).scanning).toBe(true);
    expect(await booksWithIsbn(page, hobbit)).toHaveLength(1);
  });

  test("closing the Add dialog returns to the scan screen", async ({
    page,
  }) => {
    const shell = await openScanner(page);
    await shell.scan(fox);
    await sheet(page)
      .getByRole("button", { name: "Add and scan next" })
      .click();
    await sheet(page).getByRole("button", { name: "Type an ISBN" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a book" });
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/scan$/);
    await expect(sheet(page)).toContainText("1 book added in this session");
    await expect.poll(async () => (await shell.state()).scanning).toBe(true);
  });

  test("the status bar is light while the scan screen shows", async ({
    page,
  }) => {
    const shell = await openScanner(page);
    const light = async () => (await shell.state()).lightStatusBar;
    await expect.poll(light).toBe(true);

    // The Add dialog covers the dark screen.
    await sheet(page).getByRole("button", { name: "Type an ISBN" }).click();
    await expect.poll(light).toBe(false);
    await page
      .getByRole("dialog", { name: "Add a book" })
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect.poll(light).toBe(true);

    await page.getByRole("link", { name: "Close scanner" }).click();
    await expect.poll(light).toBe(false);
  });

  test("borrowed and reading-list books, with the choice kept", async ({
    page,
  }) => {
    const shell = await openScanner(page);
    await shell.scan(fox);
    await sheet(page).getByRole("radio", { name: "Borrowed" }).check();
    await sheet(page)
      .getByRole("button", { name: "Add and scan next" })
      .click();
    await expect(sheet(page)).toContainText("Choose who lent you the book.");
    await sheet(page).getByRole("button", { name: "New person" }).click();
    await sheet(page).getByLabel("Name of the new person").fill("Lena");
    await sheet(page)
      .getByRole("button", { name: "Add and scan next" })
      .click();
    await expect(sheet(page)).toContainText("1 book added in this session");

    await shell.scan(hobbit);
    await expect(
      sheet(page).getByRole("radio", { name: "Borrowed" }),
    ).toBeChecked();
    await sheet(page).getByRole("radio", { name: "Reading list only" }).check();
    await expect(sheet(page)).toContainText(
      "It goes on your reading list and stays out of the library.",
    );
    await sheet(page)
      .getByRole("button", { name: "Add and scan next" })
      .click();
    await expect(sheet(page)).toContainText("2 books added in this session");

    await sheet(page).getByRole("link", { name: "Done" }).click();
    await expect(page.getByText("Your library is empty.")).toBeVisible();

    await page.goto("/loans");
    await expect(
      page
        .getByRole("region", { name: /^Borrowed/ })
        .getByRole("link", { name: "Fantastic Mr. Fox" }),
    ).toBeVisible();
    await page.goto("/reading");
    await page
      .getByRole("group", { name: "Reading lists" })
      .getByRole("button", { name: "Want to read", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Wishlist" })
        .getByRole("link", { name: /The Hobbit/ }),
    ).toBeVisible();
  });

  test.describe("an ISBN already in the library", () => {
    async function scanKnown(page: Page) {
      let book = { id: "" };
      const shell = await openScanner(page, {}, async () => {
        book = await createBook(page, {
          title: "Fantastic Mr Fox",
          authors: ["Roald Dahl"],
          isbns: [fox],
          copy: {},
        });
      });
      await shell.scan(fox);
      await sheet(page)
        .getByRole("button", { name: "Add and scan next" })
        .click();
      const prompt = sheet(page).getByRole("region", {
        name: "This book is already in your library",
      });
      await expect(prompt).toContainText("Fantastic Mr Fox");
      return { shell, book, prompt };
    }

    test("adds another copy", async ({ page }) => {
      const { shell, book, prompt } = await scanKnown(page);
      await prompt.getByRole("button", { name: "Add another copy" }).click();
      await expect(sheet(page)).toContainText("1 book added in this session");
      const res = await page.request.get(`/api/v1/books/${book.id}`);
      expect((await res.json()).copies).toHaveLength(2);
      await shell.scan(hobbit);
      await expect(sheet(page)).toContainText("The Hobbit");
    });

    test("is skipped", async ({ page }) => {
      const { shell, book, prompt } = await scanKnown(page);
      await prompt.getByRole("button", { name: "Skip" }).click();
      await expect(prompt).toBeHidden();
      await expect(sheet(page)).toContainText("0 books added in this session");
      const res = await page.request.get(`/api/v1/books/${book.id}`);
      expect((await res.json()).copies).toHaveLength(1);
      await shell.scan(hobbit);
      await expect(sheet(page)).toContainText("The Hobbit");
    });
  });

  test.describe("the same book under another ISBN", () => {
    async function askSameBook(page: Page) {
      let existing = { id: "" };
      const shell = await openScanner(page, {}, async () => {
        existing = await createBook(page, {
          title: "Der Vorleser",
          authors: ["Bernhard Schlink"],
          isbns: ["9783257073690"],
          copy: {},
        });
      });
      await shell.scan("9783257229530");
      await sheet(page)
        .getByRole("button", { name: "Add and scan next" })
        .click();
      const question = sheet(page).getByRole("region", { name: "Same book?" });
      await expect(question).toContainText("Der Vorleser");
      return { question, existing };
    }

    test("is added to that book", async ({ page }) => {
      const { question, existing } = await askSameBook(page);
      await question.getByRole("button", { name: "Add to that book" }).click();
      await expect(sheet(page)).toContainText("1 book added in this session");
      const res = await page.request.get(`/api/v1/books/${existing.id}`);
      expect(await res.json()).toMatchObject({
        isbns: ["9783257073690", "9783257229530"],
        copies: [{}, {}],
      });
    });

    test("is kept as a separate book", async ({ page }) => {
      const { question } = await askSameBook(page);
      await question
        .getByRole("button", { name: "Keep as a separate book" })
        .click();
      await expect(sheet(page)).toContainText("1 book added in this session");
      expect(await booksWithIsbn(page, "9783257229530")).toHaveLength(1);
      expect(await booksWithIsbn(page, "9783257073690")).toHaveLength(1);
    });
  });

  test("an ISBN no catalogue knows is entered by hand", async ({ page }) => {
    const shell = await openScanner(page);
    await shell.scan(unknownIsbn);
    await expect(sheet(page).getByRole("alert")).toHaveText(
      "None of the catalogues knows this ISBN.",
    );
    await sheet(page).getByRole("button", { name: "Enter by hand" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a book" });
    await expect(
      dialog.getByRole("tab", { name: "Enter manually" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("textbox", { name: "ISBN" })).toHaveValue(
      unknownIsbn,
    );
    await dialog
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("Unknown book");
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(sheet(page)).toContainText("1 book added in this session");
    await expect(sheet(page)).toContainText(
      "Scan the barcode of a book to add it.",
    );
  });

  test("unreachable catalogues can be tried again", async ({ page }) => {
    const shell = await openScanner(page);
    await shell.scan(unreachableIsbn);
    const message = sheet(page).getByText(
      "The catalogues cannot be reached right now.",
    );
    await expect(message).toBeVisible();
    await sheet(page).getByRole("button", { name: "Try again" }).click();
    await expect(message).toBeVisible();
    // A new scan replaces the problem.
    await shell.scan(fox);
    await expect(sheet(page)).toContainText("Fantastic Mr. Fox");
  });

  test("a barcode that is not an ISBN is ignored", async ({ page }) => {
    const shell = await openScanner(page);
    await shell.scan("4006381333931");
    await expect(page.getByText("This barcode is not an ISBN.")).toBeVisible();
    await expect(sheet(page)).toContainText(
      "Scan the barcode of a book to add it.",
    );
    await expect(page.getByText("This barcode is not an ISBN.")).toBeHidden();
  });

  test("denied camera access points to the Settings app", async ({ page }) => {
    await openScanner(page, { camera: "denied" });
    await expect(sheet(page).getByRole("alert")).toHaveText(
      /allow camera access for Hootshelf in the iOS Settings app/,
    );
    await expect(
      page.getByText("Hold the barcode on the back cover inside the frame"),
    ).toBeHidden();
    await expect(
      sheet(page).getByRole("button", { name: "Type an ISBN" }),
    ).toBeVisible();
  });

  test("the torch button switches the torch", async ({ page }) => {
    const shell = await openScanner(page);
    const torch = page.getByRole("button", { name: "Torch" });
    await expect(torch).toHaveAttribute("aria-pressed", "false");
    await torch.click();
    await expect(torch).toHaveAttribute("aria-pressed", "true");
    expect((await shell.state()).torch).toBe(true);
    await torch.click();
    await expect(torch).toHaveAttribute("aria-pressed", "false");
    expect((await shell.state()).torch).toBe(false);
  });

  test("there is no torch button without a torch", async ({ page }) => {
    await openScanner(page, { torch: false });
    await expect(
      page.getByText("Hold the barcode on the back cover inside the frame"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Torch" })).toHaveCount(0);
  });

  test("leaving the screen stops the scan", async ({ page }) => {
    const shell = await openScanner(page);
    const background = () =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await expect.poll(background).toBe("rgba(0, 0, 0, 0)");

    await page.getByRole("link", { name: "Close scanner" }).click();
    await expect(page).toHaveURL(/\/library$/);
    expect((await shell.state()).scanning).toBe(false);
    expect(await background()).toBe("rgb(251, 251, 249)");

    await page.getByRole("link", { name: "Add book" }).click();
    await expect.poll(async () => (await shell.state()).scanning).toBe(true);
    await page.goBack();
    await expect.poll(async () => (await shell.state()).scanning).toBe(false);
  });
});

test.describe("in a browser", () => {
  test("the add button opens the Add dialog", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the tab bar is for phones");
    await setupAdmin(page);
    await page.goto("/library");
    await page.getByRole("link", { name: "Add book" }).click();
    await expect(
      page.getByRole("dialog", { name: "Add a book" }),
    ).toBeVisible();
  });

  test("the scan screen leads to the Add dialog", async ({ page }) => {
    await setupAdmin(page);
    await page.goto("/scan");
    await expect(page).toHaveURL(/\/library\?add=true$/);
    await expect(
      page.getByRole("dialog", { name: "Add a book" }),
    ).toBeVisible();
  });
});
