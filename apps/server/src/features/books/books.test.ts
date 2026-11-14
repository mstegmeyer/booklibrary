import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contact,
  loan,
  reading,
  readingProgress,
  user,
} from "../../db/schema.ts";
import { createTestApp } from "../../test/app.ts";
import { recordedResponse } from "../metadata/fixtures/recorded.ts";
import { deleteBookIfUnreferenced } from "./service.ts";
import { guessSortKey } from "./sort-key.ts";

type Book = {
  id: string;
  copies: { id: string; location: { path: string[] } | null }[];
};

async function setup() {
  const app = createTestApp();
  const token = await app.setupAdmin();
  const userId = app.db.select({ id: user.id }).from(user).get()?.id ?? "";
  const call = async (path: string, method = "GET", body?: unknown) => {
    const res = await app.request(`/api/v1${path}`, { method, token, body });
    return { status: res.status, body: await res.json() };
  };
  const addBook = async (input: Record<string, unknown>) => {
    const res = await call("/books", "POST", { copy: {}, ...input });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    return res.body as Book;
  };
  const titles = async (query = "") =>
    (await call(`/books?${query}`)).body.items.map(
      (b: { title: string }) => b.title,
    );
  const lend = (bookId: string, copyId: string, endedOn?: string) => {
    const lena = app.db
      .insert(contact)
      .values({ name: "Lena K." })
      .returning()
      .get();
    app.db
      .insert(loan)
      .values({
        direction: "lent",
        bookId,
        copyId,
        contactId: lena.id,
        startedOn: "2026-10-02",
        endedOn,
      })
      .run();
  };
  const read = (bookId: string, status: "want" | "reading" | "read") =>
    app.db.insert(reading).values({ userId, bookId, status }).returning().get();
  return { ...app, token, call, addBook, titles, lend, read };
}

describe("sort key guess", () => {
  it.each([
    [["Umberto Eco"], "Eco, Umberto"],
    [["Ursula K. Le Guin", "Someone Else"], "Le Guin, Ursula K."],
    [["Ludwig van Beethoven"], "van Beethoven, Ludwig"],
    [["Johann Wolfgang von Goethe"], "von Goethe, Johann Wolfgang"],
    [["Michael Ende"], "Ende, Michael"],
    [["Cicero"], "Cicero"],
    [["Eco, Umberto"], "Eco, Umberto"],
    [[], ""],
  ])("%j sorts as %j", (authors, key) => {
    expect(guessSortKey(authors)).toBe(key);
  });
});

