import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test/app.ts";
import { recordedResponse } from "./fixtures/recorded.ts";
import { downloadCover } from "./service.ts";
import type { SourceName } from "./source.ts";

/**
 * Replaces fetch with the recorded responses of the three services and returns
 * the catalogues asked, leaving out the DNB cover checks. `dnbCover` replaces
 * the cover service's answer.
 */
function stubSources(
  failing: SourceName[] = [],
  dnbCover?: () => Promise<Response>,
) {
  const asked: SourceName[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL, init?: RequestInit) => {
      const url = new URL(input);
      const { source, status, body, contentType } = recordedResponse(url);
      if (init?.method !== "HEAD") asked.push(source);
      if (failing.includes(source)) throw new TypeError("fetch failed");
      if (dnbCover && init?.method === "HEAD") return dnbCover();
      return new Response(body, {
        status,
        headers: { "content-type": contentType },
      });
    }),
  );
  return asked;
}

const requestedUrls = () =>
  vi.mocked(fetch).mock.calls.map(([url]) => String(url));

const dnbCoverUrl = (isbn: string) =>
  `https://portal.dnb.de/opac/mvb/cover?isbn=${isbn}`;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("GOOGLE_BOOKS_API_KEY", "test-key");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function signedIn() {
  const { request, setupAdmin } = createTestApp();
  const token = await setupAdmin();
  return (path: string) => request(`/api/v1/metadata${path}`, { token });
}

describe("ISBN lookup", () => {
  it("asks the DNB first for the German-language group and fills gaps from the others", async () => {
    const get = await signedIn();
    const asked = stubSources();
    const res = await get("/isbn/3-257-22953-4");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      isbn13: "9783257229530",
      title: "Der Vorleser",
      subtitle: "Roman",
      authors: ["Bernhard Schlink"],
      description:
        "Ein Junge und eine ältere Frau, deren Vergangenheit ihn Jahre später einholt.",
      pageCount: 206,
      publishedYear: 1997,
      language: "de",
      coverUrl: dnbCoverUrl("9783257229530"),
      sources: ["dnb", "googlebooks"],
    });
    expect(asked).toEqual(["dnb", "openlibrary", "googlebooks"]);
  });

  it("checks the DNB cover together with the catalogue request", async () => {
    const get = await signedIn();
    stubSources();
    const res = await get("/isbn/9783442492114");
    expect(await res.json()).toMatchObject({
      title: "Der Teepalast",
      coverUrl: dnbCoverUrl("9783442492114"),
      sources: ["dnb"],
    });
    expect(vi.mocked(fetch).mock.calls[0]).toEqual([
      new URL(dnbCoverUrl("9783442492114")),
      expect.objectContaining({ method: "HEAD" }),
    ]);
  });

  it.each([
    ["has none", async () => new Response(null, { status: 404 })],
    [
      "answers with something else",
      async () =>
        new Response(null, { headers: { "content-type": "text/html" } }),
    ],
    [
      "fails",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("takes no DNB cover when the cover service %s", async (_, dnbCover) => {
    const get = await signedIn();
    stubSources([], dnbCover);
    const res = await get("/isbn/9783442492114");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      title: "Der Teepalast",
      coverUrl: null,
      sources: ["dnb"],
    });
  });

  it("falls back to the cover of another edition", async () => {
    const get = await signedIn();
    stubSources();
    const res = await get("/isbn/9781409150541");
    expect(await res.json()).toMatchObject({
      title: "Deal Breaker",
      coverUrl: "https://covers.openlibrary.org/b/id/8739250-L.jpg",
      sources: ["openlibrary"],
    });
  });

  it("does not ask for another edition's cover when there is one", async () => {
    const get = await signedIn();
    stubSources();
    await get("/isbn/9780140328721");
    expect(requestedUrls()).not.toContainEqual(
      expect.stringContaining("search.json"),
    );
  });

  it("keeps the result when another edition's cover cannot be asked for", async () => {
    const get = await signedIn();
    stubSources();
    const recorded = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes("search.json")) {
        throw new TypeError("fetch failed");
      }
      return recorded?.(input, init) as Promise<Response>;
    });
    const res = await get("/isbn/9781409150541");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      title: "Deal Breaker",
      coverUrl: null,
    });
  });

  it("asks Open Library first for other ISBNs, then Google Books", async () => {
    const get = await signedIn();
    stubSources();
    const res = await get("/isbn/978-0-14-032872-1");
    expect(await res.json()).toMatchObject({
      title: "Fantastic Mr. Fox",
      pageCount: 96,
      publishedYear: 1988,
      description: "Three farmers set out to catch a clever fox.",
      language: "en",
      sources: ["openlibrary", "googlebooks"],
    });
  });

  it("skips a failed source and logs it", async () => {
    const get = await signedIn();
    stubSources(["openlibrary"]);
    const res = await get("/isbn/9780140328721");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      title: "Fantastic Mr Fox",
      sources: ["googlebooks"],
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("openlibrary failed"),
    );
  });

  it("does not ask Google Books without an API key", async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "");
    const get = await signedIn();
    const asked = stubSources();
    await get("/isbn/9780140328721");
    expect(asked).toEqual(["openlibrary", "dnb"]);
  });

  it("answers 404 when no source knows the ISBN", async () => {
    const get = await signedIn();
    stubSources(["dnb"]);
    const res = await get("/isbn/9780000000002");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: { code: "metadata_not_found" },
    });
  });

  it("answers 502 when every source failed", async () => {
    const get = await signedIn();
    stubSources(["openlibrary", "googlebooks", "dnb"]);
    const res = await get("/isbn/9780140328721");
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: { code: "metadata_unavailable" },
    });
  });

  it("rejects an invalid ISBN without asking any source", async () => {
    const get = await signedIn();
    const asked = stubSources();
    const res = await get("/isbn/9783257229531");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "invalid_isbn" } });
    expect(asked).toEqual([]);
  });
});

