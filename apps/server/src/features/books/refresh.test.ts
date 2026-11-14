import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test/app.ts";
import { recordedResponse } from "../metadata/fixtures/recorded.ts";

async function setup() {
  const app = createTestApp();
  const token = await app.setupAdmin();
  const call = async (path: string, method = "GET", body?: unknown) => {
    const res = await app.request(`/api/v1${path}`, { method, token, body });
    return { status: res.status, body: await res.json() };
  };
  const genreId = async (key: string) =>
    (await call("/genres")).body.items.find(
      (g: { key: string }) => g.key === key,
    )?.id;
  return { ...app, call, genreId };
}

/** The recorded catalogues, with a real image for every cover. */
async function stubCatalogues() {
  vi.stubEnv("DNB_COVERS_URL", "https://portal.dnb.de/opac/mvb/cover");
  const png = await sharp({
    create: { width: 4, height: 6, channels: 3, background: "#aa5500" },
  })
    .png()
    .toBuffer();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL) => {
      const url = new URL(input);
      const { status, body, contentType } = recordedResponse(url);
      const isImage =
        /\/b\/id\/|books\/content/.test(url.pathname) ||
        (status === 200 && contentType.startsWith("image/"));
      return isImage
        ? new Response(new Uint8Array(png), {
            headers: { "content-type": "image/png" },
          })
        : new Response(body, {
            status,
            headers: { "content-type": contentType },
          });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("updating a book from the catalogues", () => {
  it("replaces the details and genre, and with one ISBN the copies' format", async () => {
    const { call, genreId } = await setup();
    const book = (
      await call("/books", "POST", {
        title: "Kochen",
        authors: ["Someone"],
        pageCount: 12,
        isbns: ["9783897484832"],
        genreId: await genreId("humour"),
        copy: { format: "other" },
      })
    ).body;
    await call(`/books/${book.id}/copies`, "POST", {});
    await stubCatalogues();

    const res = await call(`/books/${book.id}/lookup`, "POST");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: "Kochen mit Bibi Blocksberg",
      subtitle:
        "Rezepte und Tricks von früh bis spät für kleine und große Küchenhexen",
      pageCount: 95,
      publishedYear: 2001,
      genre: { key: "cookbook" },
      metadataSource: "dnb",
      // The DNB names no author for it, so the old one stays.
      authors: ["Someone"],
    });
    expect(
      res.body.copies.map((c: { format: string | null }) => c.format),
    ).toEqual(["hardcover", "hardcover"]);
  });

  it("keeps what the catalogues lack, and the genre without a guess", async () => {
    const { call, genreId } = await setup();
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "test-key");
    const book = (
      await call("/books", "POST", {
        title: "Mr Fox",
        subtitle: "A note of ours",
        isbns: ["9780140328721"],
        genreId: await genreId("humour"),
        copy: {},
      })
    ).body;
    await stubCatalogues();

    const res = await call(`/books/${book.id}/lookup`, "POST");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: "Fantastic Mr. Fox",
      subtitle: "A note of ours",
      authors: ["Roald Dahl"],
      genre: { key: "humour" },
    });
    expect(res.body.copies[0].format).toBeNull();
  });

  it("leaves the copies alone when the book has several ISBNs", async () => {
    const { call } = await setup();
    const book = (
      await call("/books", "POST", {
        title: "Kochen",
        isbns: ["9783897484832", "9783442492114"],
        copy: { format: "paperback" },
      })
    ).body;
    await stubCatalogues();

    const res = await call(`/books/${book.id}/lookup`, "POST");

    expect(res.status).toBe(200);
    expect(res.body.copies[0].format).toBe("paperback");
  });

  it("replaces the cover and keeps a hand-made sort name while the authors stay", async () => {
    const { call } = await setup();
    const book = (
      await call("/books", "POST", {
        title: "Teepalast",
        authors: ["Elisabeth Herrmann"],
        isbns: ["9783442492114"],
        copy: {},
      })
    ).body;
    await call(`/books/${book.id}`, "PATCH", { sortAs: "Herrmann, Lisa" });
    await stubCatalogues();

    const res = await call(`/books/${book.id}/lookup`, "POST");

    expect(res.body).toMatchObject({
      title: "Der Teepalast",
      sortAs: "Herrmann, Lisa",
      coverUrl: expect.stringMatching(/^\/api\/v1\/books\/.+\/cover/),
    });

    await call(`/books/${book.id}`, "PATCH", { authors: ["E. Herrmann"] });
    const changed = await call(`/books/${book.id}/lookup`, "POST");
    expect(changed.body).toMatchObject({
      authors: ["Elisabeth Herrmann"],
      sortAs: "Herrmann, Elisabeth",
    });
  });

  it("changes nothing when no catalogue knows the book", async () => {
    const { call } = await setup();
    const book = (
      await call("/books", "POST", {
        title: "Codex",
        isbns: ["9780000000002"],
        copy: {},
      })
    ).body;
    await stubCatalogues();

    const res = await call(`/books/${book.id}/lookup`, "POST");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "metadata_not_found" } });
    expect((await call(`/books/${book.id}`)).body.title).toBe("Codex");
  });

  it("changes nothing when the catalogues cannot be reached", async () => {
    const { call } = await setup();
    const book = (
      await call("/books", "POST", {
        title: "Teepalast",
        isbns: ["9783442492114"],
        copy: {},
      })
    ).body;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await call(`/books/${book.id}/lookup`, "POST");

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: { code: "metadata_unavailable" } });
    expect((await call(`/books/${book.id}`)).body.title).toBe("Teepalast");
  });
});
