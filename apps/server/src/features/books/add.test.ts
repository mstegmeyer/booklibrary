import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test/app.ts";
import { today } from "../reading/service.ts";

async function setup() {
  const app = createTestApp();
  const token = await app.setupAdmin();
  const call = async (path: string, method = "GET", body?: unknown) => {
    const res = await app.request(`/api/v1${path}`, { method, token, body });
    return { status: res.status, body: await res.json() };
  };
  const add = (input: Record<string, unknown>) => call("/books", "POST", input);
  const reading = async (bookId: string) =>
    (await call(`/reading/books/${bookId}`)).body.current?.status ?? null;
  return { call, add, reading };
}

const rose = {
  title: "The Name of the Rose",
  authors: ["Umberto Eco"],
  isbns: ["9780156001311"],
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("adding from a lookup", () => {
  it("downloads the cover and records the catalogues", async () => {
    const { add, call } = await setup();
    const png = await sharp({
      create: { width: 40, height: 60, channels: 3, background: "#6e2f2a" },
    })
      .png()
      .toBuffer();
    const fetch = vi.fn(
      async () =>
        new Response(new Uint8Array(png), {
          headers: { "content-type": "image/png" },
        }),
    );
    vi.stubGlobal("fetch", fetch);

    const res = await add({
      ...rose,
      coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
      sources: ["openlibrary", "dnb"],
      copy: {},
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      outcome: "created",
      metadataSource: "openlibrary,dnb",
      coverUrl: expect.stringMatching(/cover\?v=/),
    });
    expect(fetch).toHaveBeenCalledOnce();
    const cover = await call(`/books/${res.body.id}`);
    expect(cover.body.thumbnailUrl).not.toBeNull();
  });

  it("adds the book without a cover when the download fails", async () => {
    const { add } = await setup();
    vi.stubGlobal("fetch", async () => new Response(null, { status: 500 }));
    const res = await add({
      ...rose,
      coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
      sources: ["openlibrary"],
      copy: {},
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ coverUrl: null, copies: [{}] });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("not stored"));
  });
});

describe("ownership", () => {
  it("puts a copy in the library at the chosen location", async () => {
    const { add, call } = await setup();
    const shelf = (await call("/locations", "POST", { name: "Shelf A" })).body;
    const res = await add({ ...rose, copy: { locationId: shelf.id } });
    expect(res.body).toMatchObject({
      outcome: "created",
      metadataSource: null,
      copies: [{ location: { path: ["Shelf A"] } }],
    });
    expect((await call("/books")).body.total).toBe(1);
  });

  it("records a borrowed book from today without a copy", async () => {
    const { add, call } = await setup();
    const res = await add({ ...rose, borrowedFrom: { name: "Lena" } });
    expect(res.body).toMatchObject({ outcome: "created", copies: [] });
    const borrowed = (await call("/loans/borrowed")).body.items;
    expect(borrowed).toMatchObject([
      {
        book: { id: res.body.id },
        contact: { name: "Lena" },
        startedOn: today(),
        copy: null,
      },
    ]);
    expect((await call("/books")).body.total).toBe(0);
  });

  it("puts the book on the reading list without a copy", async () => {
    const { add, call, reading } = await setup();
    const res = await add({ ...rose, wantToRead: true });
    expect(res.body).toMatchObject({ copies: [], statusKept: false });
    expect(await reading(res.body.id)).toBe("want");
    expect((await call("/books")).body.total).toBe(0);
  });

  it("refuses more than one ownership", async () => {
    const { add } = await setup();
    const res = await add({ ...rose, copy: {}, wantToRead: true });
    expect(res.status).toBe(400);
  });

  it("refuses an unknown person before creating anything", async () => {
    const { add } = await setup();
    const res = await add({ ...rose, borrowedFrom: { id: "nobody" } });
    expect(res.status).toBe(400);
    const again = await add({ ...rose, wantToRead: true });
    expect(again.body.outcome).toBe("created");
  });
});

describe("an ISBN the system knows", () => {
  it("asks before adding a copy to a book the household owns", async () => {
    const { add } = await setup();
    const owned = (await add({ ...rose, copy: {} })).body;
    const res = await add({ ...rose, isbns: ["0-15-600131-4"], copy: {} });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "isbn_taken",
      bookId: owned.id,
    });
  });

  it("moves a wishlist book into the library", async () => {
    const { add, call } = await setup();
    const wished = (await add({ ...rose, wantToRead: true })).body;
    const res = await add({
      title: "Other title",
      isbns: rose.isbns,
      copy: {},
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: wished.id,
      title: "The Name of the Rose",
      outcome: "known",
      copies: [{}],
    });
    expect((await call("/books")).body.total).toBe(1);
  });

  it("adds a borrowed loan, also when the household owns a copy", async () => {
    const { add, call } = await setup();
    const owned = (await add({ ...rose, copy: {} })).body;
    const res = await add({ ...rose, borrowedFrom: { name: "Lena" } });
    expect(res.body).toMatchObject({ id: owned.id, outcome: "known" });
    expect((await call("/loans/borrowed")).body.total).toBe(1);
  });

  it("sets want to read only when the user has no status", async () => {
    const { add, call, reading } = await setup();
    const owned = (await add({ ...rose, copy: {} })).body;
    const first = await add({ ...rose, wantToRead: true });
    expect(first.body).toMatchObject({ outcome: "known", statusKept: false });
    expect(await reading(owned.id)).toBe("want");

    await call(`/reading/books/${owned.id}`, "PUT", { status: "reading" });
    const again = await add({ ...rose, wantToRead: true });
    expect(again.body).toMatchObject({ outcome: "known", statusKept: true });
    expect(await reading(owned.id)).toBe("reading");
  });
});

describe("the same book under another ISBN", () => {
  const hardcover = {
    title: "the name of the rose.",
    authors: [" UMBERTO ECO "],
    isbns: ["9780544176560"],
    copy: {},
  };

  it("asks when title and first author match", async () => {
    const { add } = await setup();
    const existing = (await add({ ...rose, wantToRead: true })).body;
    const res = await add(hardcover);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "same_book",
      bookId: existing.id,
    });
    const otherAuthor = await add({ ...hardcover, authors: ["Someone"] });
    expect(otherAuthor.status).toBe(201);
  });

  it("adds the ISBN and the ownership to that book", async () => {
    const { add, call } = await setup();
    const existing = (await add({ ...rose, wantToRead: true })).body;
    const res = await add({ ...hardcover, attachTo: existing.id });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: existing.id,
      outcome: "attached",
      isbns: ["9780156001311", "9780544176560"],
      copies: [{}],
    });
    expect((await call("/books")).body.total).toBe(1);
  });

  it("keeps a separate book when asked to", async () => {
    const { add } = await setup();
    const existing = (await add({ ...rose, copy: {} })).body;
    const res = await add({ ...hardcover, keepSeparate: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      outcome: "created",
      isbns: ["9780544176560"],
    });
    expect(res.body.id).not.toBe(existing.id);
  });

  it("does not ask for books without an ISBN", async () => {
    const { add } = await setup();
    await add({ ...rose, copy: {} });
    const res = await add({ ...hardcover, isbns: [] });
    expect(res.status).toBe(201);
  });
});