describe("search", () => {
  it("combines the sources and removes duplicates", async () => {
    const get = await signedIn();
    stubSources();
    const res = await get("/search?q=der%20vorleser");
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.map((c: { isbn13: string }) => c.isbn13)).toEqual([
      "9783257229530",
      "9783257073690",
      "9783580633448",
      "9780375707971",
      "9783963232176",
      "9783150160503",
      "9786192650483",
    ]);
    expect(items[0]).toMatchObject({
      description:
        "Ein Junge und eine ältere Frau, deren Vergangenheit ihn Jahre später einholt.",
      sources: ["openlibrary", "googlebooks"],
    });
  });

  it("gives DNB results the DNB cover where there is one", async () => {
    const get = await signedIn();
    stubSources();
    const { items } = await (await get("/search?q=der%20vorleser")).json();
    const coverOf = (isbn: string) =>
      items.find((c: { isbn13: string }) => c.isbn13 === isbn).coverUrl;
    expect(coverOf("9783963232176")).toBe(dnbCoverUrl("9783963232176"));
    expect(coverOf("9786192650483")).toBeNull();
    expect(requestedUrls()).not.toContainEqual(
      expect.stringContaining("q=isbn"),
    );
  });

  it("answers 502 when every source failed", async () => {
    const get = await signedIn();
    stubSources(["openlibrary", "googlebooks", "dnb"]);
    expect((await get("/search?q=vorleser")).status).toBe(502);
  });

  it("requires a query", async () => {
    const get = await signedIn();
    expect((await get("/search?q=%20")).status).toBe(400);
  });
});

describe("downloadCover", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

  it("downloads from a source's image host, following redirects there", async () => {
    const fetch = vi.fn(async (url: URL) =>
      url.hostname === "covers.openlibrary.org"
        ? new Response(null, {
            status: 302,
            headers: { location: "https://ia800404.us.archive.org/cover.jpg" },
          })
        : new Response(jpeg, { headers: { "content-type": "image/jpeg" } }),
    );
    vi.stubGlobal("fetch", fetch);
    const cover = await downloadCover(
      "https://covers.openlibrary.org/b/id/1-L.jpg",
    );
    expect(cover).toEqual({
      bytes: Buffer.from(jpeg),
      contentType: "image/jpeg",
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refuses other hosts, also as a redirect target", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://192.168.1.1/admin" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(downloadCover("https://example.com/a.jpg")).rejects.toThrow(
      "example.com",
    );
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      downloadCover("https://books.google.com/books/content?id=1"),
    ).rejects.toThrow("192.168.1.1");
  });

  it("refuses responses that are not images", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("<html>", { headers: { "content-type": "text/html" } }),
    );
    await expect(
      downloadCover("https://covers.openlibrary.org/b/id/1-L.jpg"),
    ).rejects.toThrow("not an image");
  });

  it("refuses images over the size limit", async () => {
    const big = new Uint8Array(6 * 1024 * 1024);
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(big);
              controller.close();
            },
          }),
          { headers: { "content-type": "image/png" } },
        ),
    );
    await expect(
      downloadCover("https://covers.openlibrary.org/b/id/1-L.jpg"),
    ).rejects.toThrow("too large");
  });

  it("allows the configured source hosts", async () => {
    vi.stubEnv("OPEN_LIBRARY_URL", "http://localhost:4010");
    vi.stubEnv("DNB_COVERS_URL", "http://localhost:4020/opac/mvb/cover");
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(jpeg, { headers: { "content-type": "image/jpeg" } }),
    );
    await expect(
      downloadCover("http://localhost:4010/b/id/1-L.jpg"),
    ).resolves.toMatchObject({ contentType: "image/jpeg" });
    await expect(
      downloadCover("http://localhost:4020/opac/mvb/cover?isbn=1"),
    ).resolves.toMatchObject({ contentType: "image/jpeg" });
    await expect(downloadCover(dnbCoverUrl("9783442492114"))).rejects.toThrow(
      "portal.dnb.de",
    );
  });

  it("downloads from the DNB cover service", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(jpeg, {
          headers: { "content-type": "image/jpeg; charset=UTF-8" },
        }),
    );
    await expect(
      downloadCover(dnbCoverUrl("9783442492114")),
    ).resolves.toMatchObject({ contentType: "image/jpeg" });
  });
});
