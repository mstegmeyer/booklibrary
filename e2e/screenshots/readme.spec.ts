import { join } from "node:path";
import {
  type APIRequestContext,
  test as base,
  devices,
  expect,
  type Page,
} from "@playwright/test";
import sharp from "sharp";
import { createLocation } from "../catalogue.ts";
import {
  admin,
  createMember,
  setupAdmin,
  startInstance,
  stopInstance,
} from "../fixtures.ts";
import { lendCopy } from "../loans.ts";
import { addProgress, finishBook, setStatus, signIn } from "../reading.ts";
import {
  borrowed,
  type DemoBook,
  finishedByBen,
  finishedByMara,
  lookedUp,
  owned,
  type Place,
  wished,
} from "./demo-library.ts";

// Retakes the README's screenshots: `pnpm screenshots`. It fills a fresh
// server with the demo household and writes the pictures to docs/screenshots.
// The covers come from Open Library, so it needs the network.

const out = join(import.meta.dirname, "../../docs/screenshots");
// The demo's dates are fixed, so the browser's today is too; otherwise the
// pictures would show an empty year once this one is over.
const today = new Date("2026-11-16T10:00:00");

const test = base.extend<{ instance: { url: string } }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads fixture dependencies from this pattern
  instance: async ({}, use) => {
    const { url, server, dataDir } = await startInstance({});
    await use({ url });
    await stopInstance(server, dataDir);
  },
  baseURL: async ({ instance }, use) => use(instance.url),
});

/** The lookup's cover for the ISBN; Open Library sometimes needs a second try. */
async function coverOf(request: APIRequestContext, isbn: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await request.get(`/api/v1/metadata/isbn/${isbn}`);
    const found = res.ok() ? await res.json() : null;
    if (found?.coverUrl) {
      return { coverUrl: found.coverUrl, sources: found.sources };
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  console.warn(`No cover found for ${isbn}`);
  return {};
}

async function seed(page: Page, ben: APIRequestContext) {
  const mara = page.request;
  const genres: { items: { id: string; key: string | null }[] } = await (
    await mara.get("/api/v1/genres")
  ).json();
  const genreId = (key: string) =>
    genres.items.find((genre) => genre.key === key)?.id;

  const living = await createLocation(page, "Living room");
  const places: Record<Place, string> = {
    living: living.id,
    bigShelf: (await createLocation(page, "Big shelf", living.id)).id,
    windowSill: (await createLocation(page, "Window sill", living.id)).id,
    study: (await createLocation(page, "Study")).id,
    bedroom: (await createLocation(page, "Bedroom")).id,
  };

  const ids: Record<string, string> = {};
  const copies: Record<string, string> = {};
  const add = async (
    book: Omit<DemoBook, "place" | "format">,
    ownership: object,
  ) => {
    const res = await mara.post("/api/v1/books", {
      data: {
        title: book.title,
        authors: book.authors,
        isbns: [book.isbn],
        pageCount: book.pages,
        publishedYear: book.year,
        language: book.language,
        description: book.description,
        genreId: genreId(book.genre),
        ...(await coverOf(mara, book.isbn)),
        ...ownership,
      },
    });
    expect(res.status()).toBe(201);
    const created = await res.json();
    ids[book.key] = created.id;
    copies[book.key] = created.copies[0]?.id;
  };
  for (const book of owned) {
    await add(book, {
      copy: { locationId: places[book.place], format: book.format },
    });
  }
  await add(borrowed, {
    borrowedFrom: { name: "Aylin" },
    borrowedOn: "2026-10-28",
  });
  await add(wished, { wantToRead: true });
  const id = (key: string) => ids[key] ?? "";

  for (const [key, date] of finishedByMara) {
    await finishBook(mara, id(key), date);
  }
  await setStatus(mara, id("dune"), "reading", "2026-11-06");
  await addProgress(mara, id("dune"), "2026-11-08", 124);
  await addProgress(mara, id("dune"), "2026-11-11", 287);
  await addProgress(mara, id("dune"), "2026-11-15", 412);
  await setStatus(mara, id("salt"), "reading", "2026-10-30");
  await addProgress(mara, id("salt"), "2026-11-09", 96);
  for (const key of ["solitude", "faber", "unendliche"]) {
    await setStatus(mara, id(key), "want");
  }
  await setStatus(mara, id("davinci"), "abandoned", "2026-02-02");

  for (const [key, date] of finishedByBen) {
    await finishBook(ben, id(key), date);
  }
  await setStatus(ben, id("sapiens"), "reading", "2026-11-01");
  await addProgress(ben, id("sapiens"), "2026-11-14", 210);
  await setStatus(ben, id("kite"), "want");

  await lendCopy(page, copies.martian ?? "", { name: "Jonas" }, "2026-10-18");
  await lendCopy(page, copies.schwarm ?? "", { name: "Lena" }, "2026-09-03");
  return id;
}

/** Saves what the page shows, `width` pixels wide. */
async function shoot(page: Page, name: string, width: number) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  // The covers in view have to be there before the picture is taken.
  await page.waitForFunction(() =>
    [...document.images]
      .filter((image) => {
        const box = image.getBoundingClientRect();
        return box.top < innerHeight && box.bottom > 0;
      })
      .every((image) => image.complete && image.naturalWidth > 0),
  );
  const picture = await page.screenshot({ animations: "disabled" });
  await sharp(picture)
    .resize({ width })
    .webp({ quality: 86 })
    .toFile(join(out, `${name}.webp`));
}

test("the README's screenshots", async ({
  page,
  browser,
  playwright,
  baseURL,
}) => {
  await setupAdmin(page);
  const ben = await playwright.request.newContext({ baseURL });
  await signIn(ben, await createMember(page));
  const id = await seed(page, ben);
  await ben.dispose();

  await page.clock.setFixedTime(today);
  await page.goto("/library");
  await shoot(page, "library", 2048);
  await page.goto(`/books/${id("dune")}`);
  await shoot(page, "book", 1400);
  await page.goto("/statistics");
  await shoot(page, "statistics", 1400);
  await page.goto("/reading");
  await shoot(page, "reading", 1400);
  await page.goto("/loans");
  await shoot(page, "loans", 1400);

  const phone = await browser.newContext({
    ...devices["iPhone 17"],
    baseURL,
    locale: "en-US",
  });
  await signIn(phone.request, admin);
  await phone.clock.setFixedTime(today);
  const mobile = await phone.newPage();
  await mobile.goto("/library");
  await shoot(mobile, "phone-library", 660);
  await mobile.goto(`/books/${id("dune")}`);
  await shoot(mobile, "phone-book", 660);
  await mobile.goto("/library");
  await mobile.getByRole("button", { name: "Sort and filter" }).click();
  await mobile.getByRole("dialog").waitFor();
  await shoot(mobile, "phone-filter", 660);
  await mobile.goto("/library?add=true");
  const dialog = mobile.getByRole("dialog", { name: "Add a book" });
  await dialog.getByRole("textbox", { name: "ISBN" }).fill(lookedUp.isbn);
  await dialog.getByRole("button", { name: "Look up" }).click();
  await dialog.getByText(lookedUp.title).waitFor({ timeout: 30_000 });
  // Without the focus ring on the ISBN field.
  await mobile.locator(":focus").blur();
  await shoot(mobile, "phone-add", 660);
  await phone.close();
});