describe("books", () => {
  it("creates a book with normalised ISBNs and a first copy", async () => {
    const { call, addBook } = await setup();
    const shelf = (await call("/locations", "POST", { name: "Shelf A" })).body;
    const book = await addBook({
      title: "The Name of the Rose",
      authors: ["Umberto Eco"],
      pageCount: 536,
      publishedYear: 1983,
      isbns: ["0-15-600131-4", "978-0-15-600131-1"],
      copy: { locationId: shelf.id, format: "paperback" },
    });
    expect(book).toMatchObject({
      title: "The Name of the Rose",
      isbns: ["9780156001311"],
      createdBy: { name: "Admin" },
      copies: [{ format: "paperback", location: { path: ["Shelf A"] } }],
    });

    const invalid = await call("/books", "POST", {
      title: "X",
      isbns: ["0-15-600131-3"],
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      error: { code: "validation_failed" },
    });
  });

  it("answers 409 with the existing book for a known ISBN", async () => {
    const { call, addBook } = await setup();
    const rose = await addBook({ title: "Rose", isbns: ["9780156001311"] });
    const other = await addBook({ title: "Dune" });

    const created = await call("/books", "POST", {
      title: "Rose again",
      isbns: ["0156001314"],
    });
    expect(created.status).toBe(409);
    expect(created.body).toMatchObject({
      error: { code: "isbn_taken", bookId: rose.id },
    });

    const edited = await call(`/books/${other.id}`, "PATCH", {
      isbns: ["9780156001311"],
    });
    expect(edited.status).toBe(409);
    expect(edited.body.error.bookId).toBe(rose.id);

    const own = await call(`/books/${rose.id}`, "PATCH", {
      title: "The Name of the Rose",
      isbns: ["9780156001311", "9780544176560"],
    });
    expect(own.status).toBe(200);
    expect(own.body.isbns).toEqual(["9780156001311", "9780544176560"]);
  });

  it("lists only owned books", async () => {
    const { call, addBook, titles } = await setup();
    await addBook({ title: "Owned" });
    await call("/books", "POST", { title: "Not owned" });
    expect(await titles()).toEqual(["Owned"]);
  });

  it("searches title, authors and ISBN", async () => {
    const { addBook, titles } = await setup();
    await addBook({ title: "Dune", authors: ["Frank Herbert"] });
    await addBook({
      title: "The Name of the Rose",
      authors: ["Umberto Eco"],
      isbns: ["9780156001311"],
    });
    await addBook({ title: "100% Pure", authors: [] });

    expect(await titles("q=dun")).toEqual(["Dune"]);
    expect(await titles("q=eco")).toEqual(["The Name of the Rose"]);
    expect(await titles("q=600131")).toEqual(["The Name of the Rose"]);
    expect(await titles("q=0-15-600131-4")).toEqual(["The Name of the Rose"]);
    expect(await titles("q=%25")).toEqual(["100% Pure"]);
    expect(await titles("q=nothing")).toEqual([]);
  });

  it("filters by location including the locations inside", async () => {
    const { call, addBook, titles } = await setup();
    const home = (await call("/locations", "POST", { name: "Home" })).body;
    const shelf = (
      await call("/locations", "POST", { name: "Shelf", parentId: home.id })
    ).body;
    const lake = (await call("/locations", "POST", { name: "Lake" })).body;
    await addBook({ title: "On shelf", copy: { locationId: shelf.id } });
    await addBook({ title: "At home", copy: { locationId: home.id } });
    await addBook({ title: "At the lake", copy: { locationId: lake.id } });

    expect(await titles(`locationId=${home.id}&sort=title`)).toEqual([
      "At home",
      "On shelf",
    ]);
    expect(await titles(`locationId=${shelf.id}`)).toEqual(["On shelf"]);
  });

  it("filters by availability", async () => {
    const { addBook, call, titles, lend } = await setup();
    await addBook({ title: "Shelved" });
    const lent = await addBook({ title: "Lent" });
    lend(lent.id, lent.copies[0]?.id ?? "");
    const both = await addBook({ title: "Both" });
    await call(`/books/${both.id}/copies`, "POST", {});
    lend(both.id, both.copies[0]?.id ?? "");
    const returned = await addBook({ title: "Returned" });
    lend(returned.id, returned.copies[0]?.id ?? "", "2026-10-10");

    expect(await titles("availability=shelf&sort=title")).toEqual([
      "Both",
      "Returned",
      "Shelved",
    ]);
    expect(await titles("availability=lent&sort=title")).toEqual([
      "Both",
      "Lent",
    ]);

    const items = (await call("/books?sort=title")).body.items;
    expect(
      items.find((b: { title: string }) => b.title === "Lent"),
    ).toMatchObject({ availability: "lent", lentTo: "Lena K.", copyCount: 1 });
    expect(
      items.find((b: { title: string }) => b.title === "Both"),
    ).toMatchObject({ availability: "shelf", lentTo: null, copyCount: 2 });
  });

  it("filters by the current user's reading status and shows progress", async () => {
    const { db, addBook, titles, read, call } = await setup();
    const want = await addBook({ title: "Want" });
    read(want.id, "want");
    const current = await addBook({ title: "Reading", pageCount: 200 });
    const session = read(current.id, "reading");
    db.insert(readingProgress)
      .values([
        { readingId: session.id, date: "2026-11-01", page: 40 },
        { readingId: session.id, date: "2026-11-02", page: 81 },
      ])
      .run();
    const reread = await addBook({ title: "Read" });
    read(reread.id, "reading");
    await new Promise((resolve) => setTimeout(resolve, 2));
    read(reread.id, "read");
    await addBook({ title: "None" });

    expect(await titles("reading=want")).toEqual(["Want"]);
    expect(await titles("reading=reading")).toEqual(["Reading"]);
    expect(await titles("reading=read")).toEqual(["Read"]);
    expect(await titles("reading=abandoned")).toEqual([]);
    expect(await titles("reading=none")).toEqual(["None"]);

    const [item] = (await call("/books?reading=reading")).body.items;
    expect(item.reading).toEqual({ status: "reading", progress: 41 });
  });

  it("sorts by recently added, title and author", async () => {
    const { addBook, titles } = await setup();
    for (const [title, author] of [
      ["middlemarch", "George Eliot"],
      ["Dune", "Frank Herbert"],
      ["Anonymous tales", undefined],
      ["Momo", "Michael Ende"],
    ]) {
      await addBook({ title, authors: author ? [author] : [] });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(await titles()).toEqual([
      "Momo",
      "Anonymous tales",
      "Dune",
      "middlemarch",
    ]);
    expect(await titles("sort=title")).toEqual([
      "Anonymous tales",
      "Dune",
      "middlemarch",
      "Momo",
    ]);
    expect(await titles("sort=author")).toEqual([
      "middlemarch",
      "Momo",
      "Dune",
      "Anonymous tales",
    ]);
  });

  it("sorts by author surname, then title, with authorless books last", async () => {
    const { addBook, titles } = await setup();
    for (const [title, author] of [
      ["Untitled", undefined],
      ["The Name of the Rose", "Umberto Eco"],
      ["Foucault's Pendulum", "umberto eco"],
      ["Wizard of Earthsea", "Ursula K. Le Guin"],
      ["Symphonies", "Ludwig van Beethoven"],
      ["Rome", "Cicero"],
      ["Akira", "Katsuhiro Otomo"],
    ]) {
      await addBook({ title, authors: author ? [author] : [] });
    }
    expect(await titles("sort=author")).toEqual([
      "Rome",
      "Foucault's Pendulum",
      "The Name of the Rose",
      "Wizard of Earthsea",
      "Akira",
      "Symphonies",
      "Untitled",
    ]);
  });

  it("guesses the sort key and lets an edit override or reset it", async () => {
    const { addBook, call, titles } = await setup();
    const eco = await addBook({ title: "Baudolino", authors: ["Umberto Eco"] });
    await addBook({ title: "Dune", authors: ["Frank Herbert"] });
    expect((await call(`/books/${eco.id}`)).body.sortAs).toBe("Eco, Umberto");

    let res = await call(`/books/${eco.id}`, "PATCH", { sortAs: "Zeta" });
    expect(res.body.sortAs).toBe("Zeta");
    expect(await titles("sort=author")).toEqual(["Dune", "Baudolino"]);

    res = await call(`/books/${eco.id}`, "PATCH", { title: "Baudolino" });
    expect(res.body.sortAs).toBe("Zeta");

    res = await call(`/books/${eco.id}`, "PATCH", { sortAs: "" });
    expect(res.body.sortAs).toBe("Eco, Umberto");

    await call(`/books/${eco.id}`, "PATCH", { sortAs: "Zeta" });
    res = await call(`/books/${eco.id}`, "PATCH", {
      authors: ["Italo Calvino"],
      sortAs: "",
    });
    expect(res.body.sortAs).toBe("Calvino, Italo");
    expect(res.body.authors).toEqual(["Italo Calvino"]);
  });

  it("pages through the library with a cursor in every sort", async () => {
    const { addBook, call } = await setup();
    const all: string[] = [];
    for (let i = 0; i < 7; i++) {
      const title = `Book ${i}`;
      all.push(title);
      const author = i % 2 ? "Same" : `Author ${i}`;
      await addBook({ title, authors: i % 3 ? [author] : [] });
    }
    for (const sort of ["added", "title", "author"]) {
      const seen: string[] = [];
      let cursor = "";
      do {
        const { body } = await call(
          `/books?sort=${sort}&limit=3${cursor ? `&cursor=${cursor}` : ""}`,
        );
        expect(body.items.length).toBeLessThanOrEqual(3);
        expect(body.total).toBe(7);
        seen.push(...body.items.map((b: { title: string }) => b.title));
        cursor = body.nextCursor ?? "";
      } while (cursor);
      expect([...seen].sort()).toEqual(all);
      expect(new Set(seen).size).toBe(7);
    }
  });

  it("summarises the library", async () => {
    const { call, addBook, lend } = await setup();
    const home = (await call("/locations", "POST", { name: "Home" })).body;
    await call("/locations", "POST", { name: "Room", parentId: home.id });
    await call("/locations", "POST", { name: "Lake house" });
    const dune = await addBook({ title: "Dune" });
    lend(dune.id, dune.copies[0]?.id ?? "");
    await addBook({ title: "Momo" });
    await call("/books", "POST", { title: "Not owned" });

    expect((await call("/books/summary")).body).toEqual({
      books: 2,
      places: 2,
      lentOut: 1,
    });
  });

  it("shows copies with their location and active loan", async () => {
    const { call, addBook, lend } = await setup();
    const home = (await call("/locations", "POST", { name: "Home" })).body;
    const shelf = (
      await call("/locations", "POST", { name: "Shelf A", parentId: home.id })
    ).body;
    const book = await addBook({
      title: "Dune",
      copy: { locationId: shelf.id },
    });
    lend(book.id, book.copies[0]?.id ?? "");

    const { body } = await call(`/books/${book.id}`);
    expect(body.copies).toEqual([
      {
        id: book.copies[0]?.id,
        format: null,
        note: null,
        location: { id: shelf.id, path: ["Home", "Shelf A"] },
        loan: { contactName: "Lena K.", startedOn: "2026-10-02" },
      },
    ]);
  });

  it("moves and edits a copy", async () => {
    const { call, addBook } = await setup();
    const shelf = (await call("/locations", "POST", { name: "Shelf" })).body;
    const book = await addBook({ title: "Dune" });
    const copyId = book.copies[0]?.id;

    const res = await call(`/books/${book.id}/copies/${copyId}`, "PATCH", {
      locationId: shelf.id,
      format: "hardcover",
      note: "Signed",
    });
    expect(res.status).toBe(200);
    expect(res.body.copies[0]).toMatchObject({
      format: "hardcover",
      note: "Signed",
      location: { path: ["Shelf"] },
    });

    const unknown = await call(`/books/${book.id}/copies/${copyId}`, "PATCH", {
      locationId: "missing",
    });
    expect(unknown.status).toBe(400);
  });
});

describe("removing copies", () => {
  it("refuses to remove a lent copy", async () => {
    const { call, addBook, lend } = await setup();
    const book = await addBook({ title: "Dune" });
    lend(book.id, book.copies[0]?.id ?? "");
    const res = await call(
      `/books/${book.id}/copies/${book.copies[0]?.id}`,
      "DELETE",
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "copy_lent" } });
  });

  it("deletes the book with its last copy when nothing else refers to it", async () => {
    const { call, addBook } = await setup();
    const book = await addBook({ title: "Dune", isbns: ["9780156001311"] });
    await call(`/books/${book.id}/copies`, "POST", {});
    const copies = (await call(`/books/${book.id}`)).body.copies;

    const first = await call(
      `/books/${book.id}/copies/${copies[0].id}`,
      "DELETE",
    );
    expect(first.body).toEqual({ bookKept: true });
    const last = await call(
      `/books/${book.id}/copies/${copies[1].id}`,
      "DELETE",
    );
    expect(last.body).toEqual({ bookKept: false });
    expect((await call(`/books/${book.id}`)).status).toBe(404);
    // The ISBN is free again.
    await addBook({ title: "Dune", isbns: ["9780156001311"] });
  });

  it("keeps the book when someone has a reading record for it", async () => {
    const { call, addBook, read, titles } = await setup();
    const book = await addBook({ title: "Dune" });
    read(book.id, "read");
    const res = await call(
      `/books/${book.id}/copies/${book.copies[0]?.id}`,
      "DELETE",
    );
    expect(res.body).toEqual({ bookKept: true });
    expect((await call(`/books/${book.id}`)).status).toBe(200);
    expect(await titles()).toEqual([]);
  });

  it("keeps the book when it has a loan record", async () => {
    const { db, addBook } = await setup();
    const book = await addBook({ title: "Dune" });
    const lena = db.insert(contact).values({ name: "Lena" }).returning().get();
    db.insert(loan)
      .values({
        direction: "borrowed",
        bookId: book.id,
        contactId: lena.id,
        startedOn: "2026-10-02",
      })
      .run();
    expect(await deleteBookIfUnreferenced(db, book.id)).toEqual({
      kept: true,
    });
  });

  it("deletes a book without references and its cover files", async () => {
    const { app, db, call, token } = await setup();
    const book = (await call("/books", "POST", { title: "Dune" })).body;
    expect((await uploadCover(app, token, book.id)).status).toBe(200);
    const covers = join(dirname(db.$client.name), "covers");
    expect(readdirSync(covers)).toHaveLength(2);

    expect(await deleteBookIfUnreferenced(db, book.id)).toEqual({
      kept: false,
    });
    expect(readdirSync(covers)).toHaveLength(0);
  });
});

