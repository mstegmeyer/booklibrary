import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test/app.ts";
import { buildEpub, buildPdf, image } from "../../test/epub.ts";
import { recordedResponse } from "../metadata/fixtures/recorded.ts";
import { readEpub } from "./epub.ts";
import { safeName } from "./files.ts";

type BookFile = {
  id: string;
  format: string;
  size: number;
  path: string;
  isProtected: boolean;
  missing: boolean;
};
type Book = {
  id: string;
  title: string;
  coverUrl: string | null;
  copies: unknown[];
  files: BookFile[];
  outcome?: string;
};

async function setup() {
  const app = createTestApp();
  const token = await app.setupAdmin();
  const call = async (path: string, method = "GET", body?: unknown) => {
    const res = await app.request(`/api/v1${path}`, { method, token, body });
    return { status: res.status, body: await res.json() };
  };
  /** A raw response, for files and images. */
  const get = (url: string, signedIn = true) =>
    app.request(url, signedIn ? { token } : {});
  const send = async (
    path: string,
    bytes: Uint8Array,
    name = "book.epub",
    method = "POST",
  ) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), name);
    const res = await app.app.request(`/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    return { status: res.status, body: await res.json() };
  };
  const putCover = async (bookId: string, color?: string) =>
    send(`/books/${bookId}/cover`, await image("png", color), "c.png", "PUT");
  /** Uploads and confirms in one go, as the add dialog does. */
  const addFile = async (bytes: Uint8Array, input: Record<string, unknown>) => {
    const staged = await send("/books/uploads", bytes);
    if (staged.status !== 201) return staged;
    return call("/books", "POST", { ...input, upload: staged.body.id });
  };
  const onDisk = (path: string) => join(app.libraryDir, path);
  const titles = async (query = "") =>
    (await call(`/books?${query}`)).body.items.map((b: Book) => b.title);
  return { call, get, send, putCover, addFile, onDisk, titles };
}

/** Answers lookups with the recorded catalogue data. */
const recordedCatalogues = async (url: string | URL | Request) => {
  const { body, contentType } = recordedResponse(new URL(String(url)));
  return new Response(body, { headers: { "content-type": contentType } });
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("file names", () => {
  it("makes names safe for every file system", () => {
    expect(safeName("Dune: Messiah")).toBe("Dune_ Messiah");
    expect(safeName('a/b\\c?*"<>|')).toBe("a_b_c______");
    expect(safeName("...hidden. ")).toBe("hidden");
    expect(safeName("CON")).toBe("CON_");
    expect(safeName("  many   spaces\t")).toBe("many spaces");
    expect(safeName("x".repeat(300))).toHaveLength(100);
    expect(safeName("???")).toBe("___");
    expect(safeName("Café")).toBe("Café");
  });
});

describe("uploading an EPUB", () => {
  it("previews the file's metadata without saving anything", async () => {
    const { send, titles, get } = await setup();
    const epub = buildEpub({
      title: "The Name of the Rose",
      authors: ["Umberto Eco"],
      language: "en",
      cover: { data: await image("png"), type: "image/png" },
    });
    const res = await send("/books/uploads", epub);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      format: "epub",
      size: epub.length,
      isProtected: false,
      candidate: {
        title: "The Name of the Rose",
        authors: ["Umberto Eco"],
        language: "en",
        isbn13: null,
        coverUrl: null,
        sources: ["epub"],
      },
      fileCoverUrl: `/api/v1/books/uploads/${res.body.id}/cover`,
    });
    const cover = await get(res.body.fileCoverUrl);
    expect(cover.status).toBe(200);
    expect(await titles()).toEqual([]);
  });

  it("completes the file's metadata from the catalogues by its ISBN", async () => {
    vi.stubGlobal("fetch", vi.fn(recordedCatalogues));
    const { send } = await setup();
    const res = await send(
      "/books/uploads",
      buildEpub({ title: "Fantastic Mr Fox", isbn: "0-14-032872-6" }),
    );
    expect(res.body.candidate).toMatchObject({
      isbn13: "9780140328721",
      title: "Fantastic Mr Fox",
      authors: ["Roald Dahl"],
      pageCount: 96,
      sources: ["epub", "openlibrary"],
    });
    expect(res.body.candidate.coverUrl).toMatch(/^https:/);
  });

  it("stores the confirmed book in the library folder with the metadata written in", async () => {
    const { addFile, onDisk, call, titles } = await setup();
    const res = await addFile(
      buildEpub({ title: "Name of the Rose", authors: ["U. Eco"] }),
      {
        title: "The Name of the Rose",
        authors: ["Umberto Eco"],
        sources: ["epub"],
      },
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      outcome: "created",
      metadataSource: "epub",
      copies: [],
      files: [
        {
          format: "epub",
          path: "Eco, Umberto/The Name of the Rose.epub",
          isProtected: false,
          missing: false,
        },
      ],
    });
    const stored = readFileSync(onDisk(res.body.files[0].path));
    expect(res.body.files[0].size).toBe(stored.length);
    expect(readEpub(stored)).toMatchObject({
      title: "The Name of the Rose",
      authors: ["Umberto Eco"],
    });
    expect(await titles()).toEqual(["The Name of the Rose"]);
    expect(await titles("format=ebook")).toEqual(["The Name of the Rose"]);
    expect(await titles("format=print")).toEqual([]);
    expect((await call("/books/summary")).body.books).toBe(1);
  });

  it("takes the EPUB's cover and leaves it in the file as it is", async () => {
    const { addFile, onDisk } = await setup();
    const png = await image("png");
    const res = await addFile(
      buildEpub({ title: "Momo", cover: { data: png, type: "image/png" } }),
      { title: "Momo", authors: ["Michael Ende"] },
    );
    expect(res.body.coverUrl).not.toBeNull();
    const stored = readEpub(readFileSync(onDisk(res.body.files[0].path)));
    expect(stored.cover).toEqual(png);
  });

  it("writes the book's cover into an EPUB added to a book that has one", async () => {
    const { call, send, putCover, onDisk } = await setup();
    const book = (await call("/books", "POST", { title: "Dune", copy: {} }))
      .body as Book;
    await putCover(book.id);

    const res = await send(
      `/books/${book.id}/files`,
      buildEpub({ title: "Dune" }),
    );
    expect(res.status).toBe(201);
    const cover = readEpub(readFileSync(onDisk(res.body.files[0].path))).cover;
    expect(cover?.subarray(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));
  });

  it("keeps a copy-protected EPUB as it is and marks it", async () => {
    const { addFile, onDisk } = await setup();
    const epub = buildEpub({
      title: "Locked",
      authors: ["A. Author"],
      encryption: "drm",
    });
    const res = await addFile(epub, { title: "Unlocked", authors: ["B"] });
    expect(res.body.files).toMatchObject([
      { isProtected: true, path: "B/Unlocked.epub" },
    ]);
    expect(readFileSync(onDisk(res.body.files[0].path))).toEqual(
      Buffer.from(epub),
    );
  });

  it("refuses a file that is already in the library", async () => {
    const { addFile, send, onDisk } = await setup();
    const epub = buildEpub({ title: "Dune" });
    const first = await addFile(epub, {
      title: "Dune",
      authors: ["Frank Herbert"],
    });
    const duplicate = { code: "duplicate_file", bookId: first.body.id };

    const again = await send("/books/uploads", epub);
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject(duplicate);
    // The stored file has the metadata written in, and is refused as well.
    const stored = readFileSync(onDisk(first.body.files[0].path));
    expect(stored).not.toEqual(Buffer.from(epub));
    expect((await send("/books/uploads", stored)).body.error).toMatchObject(
      duplicate,
    );
  });

  it("refuses files that are neither EPUB nor PDF", async () => {
    const { send } = await setup();
    const res = await send("/books/uploads", new TextEncoder().encode("hello"));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("unsupported_file");
  });
});

describe("uploading a PDF", () => {
  it("stores the file as it is under the book the user identified", async () => {
    const { send, call, onDisk } = await setup();
    const pdf = buildPdf();
    const staged = await send("/books/uploads", pdf, "scan.pdf");
    expect(staged.body).toMatchObject({
      format: "pdf",
      candidate: null,
      fileCoverUrl: null,
      isProtected: false,
    });
    const res = await call("/books", "POST", {
      title: "Middlemarch",
      authors: ["George Eliot"],
      upload: staged.body.id,
    });
    expect(res.body.files).toMatchObject([
      { format: "pdf", path: "Eliot, George/Middlemarch.pdf" },
    ]);
    expect(readFileSync(onDisk(res.body.files[0].path))).toEqual(
      Buffer.from(pdf),
    );
  });

  it("refuses an expired or unknown upload", async () => {
    const { call } = await setup();
    const res = await call("/books", "POST", {
      title: "X",
      upload: "00000000-0000-0000-0000-000000000000.pdf",
    });
    expect(res.status).toBe(404);
    expect((await call("/books")).body.total).toBe(0);
  });
});

describe("attaching to known books", () => {
  it("attaches the file to the book with the same ISBN", async () => {
    const { call, addFile } = await setup();
    const known = (
      await call("/books", "POST", {
        title: "Der Vorleser",
        isbns: ["9783257229530"],
        copy: {},
      })
    ).body as Book;
    const res = await addFile(buildPdf(), {
      title: "The Reader",
      isbns: ["9783257229530"],
    });
    expect(res.body).toMatchObject({
      id: known.id,
      outcome: "known",
      copies: [{}],
      files: [{ format: "pdf", path: "Unknown author/Der Vorleser.pdf" }],
    });
  });

  it("moves a wishlist book into the library", async () => {
    const { call, addFile, titles } = await setup();
    const wanted = (
      await call("/books", "POST", {
        title: "Piranesi",
        authors: ["Susanna Clarke"],
        isbns: ["9781635575637"],
        wantToRead: true,
      })
    ).body as Book;
    expect(await titles()).toEqual([]);
    const wishlist = () => call("/reading/want?reach=wishlist");
    expect((await wishlist()).body.total).toBe(1);

    const res = await addFile(buildEpub({ title: "Piranesi" }), {
      title: "Piranesi",
      isbns: ["9781635575637"],
    });
    expect(res.body).toMatchObject({ id: wanted.id, outcome: "known" });
    expect(await titles()).toEqual(["Piranesi"]);
    expect((await wishlist()).body.total).toBe(0);
    expect((await call("/reading/want?reach=within")).body.total).toBe(1);
  });

  it("asks whether a file without ISBN belongs to the book with its title and author", async () => {
    const { call, send } = await setup();
    const known = (
      await call("/books", "POST", {
        title: "Stoner",
        authors: ["John Williams"],
        copy: {},
      })
    ).body as Book;
    const staged = await send("/books/uploads", buildPdf());
    const input = {
      title: "Stoner",
      authors: ["John Williams"],
      upload: staged.body.id,
    };

    const asked = await call("/books", "POST", input);
    expect(asked.status).toBe(409);
    expect(asked.body.error).toMatchObject({
      code: "same_book",
      bookId: known.id,
    });

    const res = await call("/books", "POST", { ...input, attachTo: known.id });
    expect(res.body).toMatchObject({ id: known.id, outcome: "attached" });
    expect(res.body.files).toHaveLength(1);
  });

  it("asks before replacing the known book's file of the same format", async () => {
    const { call, send } = await setup();
    const book = (
      await call("/books", "POST", {
        title: "Dune",
        isbns: ["9780441172719"],
        copy: {},
      })
    ).body as Book;
    await send(`/books/${book.id}/files`, buildPdf("first"));
    const staged = await send("/books/uploads", buildPdf("second"));
    const input = {
      title: "Dune",
      isbns: ["9780441172719"],
      upload: staged.body.id,
    };

    const asked = await call("/books", "POST", input);
    expect(asked.status).toBe(409);
    expect(asked.body.error).toMatchObject({
      code: "format_exists",
      bookId: book.id,
    });
    const res = await call("/books", "POST", { ...input, replace: true });
    expect(res.body).toMatchObject({
      outcome: "known",
      files: [{ format: "pdf" }],
    });
  });

  it("stores the lookup's cover on a known book that has none", async () => {
    const { call } = await setup();
    const known = (
      await call("/books", "POST", {
        title: "Dune",
        isbns: ["9780441172719"],
        wantToRead: true,
      })
    ).body as Book;
    expect(known.coverUrl).toBeNull();
    const png = await image("png");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(png, { headers: { "content-type": "image/png" } }),
      ),
    );
    const res = await call("/books", "POST", {
      title: "Dune",
      isbns: ["9780441172719"],
      copy: {},
      coverUrl: "https://covers.openlibrary.org/b/id/1-L.jpg",
    });
    expect(res.body).toMatchObject({ id: known.id, outcome: "known" });
    expect(res.body.coverUrl).not.toBeNull();
  });
});

describe("one file per format", () => {
  it("asks before replacing and then replaces", async () => {
    const { call, send, onDisk } = await setup();
    const book = (await call("/books", "POST", { title: "Dune", copy: {} }))
      .body as Book;
    const first = await send(`/books/${book.id}/files`, buildPdf("first"));
    expect(first.status).toBe(201);

    const second = await send(`/books/${book.id}/files`, buildPdf("second"));
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({
      code: "format_exists",
      bookId: book.id,
    });

    const replaced = await send(
      `/books/${book.id}/files?replace=true`,
      buildPdf("second"),
    );
    expect(replaced.status).toBe(201);
    expect(replaced.body.files).toHaveLength(1);
    expect(
      readFileSync(onDisk(replaced.body.files[0].path), "latin1"),
    ).toContain("second");
    expect(readdirSync(onDisk("Unknown author"))).toEqual(["Dune.pdf"]);
  });

  it("keeps an EPUB and a PDF side by side", async () => {
    const { call, send } = await setup();
    const book = (await call("/books", "POST", { title: "Dune", copy: {} }))
      .body as Book;
    await send(`/books/${book.id}/files`, buildPdf());
    const res = await send(
      `/books/${book.id}/files`,
      buildEpub({ title: "Dune" }),
    );
    expect(res.body.files.map((f: BookFile) => f.path)).toEqual([
      "Unknown author/Dune.epub",
      "Unknown author/Dune.pdf",
    ]);
  });
});

describe("the folder follows the catalogue", () => {
  it("moves files and writes the new title when the book is renamed", async () => {
    const { addFile, call, onDisk } = await setup();
    const added = await addFile(buildEpub({ title: "Rose" }), {
      title: "The Name of the Rose",
      authors: ["Umberto Eco"],
    });
    const old = added.body.files[0].path;

    const renamed = await call(`/books/${added.body.id}`, "PATCH", {
      title: "Der Name der Rose",
    });
    const path = renamed.body.files[0].path;
    expect(path).toBe("Eco, Umberto/Der Name der Rose.epub");
    expect(existsSync(onDisk(old))).toBe(false);
    expect(readEpub(readFileSync(onDisk(path))).title).toBe(
      "Der Name der Rose",
    );
    expect(renamed.body.files[0].size).toBe(readFileSync(onDisk(path)).length);

    const resorted = await call(`/books/${added.body.id}`, "PATCH", {
      sortAs: "Eco, U.",
    });
    expect(resorted.body.files[0].path).toBe("Eco, U/Der Name der Rose.epub");
    // The old author folder went with its last file.
    expect(existsSync(onDisk("Eco, Umberto"))).toBe(false);
  });

  it("numbers a name that is taken, ignoring case", async () => {
    const { addFile } = await setup();
    const first = await addFile(buildPdf("1"), {
      title: "Poems",
      authors: ["Anon Ymous"],
    });
    const second = await addFile(buildPdf("2"), {
      title: "poems",
      authors: ["Anon Ymous"],
      keepSeparate: true,
    });
    expect(first.body.files[0].path).toBe("Ymous, Anon/Poems.pdf");
    expect(second.body.files[0].path).toBe("Ymous, Anon/poems (2).pdf");
  });

  it("writes a new cover into the EPUB", async () => {
    const { addFile, putCover, onDisk } = await setup();
    const added = await addFile(buildEpub({ title: "Momo" }), {
      title: "Momo",
    });
    await putCover(added.body.id, "#123456");
    const cover = readEpub(
      readFileSync(onDisk(added.body.files[0].path)),
    ).cover;
    expect(cover?.subarray(0, 2)).toEqual(new Uint8Array([0xff, 0xd8]));
  });
});

describe("downloading and removing", () => {
  it("downloads the file with its name", async () => {
    const { addFile, get } = await setup();
    const added = await addFile(buildEpub({ title: "Jugend" }), {
      title: "Jugend ohne Gott",
      authors: ["Ödön von Horváth"],
    });
    const file = added.body.files[0];
    const res = await get(`/api/v1/books/${added.body.id}/files/${file.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/epub+zip");
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="Jugend ohne Gott.epub"; filename*=UTF-8''Jugend%20ohne%20Gott.epub`,
    );
    expect((await res.arrayBuffer()).byteLength).toBe(file.size);
  });

  it("downloads only for signed-in users", async () => {
    const { addFile, get } = await setup();
    const added = await addFile(buildPdf(), { title: "Secret" });
    const res = await get(
      `/api/v1/books/${added.body.id}/files/${added.body.files[0].id}`,
      false,
    );
    expect(res.status).toBe(401);
  });

  it("removes a file from disk and keeps the book while a copy remains", async () => {
    const { call, send, onDisk } = await setup();
    const book = (await call("/books", "POST", { title: "Dune", copy: {} }))
      .body as Book;
    const added = await send(`/books/${book.id}/files`, buildPdf());
    const file = added.body.files[0];
    const res = await call(`/books/${book.id}/files/${file.id}`, "DELETE");
    expect(res.body).toEqual({ bookKept: true });
    expect(existsSync(onDisk(file.path))).toBe(false);
    expect((await call(`/books/${book.id}`)).body.files).toEqual([]);
  });

  it("deletes the book with its last file when nothing else refers to it", async () => {
    const { addFile, call } = await setup();
    const added = await addFile(buildPdf(), { title: "Gone" });
    const res = await call(
      `/books/${added.body.id}/files/${added.body.files[0].id}`,
      "DELETE",
    );
    expect(res.body).toEqual({ bookKept: false });
    expect((await call(`/books/${added.body.id}`)).status).toBe(404);
  });

  it("shows a file deleted outside the app as missing and lets it be removed", async () => {
    const { addFile, call, onDisk } = await setup();
    const added = await addFile(buildEpub({ title: "Lost" }), {
      title: "Lost",
    });
    const file = added.body.files[0];
    rmSync(onDisk(file.path));

    const book = (await call(`/books/${added.body.id}`)).body;
    expect(book.files).toMatchObject([{ id: file.id, missing: true }]);
    // A rename leaves a missing file where the catalogue had it.
    const renamed = await call(`/books/${added.body.id}`, "PATCH", {
      title: "Found",
    });
    expect(renamed.body.files[0].path).toBe(file.path);

    const res = await call(
      `/books/${added.body.id}/files/${file.id}`,
      "DELETE",
    );
    expect(res.body).toEqual({ bookKept: false });
  });
});

describe("borrowing from the add dialog", () => {
  it("starts the loan on the day the client sends", async () => {
    const { call } = await setup();
    await call("/books", "POST", {
      title: "Lent to us",
      borrowedFrom: { name: "Lena" },
      borrowedOn: "2026-11-13",
    });
    const loans = (await call("/loans/borrowed")).body.items;
    expect(loans).toMatchObject([{ startedOn: "2026-11-13" }]);
  });
});
