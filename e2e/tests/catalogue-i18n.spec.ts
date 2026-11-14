import { createBook, createLocation } from "../catalogue.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";

test("the library and a book page in German", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("language", "de"));
  await setupAdmin(page);
  const home = await createLocation(page, "Wohnung");
  await createBook(page, {
    title: "Momo",
    authors: ["Michael Ende"],
    pageCount: 304,
    copy: { locationId: home.id, format: "hardcover" },
  });
  await page.goto("/library");

  await expect(page.getByRole("heading", { name: "Bibliothek" })).toBeVisible();
  await expect(page.getByText("1 Buch an 1 Ort")).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Bibliothek durchsuchen" }),
  ).toHaveAttribute("placeholder", "Titel, Autor oder ISBN");
  await expect(page.getByText("1 von 1 angezeigt")).toBeVisible();

  await page.getByRole("link", { name: /Momo/ }).click();
  const copies = page.getByRole("region", { name: "Exemplare" });
  await expect(copies.getByText("Gebunden")).toBeVisible();
  await expect(
    copies.getByRole("button", { name: "Verschieben" }),
  ).toBeVisible();
  await expect(page.getByText("304 Seiten")).toBeVisible();
});