describe("covers", () => {
  it("stores a cover and a thumbnail and serves both", async () => {
    const { app, db, request, token, addBook } = await setup();
    const book = await addBook({ title: "Dune" });

    const res = await uploadCover(app, token, book.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coverUrl).toMatch(/^\/api\/v1\/books\/.+\/cover\?v=/);

    const full = await request(body.coverUrl, { token });
    expect(full.headers.get("content-type")).toBe("image/jpeg");
    const thumb = await request(body.thumbnailUrl, { token });
    expect((await sharp(await full.arrayBuffer()).metadata()).width).toBe(600);
    expect((await sharp(await thumb.arrayBuffer()).metadata()).width).toBe(320);

    const covers = join(dirname(db.$client.name), "covers");
    await uploadCover(app, token, book.id);
    expect(readdirSync(covers)).toHaveLength(2);
    expect(existsSync(join(covers, body.coverUrl.split("v=")[1]))).toBe(false);
  });

  it("rejects files that are not images", async () => {
    const { app, token, addBook } = await setup();
    const book = await addBook({ title: "Dune" });
    const res = await uploadCover(app, token, book.id, new Blob(["text"]));
    expect(res.status).toBe(400);
  });
});

describe("looking up a cover", () => {
  /** The recorded catalogue answers, with an image for every cover found. */
  async function stubCatalogues() {
    const png = await sharp({
      create: { width: 40, height: 60, channels: 3, background: "#2e4a62" },
    })
      .png()
      .toBuffer();
    const fetch = vi.fn(async (input: URL) => {
      const { status, body, contentType } = recordedResponse(new URL(input));
      return status === 200 && contentType.startsWith("image/")
        ? new Response(new Uint8Array(png), {
            headers: { "content-type": "image/png" },
          })
        : new Response(body, {
            status,
            headers: { "content-type": contentType },
          });
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("DNB_COVERS_URL", "https://portal.dnb.de/opac/mvb/cover");
    return fetch;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("tries the book's ISBNs in turn and stores the first cover found", async () => {
    const { call, request, token, addBook } = await setup();
    const book = await addBook({
      title: "Der Teepalast",
      isbns: ["9780000000002", "9783442492114"],
    });
    await stubCatalogues();
    const res = await call(`/books/${book.id}/cover/lookup`, "POST");
    expect(res.status).toBe(200);
    expect(res.body.coverUrl).toMatch(/^\/api\/v1\/books\/.+\/cover\?v=/);
    const cover = await request(res.body.coverUrl, { token });
    expect(cover.headers.get("content-type")).toBe("image/jpeg");
  });

  it("answers 404 when no catalogue has a cover", async () => {
    const { call, addBook } = await setup();
    const book = await addBook({ title: "Codex", isbns: ["9780000000002"] });
    await stubCatalogues();
    const res = await call(`/books/${book.id}/cover/lookup`, "POST");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "cover_not_found" } });
    expect((await call(`/books/${book.id}`)).body.coverUrl).toBeNull();
  });

  it("answers 502 when the catalogues cannot be reached", async () => {
    const { call, addBook } = await setup();
    const book = await addBook({ title: "Codex", isbns: ["9783442492114"] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const res = await call(`/books/${book.id}/cover/lookup`, "POST");
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: { code: "metadata_unavailable" } });
  });

  it("answers 404 for a book without ISBNs without asking anyone", async () => {
    const { call, addBook } = await setup();
    const book = await addBook({ title: "Codex" });
    const fetch = await stubCatalogues();
    const res = await call(`/books/${book.id}/cover/lookup`, "POST");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "cover_not_found" } });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("OpenAPI", () => {
  it("documents the catalogue routes", async () => {
    const { request } = createTestApp();
    const res = await request("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    const { paths } = await res.json();
    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining([
        "/api/v1/books/{id}/cover",
        "/api/v1/books/{id}/copies/{copyId}",
        "/api/v1/locations/{id}",
      ]),
    );
  });
});

async function uploadCover(
  app: ReturnType<typeof createTestApp>["app"],
  token: string,
  bookId: string,
  file?: Blob,
) {
  const image =
    file ??
    new Blob([
      new Uint8Array(
        await sharp({
          create: {
            width: 600,
            height: 900,
            channels: 3,
            background: "#6e2f2a",
          },
        })
          .png()
          .toBuffer(),
      ),
    ]);
  const form = new FormData();
  form.set("file", image, "cover.png");
  return app.request(`/api/v1/books/${bookId}/cover`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
}
