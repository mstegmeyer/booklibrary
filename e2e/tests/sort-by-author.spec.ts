import { createBook } from "../catalogue.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";

test("sorting by author uses the surname and the Sort as field", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The phone layout has no sort menu");
  await setupAdmin(page);
  for (const [title, author] of [
    ["Moby-Dick", "Herman Melville"],
    ["The Neverending Story", "Michael Ende"],
    ["Foucault's Pendulum", "Umberto Eco"],
    ["A Wizard of Earthsea", "Ursula K. Le Guin"],
  ] as const) {
    await createBook(page, { title, authors: [author], copy: {} });
  }
  await page.goto("/library");
  await page.getByRole("button", { name: /^Sort:/ }).click();
  await page.getByRole("menuitemradio", { name: "Author" }).click();

  const books = page.getByRole("main").getByRole("listitem");
  await expect(books).toContainText([
    "Foucault's Pendulum",
    "The Neverending Story",
    "A Wizard of Earthsea",
    "Moby-Dick",
  ]);

  await page.getByRole("link", { name: /Moby-Dick/ }).click();
  await page.getByRole("button", { name: "Edit details" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit details" });
  await expect(dialog.getByLabel("Sort as")).toHaveValue("Melville, Herman");
  await dialog.getByLabel("Sort as").fill("Ahab");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.goBack();
  await expect(books).toContainText([
    "Moby-Dick",
    "Foucault's Pendulum",
    "The Neverending Story",
    "A Wizard of Earthsea",
  ]);
});
