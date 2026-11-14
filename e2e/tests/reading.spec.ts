import type { Page } from "@playwright/test";
import { createBook } from "../catalogue.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";
import { addProgress, finishBook, setStatus, today } from "../reading.ts";

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);

const yourReading = (page: Page) =>
  page.getByRole("region", { name: "Your reading" });
const statusButton = (page: Page, name: string) =>
  page
    .getByRole("group", { name: "Reading status" })
    .getByRole("button", { name, exact: true });

async function openBook(page: Page, input: { pageCount?: number } = {}) {
  await setupAdmin(page);
  const book = await createBook(page, { title: "Dune", copy: {}, ...input });
  await page.goto(`/books/${book.id}`);
  await expect(yourReading(page)).toBeVisible();
  return book;
}

test("setting each status on the book page", async ({ page }) => {
  await openBook(page);
  const card = yourReading(page);

  await statusButton(page, "Want to read").click();
  await expect(statusButton(page, "Want to read")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(card).toContainText("On your list since");

  await statusButton(page, "Reading").click();
  await expect(statusButton(page, "Reading")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(card).toContainText("No progress recorded yet");
  await expect(card).toContainText(`Started ${formatDate(new Date())}`);

  await statusButton(page, "Abandoned").click();
  await expect(card).toContainText(`Stopped on ${formatDate(new Date())}`);

  await statusButton(page, "Read").click();
  await expect(card).toContainText(`Finished on ${formatDate(new Date())}`);
  await expect(statusButton(page, "Abandoned")).toBeDisabled();
});

test("updating progress and finishing from the dialog", async ({ page }) => {
  const book = await openBook(page, { pageCount: 300 });
  await setStatus(page.request, book.id, "reading");
  await addProgress(page.request, book.id, today(), 60);
  await page.reload();
  const card = yourReading(page);
  await expect(card).toContainText("Page 60 of 300");

  await card.getByRole("button", { name: "Update progress" }).click();
  let dialog = page.getByRole("dialog", { name: "Update progress" });
  await expect(dialog.getByLabel("I am on page")).toHaveValue("60");
  await dialog.getByLabel("I am on page").fill("120");
  await expect(dialog).toContainText("40% · 60 pages since last time");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Page 120 of 300");
  await expect(card).toContainText("40%");

  await card.getByRole("button", { name: "Update progress" }).click();
  dialog = page.getByRole("dialog", { name: "Update progress" });
  await dialog.getByLabel("Read on").fill("2026-01-20");
  await dialog.getByRole("button", { name: "I finished the book" }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Finished on Jan 20, 2026");
});

test("finishing with a date and without one", async ({ page }) => {
  const book = await openBook(page);
  await setStatus(page.request, book.id, "reading");
  await page.reload();
  const card = yourReading(page);

  await card.getByRole("button", { name: "Finished", exact: true }).click();
  await expect(card).toContainText(`Finished on ${formatDate(new Date())}`);

  await card.getByRole("button", { name: "Change date" }).click();
  let dialog = page.getByRole("dialog", { name: "When did you finish?" });
  await dialog.getByLabel("Finished on").fill("2026-03-04");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(card).toContainText("Finished on Mar 4, 2026");

  await card.getByRole("button", { name: "Change date" }).click();
  dialog = page.getByRole("dialog", { name: "When did you finish?" });
  await dialog.getByLabel("I do not remember the date").check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(card).toContainText("Finished, date not known");
});

test("changing and removing the start date", async ({ page }) => {
  const book = await openBook(page);
  await setStatus(page.request, book.id, "reading");
  await page.reload();
  const card = yourReading(page);
  await expect(card).toContainText(`Started ${formatDate(new Date())}`);

  await card.getByRole("button", { name: "Change start date" }).click();
  let dialog = page.getByRole("dialog", { name: "When did you start?" });
  await dialog.getByLabel("Started on").fill("2026-10-02");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Started Oct 2, 2026");

  await card.getByRole("button", { name: "Change start date" }).click();
  dialog = page.getByRole("dialog", { name: "When did you start?" });
  await dialog.getByLabel("I do not remember the date").check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Start date not known");
});

test("a re-read keeps the earlier read", async ({ page }) => {
  const book = await openBook(page);
  await finishBook(page.request, book.id, "2019-03-10");
  await page.reload();

  await statusButton(page, "Reading").click();
  const card = yourReading(page);
  await expect(card).toContainText("No progress recorded yet");
  await expect(card).toContainText("Read once before, finished March 2019");
});

const clearDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Clear your reading status?" });

async function expectNoStatus(page: Page) {
  for (const name of ["Want to read", "Reading", "Read", "Abandoned"]) {
    await expect(statusButton(page, name)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  }
}

test("clearing the status", async ({ page }) => {
  const book = await openBook(page);
  await finishBook(page.request, book.id, "2019-03-10");
  await setStatus(page.request, book.id, "reading");
  await page.reload();
  const card = yourReading(page);
  const clear = card.getByRole("button", { name: "Clear status" });
  const confirm = clearDialog(page).getByRole("button", {
    name: "Clear status",
  });

  await clear.click();
  await confirm.click();
  await expect(statusButton(page, "Read")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(card).toContainText("Finished on Mar 10, 2019");
  await expect(card).not.toContainText("Read once before");

  await clear.click();
  await expect(clearDialog(page)).toContainText("Finished on Mar 10, 2019");
  await confirm.click();
  await expect(clear).toBeHidden();
  await expectNoStatus(page);
});

test("clearing asks first when progress would be lost", async ({ page }) => {
  const book = await openBook(page, { pageCount: 300 });
  await setStatus(page.request, book.id, "reading");
  await addProgress(page.request, book.id, today(), 60);
  await page.reload();
  const card = yourReading(page);
  const clear = card.getByRole("button", { name: "Clear status" });

  await clear.click();
  const dialog = clearDialog(page);
  await expect(dialog).toContainText("Your status “Reading”");
  await expect(dialog).toContainText(`Started ${formatDate(new Date())}`);
  await expect(dialog).toContainText("Your progress, up to page 60");
  await dialog.getByRole("button", { name: "Cancel" }).first().click();
  await expect(dialog).toBeHidden();
  await expect(card).toContainText("Page 60 of 300");

  await clear.click();
  await dialog.getByRole("button", { name: "Clear status" }).click();
  await expect(clear).toBeHidden();
  await expectNoStatus(page);
});

test("clearing a plain want to read does not ask", async ({ page }) => {
  const book = await openBook(page);
  await setStatus(page.request, book.id, "want");
  await page.reload();
  const clear = yourReading(page).getByRole("button", { name: "Clear status" });

  await clear.click();
  await expect(clear).toBeHidden();
  await expect(clearDialog(page)).toHaveCount(0);
  await expectNoStatus(page);
});

test("clearing the status of a book outside the library removes it", async ({
  page,
}) => {
  await setupAdmin(page);
  const book = await createBook(page, { title: "Kindred" });
  await setStatus(page.request, book.id, "want");
  await page.goto(`/books/${book.id}`);

  await yourReading(page).getByRole("button", { name: "Clear status" }).click();
  await expect(page).toHaveURL(/\/reading$/);
  const res = await page.request.get(`/api/v1/books/${book.id}`);
  expect(res.status()).toBe(404);
});
