import { createBook, createLocation } from "../catalogue.ts";
import { expect, setupAdmin, test } from "../fixtures.ts";

test("creating, renaming, moving and deleting locations", async ({ page }) => {
  await setupAdmin(page);
  await page.goto("/locations");
  const tree = page.getByRole("list").first();

  await page.getByRole("button", { name: "Add location" }).click();
  let dialog = page.getByRole("dialog", { name: "Add a location" });
  await dialog.getByLabel("Name").fill("Home");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

  await page.getByRole("button", { name: "Add a location inside" }).click();
  dialog = page.getByRole("dialog", { name: "Add a location inside Home" });
  await dialog.getByLabel("Name").fill("Living room");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(
    page.getByRole("heading", { name: "Living room" }),
  ).toBeVisible();

  const panel = page.getByRole("region", { name: "Living room" });
  await panel.getByLabel("Name").fill("Lounge");
  await panel.getByRole("button", { name: "Save" }).click();
  await expect(tree.getByRole("button", { name: /^Lounge/ })).toBeVisible();

  await page.getByRole("button", { name: "Add location" }).click();
  dialog = page.getByRole("dialog", { name: "Add a location" });
  await dialog.getByLabel("Name").fill("Lake house");
  await dialog.getByRole("button", { name: "Add" }).click();

  await tree.getByRole("button", { name: /^Lounge/ }).click();
  const lounge = page.getByRole("region", { name: "Lounge" });
  await lounge.getByLabel("Inside").selectOption({ label: "Lake house" });
  await lounge.getByRole("button", { name: "Save" }).click();
  await expect(lounge.getByText("Lake house", { exact: true })).toBeVisible();

  await tree.getByRole("button", { name: /^Home/ }).click();
  await page
    .getByRole("region", { name: "Home" })
    .getByRole("button", { name: "Delete location" })
    .click();
  await expect(tree.getByRole("button", { name: /^Home/ })).toHaveCount(0);
  await expect(tree.getByRole("button", { name: /^Lake house/ })).toBeVisible();
});

test("a location with books or locations inside cannot be deleted", async ({
  page,
}) => {
  await setupAdmin(page);
  const home = await createLocation(page, "Home");
  const shelf = await createLocation(page, "Shelf", home.id);
  await createBook(page, { title: "Dune", copy: { locationId: shelf.id } });
  await page.goto("/locations");
  const tree = page.getByRole("list").first();

  await tree.getByRole("button", { name: /^Home/ }).click();
  let panel = page.getByRole("region", { name: "Home" });
  await expect(
    panel.getByRole("button", { name: "Delete location" }),
  ).toBeDisabled();
  await expect(panel).toContainText(
    "Move or delete the locations inside it first.",
  );

  await tree.getByRole("button", { name: /^Shelf/ }).click();
  panel = page.getByRole("region", { name: "Shelf" });
  await expect(
    panel.getByRole("button", { name: "Delete location" }),
  ).toBeDisabled();
  await expect(panel).toContainText("Move its book somewhere else first.");

  await panel.getByRole("link", { name: "Show 1 book" }).click();
  await expect(page).toHaveURL(/\/library\?location=/);
  await expect(page.getByRole("link", { name: /Dune/ })).toBeVisible();
});
