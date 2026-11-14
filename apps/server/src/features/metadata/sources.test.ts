import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRecords } from "./dnb.ts";
import { parseVolumes } from "./google-books.ts";
import { parseBook, parseSearch } from "./open-library.ts";

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const json = (name: string) => JSON.parse(fixture(name));

describe("Open Library", () => {
  it("parses a Books API record", () => {
    expect(
      parseBook(json("openlibrary-isbn-9780140328721.json"), "9780140328721"),
    ).toEqual({
      isbn13: "9780140328721",
      title: "Fantastic Mr. Fox",
      subtitle: null,
      authors: ["Roald Dahl"],
      description: null,
      pageCount: 96,
      publishedYear: 1988,
      language: null,
      coverUrl: "https://covers.openlibrary.org/b/id/15152634-L.jpg",
      sources: ["openlibrary"],
    });
  });

  it("returns null for an unknown ISBN", () => {
    expect(parseBook({}, "9780000000002")).toBeNull();
  });

  it("parses search results from their best-matching edition", () => {
    const results = parseSearch(json("openlibrary-search.json"));
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      isbn13: "9783257229530",
      title: "Der Vorleser",
      subtitle: null,
      authors: ["Bernhard Schlink"],
      description: null,
      pageCount: null,
      publishedYear: 1997,
      language: "de",
      coverUrl: "https://covers.openlibrary.org/b/id/8782586-L.jpg",
      sources: ["openlibrary"],
    });
  });
});

describe("Google Books", () => {
  it("parses volumes", () => {
    expect(parseVolumes(json("googlebooks-isbn-9780140328721.json"))).toEqual([
      {
        isbn13: "9780140328721",
        title: "Fantastic Mr Fox",
        subtitle: null,
        authors: ["Roald Dahl"],
        description: "Three farmers set out to catch a clever fox.",
        pageCount: 112,
        publishedYear: 2007,
        language: "en",
        coverUrl:
          "https://books.google.com/books/content?id=fixture-mr-fox&printsec=frontcover&img=1&zoom=1&source=gbs_api",
        sources: ["googlebooks"],
      },
    ]);
  });

  it("parses an empty result", () => {
    expect(parseVolumes(json("googlebooks-empty.json"))).toEqual([]);
  });
});

describe("DNB", () => {
  it("parses a MARC21 record", () => {
    expect(parseRecords(fixture("dnb-isbn-9783257229530.xml"))).toEqual([
      {
        isbn13: "9783257229530",
        title: "Der Vorleser",
        subtitle: "Roman",
        authors: ["Bernhard Schlink"],
        description: null,
        pageCount: 206,
        publishedYear: 1997,
        language: "de",
        coverUrl: null,
        sources: ["dnb"],
      },
    ]);
  });

  it("parses search results and skips translators", () => {
    const results = parseRecords(fixture("dnb-search.xml"));
    expect(results.map((r) => [r.isbn13, r.title, r.authors])).toEqual([
      ["9783257073690", "Der Vorleser", ["Bernhard Schlink"]],
      [
        "9783963232176",
        "Der Vorleser – Bernhard Schlink – Lehrerheft",
        ["Dr. Gesine Heddrich"],
      ],
      ["9786192650483", "Četecăt", ["Bernhard Schlink"]],
    ]);
    expect(results[0]?.publishedYear).toBe(2025);
    expect(results[2]?.language).toBe("bg");
  });

  it("parses an empty result", () => {
    expect(parseRecords(fixture("dnb-empty.xml"))).toEqual([]);
  });
});
