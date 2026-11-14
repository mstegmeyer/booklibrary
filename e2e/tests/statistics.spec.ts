import type { Page } from "@playwright/test";
import { createBook } from "../catalogue.ts";
import { createMember, expect, setupAdmin, test } from "../fixtures.ts";
import { addProgress, finishBook, setStatus, signIn } from "../reading.ts";

const tile = (page: Page, name: string, value: string) =>
  page
    .getByRole("region", { name, exact: true })
    .getByText(value, { exact: true });

test("statistics for a member and the household", async ({
  page,
  playwright,
  baseURL,
}) => {
  await setupAdmin(page);
  const year = new Date().getFullYear();
  const owned = await createBook(page, {
    title: "Stoner",
    pageCount: 300,
    copy: {},
  });
  const outside = await createBook(page, { title: "Kindred", pageCount: 200 });
  const current = await createBook(page, {
    title: "Dune",
    pageCount: 100,
    copy: {},
  });
  await finishBook(page.request, owned.id, `${year}-01-10`);
  await finishBook(page.request, outside.id, `${year}-01-20`);
  await setStatus(page.request, current.id, "reading");
  await addProgress(page.request, current.id, `${year}-01-05`, 40);

  const member = await createMember(page);
  const ben = await playwright.request.newContext({ baseURL });
  await signIn(ben, member);
  await finishBook(ben, owned.id, `${year}-02-03`);
  await ben.dispose();

  await page.goto("/statistics");
  await expect(page.getByText(`What Mara read in ${year}`)).toBeVisible();
  await expect(tile(page, "Books finished", "2")).toBeVisible();
  await expect(tile(page, "Pages read", "540")).toBeVisible();
  await expect(tile(page, "From outside the library", "1")).toBeVisible();

  const perMonth = page.getByRole("region", {
    name: "Books finished per month",
  });
  await perMonth.getByRole("button", { name: "View as table" }).click();
  await expect(perMonth.getByRole("row", { name: "January" })).toContainText(
    "2",
  );

  await page
    .getByRole("group", { name: "Whose reading" })
    .getByRole("button", { name: "Household" })
    .click();
  await expect(
    page.getByText(`What the household read in ${year}`),
  ).toBeVisible();
  await expect(tile(page, "Books finished", "3")).toBeVisible();
  await expect(tile(page, "Pages read", "840")).toBeVisible();
  await expect(perMonth.getByRole("row", { name: "February" })).toContainText(
    "1",
  );
  await expect(
    page.getByRole("region", { name: "Books finished per year" }),
  ).toContainText("All time: 3 books.");
});
