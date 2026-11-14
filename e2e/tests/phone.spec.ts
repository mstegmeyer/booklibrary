import type { Locator, Page } from "@playwright/test";
import { createBook } from "../catalogue.ts";
import { expect, openAccountMenu, setupAdmin, test } from "../fixtures.ts";
import { setStatus } from "../reading.ts";

// What the iPhone needs from the layout, as far as a browser shows it. The
// app's web view runs under the status bar and the home indicator, and iOS
// zooms into a focused field whose text is smaller than 16px.

test.skip(({ isMobile }) => !isMobile, "phone layout");

const german = (page: Page) =>
  page.addInitScript(() => localStorage.setItem("language", "de"));

/** Fails for every visible field whose text is smaller than 16px. */
async function expectFieldsZoomFree(page: Page) {
  const small = await page
    .locator("input:not([type=file]):visible, select:visible, textarea:visible")
    .evaluateAll((fields) =>
      fields
        .filter(
          (field) => Number.parseFloat(getComputedStyle(field).fontSize) < 16,
        )
        .map((field) => field.outerHTML.slice(0, 120)),
    );
  expect(small).toEqual([]);
}

/** Fails when the element is wider than its box or sticks out of the screen. */
async function expectInside(locator: Locator) {
  const { scrollWidth, clientWidth, right } = await locator.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    right: el.getBoundingClientRect().right,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  const width = await locator.page().evaluate(() => window.innerWidth);
  expect(right).toBeLessThanOrEqual(width);
}

/**
 * The safe-area insets that the CSS rules applying to the element refer to.
 * A browser reports the insets as 0, so the rules themselves are checked.
 */
function safeAreasOf(locator: Locator) {
  return locator.evaluate((element) => {
    const found = new Set<string>();
    const visit = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (
          rule instanceof CSSMediaRule &&
          !matchMedia(rule.conditionText).matches
        )
          continue;
        if (
          rule instanceof CSSStyleRule &&
          element.matches(rule.selectorText)
        ) {
          for (const side of rule.style.cssText.matchAll(
            /safe-area-inset-(\w+)/g,
          ))
            found.add(side[1] ?? "");
        }
        if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of document.styleSheets) visit(sheet.cssRules);
    return [...found].sort();
  });
}

test("the Add dialog fits the phone in German, without small fields", async ({
  page,
}) => {
  await german(page);
  await setupAdmin(page);
  await page.goto("/library?add=true");
  const dialog = page.getByRole("dialog", { name: "Buch hinzufügen" });
  await expect(dialog).toBeVisible();
  expect(await safeAreasOf(dialog)).toEqual(["bottom", "top"]);

  await expectInside(dialog);
  await expectInside(dialog.getByRole("tablist"));
  await dialog.getByRole("tab").first().waitFor();
  for (const tab of await dialog.getByRole("tab").all()) {
    await expectInside(tab);
    await tab.click();
    await expectInside(dialog);
    await expectFieldsZoomFree(page);
  }
  await dialog.getByRole("tab", { name: "ISBN" }).click();
  await expectInside(dialog.getByRole("button", { name: "Nachschlagen" }));
});

test("sheets and dialogs keep clear of the safe areas", async ({ page }) => {
  await setupAdmin(page);
  const book = await createBook(page, { title: "Dune", pageCount: 600 });
  await setStatus(page.request, book.id, "reading");
  await page.goto(`/books/${book.id}`);

  await page.getByRole("button", { name: "Update progress" }).click();
  const sheet = page.getByRole("dialog", { name: "Update progress" });
  expect(await safeAreasOf(sheet)).toEqual(["bottom", "top"]);
  await expectFieldsZoomFree(page);
  await sheet.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit details" });
  expect(await safeAreasOf(edit)).toEqual(["bottom", "top"]);
  await expectInside(edit);
  await expectFieldsZoomFree(page);
});

test("the sort and filter sheet fits the phone in German", async ({ page }) => {
  await german(page);
  await setupAdmin(page);
  await page.goto("/library");
  const button = page.getByRole("button", { name: "Sortieren und filtern" });
  expect(await button.boundingBox()).toMatchObject({ width: 44, height: 44 });
  await button.click();

  const sheet = page.getByRole("dialog", { name: "Sortieren und filtern" });
  await expect(sheet).toBeVisible();
  expect(await safeAreasOf(sheet)).toEqual(["bottom", "top"]);
  await expectInside(sheet);
  const box = await sheet.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 0,
  );
  for (const group of await sheet.getByRole("radiogroup").all())
    await expectInside(group);
  await expectFieldsZoomFree(page);
  await sheet.getByRole("button", { name: "Fertig" }).scrollIntoViewIfNeeded();
  await expectInside(sheet.getByRole("button", { name: "Zurücksetzen" }));
});

test("the library's fields do not zoom the page", async ({ page }) => {
  await setupAdmin(page);
  await page.goto("/library");
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expectFieldsZoomFree(page);
});

test("the account menu leads to the locations", async ({ page }) => {
  await setupAdmin(page);
  await page.goto("/library");

  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Locations" }).click();

  await expect(page).toHaveURL(/\/locations$/);
  await expect(page.getByRole("heading", { name: "Locations" })).toBeVisible();
});

test("a very long word in a title stays on the book page", async ({ page }) => {
  await setupAdmin(page);
  const book = await createBook(page, {
    title:
      "Donaudampfschifffahrtsgesellschaftskapitänswitwenrentenversicherung",
    copy: {},
  });
  await page.goto(`/books/${book.id}`);
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  await expectInside(heading);
  await expectInside(page.locator("html"));
});
