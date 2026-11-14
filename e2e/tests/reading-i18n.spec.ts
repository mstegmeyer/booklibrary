import { createBook } from "../catalogue.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";

test("reading on the book page in German", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("language", "de"));
  await setupAdmin(page);
  const book = await createBook(page, {
    title: "Momo",
    pageCount: 304,
    copy: {},
  });
  await page.goto(`/books/${book.id}`);

  const card = page.getByRole("region", { name: "Dein Lesen" });
  await card.getByRole("button", { name: "Lese ich" }).click();
  await expect(card).toContainText("Noch kein Fortschritt eingetragen");

  await card.getByRole("button", { name: "Fortschritt eintragen" }).click();
  const dialog = page.getByRole("dialog", { name: "Fortschritt eintragen" });
  await dialog.getByLabel("Ich bin auf Seite").fill("76");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(card).toContainText("Seite 76 von 304");
  await expect(card).toContainText("25 %");
});
