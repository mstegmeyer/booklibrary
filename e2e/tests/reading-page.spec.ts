import type { Page } from "@playwright/test";
import { createBook } from "../catalogue.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";
import { borrowBook } from "../loans.ts";
import { addProgress, finishBook, setStatus, today } from "../reading.ts";

/** On the phone the sections are tabs; on the desktop they are all shown. */
async function openTab(page: Page, isMobile: boolean, name: string) {
  if (!isMobile) return;
  await page
    .getByRole("group", { name: "Reading lists" })
    .getByRole("button", { name, exact: true })
    .click();
}

test("the Reading page sections", async ({ page, isMobile }) => {
  await setupAdmin(page);
  const year = new Date().getFullYear();
  const current = await createBook(page, {
    title: "Middlemarch",
    authors: ["George Eliot"],
    pageCount: 800,
    copy: {},
  });
  await setStatus(page.request, current.id, "reading");
  await addProgress(page.request, current.id, today(), 200);
  const wanted = await createBook(page, { title: "Solaris", copy: {} });
  await setStatus(page.request, wanted.id, "want");
  const wished = await createBook(page, {
    title: "Kindred",
    authors: ["Octavia E. Butler"],
  });
  await setStatus(page.request, wished.id, "want");
  const finished = await createBook(page, {
    title: "Stoner",
    pageCount: 288,
    copy: {},
  });
  await finishBook(page.request, finished.id, `${year}-01-09`);
  const outside = await createBook(page, { title: "Gilead" });
  await finishBook(page.request, outside.id, null);

  await page.goto("/reading");
  await expect(
    page.getByText(`Mara · 1 book finished in ${year}`),
  ).toBeVisible();

  const reading = page.getByRole("region", { name: "Currently reading" });
  await expect(reading).toContainText("Middlemarch");
  await expect(reading).toContainText("Page 200 of 800");
  await expect(
    page.getByRole("link", { name: "Add a book from outside the library" }),
  ).toHaveAttribute("href", "/library?add=true&own=reading-list");

  await openTab(page, isMobile, "Want to read");
  const want = page.getByRole("region", { name: "Want to read" });
  await expect(want).toContainText("1 book within reach");
  await expect(want.getByRole("link", { name: /Solaris/ })).toBeVisible();
  const wishlist = page.getByRole("region", { name: "Wishlist" });
  await expect(wishlist).toContainText("1 book you do not own yet");
  await expect(wishlist.getByRole("link", { name: /Kindred/ })).toBeVisible();

  await openTab(page, isMobile, "Finished");
  const table = page.getByRole("table", { name: "Finished" });
  await expect(
    table.getByRole("columnheader", { name: "Library" }),
  ).toBeVisible();
  await expect(table.getByRole("row", { name: /Stoner/ })).toContainText(
    "In the library",
  );
  await page.getByRole("combobox", { name: "Year" }).selectOption("undated");
  await expect(table.getByRole("row", { name: /Gilead/ })).toContainText(
    "Not in the library",
  );
});

test("borrowed books say who they are borrowed from", async ({
  page,
  isMobile,
}) => {
  await setupAdmin(page);
  const current = await createBook(page, { title: "Buddenbrooks" });
  await borrowBook(page, current.id, { name: "Sophie" });
  await setStatus(page.request, current.id, "reading");
  const finished = await createBook(page, { title: "Lolly Willowes" });
  await borrowBook(page, finished.id, { name: "Sophie" });
  await finishBook(page.request, finished.id, null);

  await page.goto("/reading");
  await expect(
    page.getByRole("region", { name: "Currently reading" }),
  ).toContainText("Borrowed from Sophie");

  await openTab(page, isMobile, "Finished");
  await page.getByRole("combobox", { name: "Year" }).selectOption("undated");
  await expect(
    page
      .getByRole("table", { name: "Finished" })
      .getByRole("row", { name: /Lolly Willowes/ }),
  ).toContainText("Borrowed from Sophie");
});

test("abandoning a book and picking it up again", async ({
  page,
  isMobile,
}) => {
  await setupAdmin(page);
  const book = await createBook(page, {
    title: "Ulysses",
    pageCount: 732,
    copy: {},
  });
  await setStatus(page.request, book.id, "reading");
  await addProgress(page.request, book.id, today(), 148);
  await page.goto(`/books/${book.id}`);
  await page
    .getByRole("group", { name: "Reading status" })
    .getByRole("button", { name: "Abandoned" })
    .click();
  await expect(
    page.getByRole("region", { name: "Your reading" }),
  ).toContainText("Stopped on");

  await page.goto("/reading");
  await openTab(page, isMobile, "Abandoned");
  const row = page
    .getByRole("table", { name: "Abandoned" })
    .getByRole("row", { name: /Ulysses/ });
  await expect(row).toContainText("Page 148 of 732");
  await row.getByRole("button", { name: "Pick up again" }).click();
  await expect(
    page.getByText("You have not abandoned any books."),
  ).toBeVisible();

  await openTab(page, isMobile, "Reading");
  await expect(
    page.getByRole("region", { name: "Currently reading" }),
  ).toContainText("Page 148 of 732");
});
