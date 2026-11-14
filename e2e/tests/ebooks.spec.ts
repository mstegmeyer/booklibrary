import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { buildEpub, buildPdf } from "../../apps/server/src/test/epub.ts";
import { addFile, createBook } from "../catalogue.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";

// EPUBs and PDFs are built in code; the metadata stub knows 9780140328721
// as "Fantastic Mr. Fox".

const epub = (options: Parameters<typeof buildEpub>[0]) => ({
  name: "book.epub",
  mimeType: "application/epub+zip",
  buffer: Buffer.from(buildEpub(options)),
});
const pdf = (text?: string) => ({
  name: "book.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from(buildPdf(text)),
});

async function uploadInDialog(page: Page, file: ReturnType<typeof epub>) {
  await page.goto("/library?add=true");
  const dialog = page.getByRole("dialog", { name: "Add a book" });
  await dialog.getByRole("tab", { name: "Upload e-book" }).click();
  await dialog.getByLabel("EPUB or PDF file").setInputFiles(file);
  return dialog;
}

test("uploading an EPUB through the add dialog", async ({
  page,
  libraryDir,
}) => {
  await setupAdmin(page);
  const dialog = await uploadInDialog(
    page,
    epub({ title: "The Name of the Rose", authors: ["Umberto Eco"] }),
  );
  await expect(dialog).toContainText("The Name of the Rose");
  await expect(dialog).toContainText("Umberto Eco");
  await expect(dialog).toContainText("Found on the EPUB file");
  await expect(dialog).toContainText("With the file book.epub");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();

  const book = page.getByRole("link", { name: /The Name of the Rose/ });
  await expect(book).toBeVisible();
  await expect(book.getByText("E-book", { exact: true })).toBeVisible();
  expect(
    existsSync(join(libraryDir, "Eco, Umberto/The Name of the Rose.epub")),
  ).toBe(true);
});

test("the book page shows the file and downloads it", async ({ page }) => {
  await setupAdmin(page);
  const created = await createBook(page, {
    title: "Dune",
    authors: ["Frank Herbert"],
    copy: {},
  });
  const file = epub({ title: "Dune" });
  await addFile(page, created.id, file);
  await page.goto(`/books/${created.id}`);

  const section = page.getByRole("region", { name: "E-book" });
  await expect(section.getByText(/^EPUB · /)).toBeVisible();
  await expect(section.getByText("Herbert, Frank/Dune.epub")).toBeVisible();
  const downloading = page.waitForEvent("download");
  await section.getByRole("link", { name: "Download" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("Dune.epub");
  const saved = await readFile(await download.path());
  expect(saved.subarray(0, 2).toString()).toBe("PK");
});

test("renaming a book moves its file", async ({ page, libraryDir }) => {
  await setupAdmin(page);
  const book = await createBook(page, {
    title: "Name of the Rose",
    authors: ["Umberto Eco"],
    copy: {},
  });
  await addFile(page, book.id, pdf());
  await page.goto(`/books/${book.id}`);
  const section = page.getByRole("region", { name: "E-book" });
  await expect(
    section.getByText("Eco, Umberto/Name of the Rose.pdf"),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Edit/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Edit details" });
  await dialog.getByLabel("Title", { exact: true }).fill("Der Name der Rose");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await expect(
    section.getByText("Eco, Umberto/Der Name der Rose.pdf"),
  ).toBeVisible();
  expect(
    existsSync(join(libraryDir, "Eco, Umberto/Der Name der Rose.pdf")),
  ).toBe(true);
  expect(
    existsSync(join(libraryDir, "Eco, Umberto/Name of the Rose.pdf")),
  ).toBe(false);
});

test("attaching a PDF to a book on its page", async ({ page }) => {
  await setupAdmin(page);
  const book = await createBook(page, {
    title: "Middlemarch",
    authors: ["George Eliot"],
    copy: {},
  });
  await page.goto(`/books/${book.id}`);
  const section = page.getByRole("region", { name: "E-book" });
  await expect(
    section.getByText("There is no e-book file of this book."),
  ).toBeVisible();

  const choosing = page.waitForEvent("filechooser");
  await section.getByRole("button", { name: "Upload e-book" }).click();
  await (await choosing).setFiles(pdf());
  await expect(
    section.getByText("Eliot, George/Middlemarch.pdf"),
  ).toBeVisible();
  await expect(section.getByText(/^PDF · /)).toBeVisible();

  // Another PDF asks before it replaces the first.
  const again = page.waitForEvent("filechooser");
  await section.getByRole("button", { name: "Upload e-book" }).click();
  await (await again).setFiles(pdf("second"));
  const replace = page.getByRole("dialog", {
    name: "This book already has a PDF file",
  });
  await replace.getByRole("button", { name: "Replace the file" }).click();
  await expect(replace).toBeHidden();
  await expect(section.getByRole("listitem")).toHaveCount(1);
});

test("an EPUB with the ISBN of a wishlist book moves it into the library", async ({
  page,
}) => {
  await setupAdmin(page);
  const res = await page.request.post("/api/v1/books", {
    data: {
      title: "Fantastic Mr. Fox",
      authors: ["Roald Dahl"],
      isbns: ["9780140328721"],
      wantToRead: true,
    },
  });
  expect(res.status()).toBe(201);
  await page.goto("/library");
  await expect(page.getByText("Your library is empty.")).toBeVisible();

  const dialog = await uploadInDialog(
    page,
    epub({ title: "Fantastic Mr Fox", isbn: "9780140328721" }),
  );
  await expect(dialog).toContainText("Roald Dahl");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "“Fantastic Mr. Fox” was already known. The e-book was added to it.",
  );
  await dialog.getByRole("button", { name: "Close" }).click();

  const book = page.getByRole("link", { name: /Fantastic Mr\. Fox/ });
  await expect(book).toBeVisible();
  await expect(book.getByText("E-book", { exact: true })).toBeVisible();
});

test("removing a file", async ({ page, libraryDir }) => {
  await setupAdmin(page);
  const book = await createBook(page, { title: "Dune", copy: {} });
  const { files } = await addFile(page, book.id, pdf());
  await page.goto(`/books/${book.id}`);

  const section = page.getByRole("region", { name: "E-book" });
  await section.getByRole("button", { name: "Remove" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this file?" });
  await dialog.getByRole("button", { name: "Delete file" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    section.getByText("There is no e-book file of this book."),
  ).toBeVisible();
  expect(existsSync(join(libraryDir, files[0]?.path ?? ""))).toBe(false);
});

test("the e-book section in German", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("language", "de"));
  await setupAdmin(page);
  const book = await createBook(page, {
    title: "Momo",
    authors: ["Michael Ende"],
    copy: {},
  });
  await addFile(page, book.id, epub({ title: "Momo", encryption: "drm" }));
  await page.goto(`/books/${book.id}`);

  const section = page.getByRole("region", { name: "E-Book" });
  await expect(section.getByText("Ende, Michael/Momo.epub")).toBeVisible();
  await expect(section.getByText(/^Kopiergeschützt/)).toBeVisible();
  await expect(
    section.getByRole("link", { name: "Herunterladen" }),
  ).toBeVisible();
  await page.goto("/library");
  await expect(page.getByText("1 Buch")).toBeVisible();
});
