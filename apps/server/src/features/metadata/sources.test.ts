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
      categories: [],
      bindings: [],
    });
  });

  it("takes the cover id -1 as no cover", () => {
    const record = {
      data: {
        title: "One Hundred Years of Solitude",
        cover: { large: "https://covers.openlibrary.org/b/id/-1-L.jpg" },
      },
    };
    expect(
      parseBook({ records: { "/books/OL1M": record } }, "9780060883287")
        ?.coverUrl,
    ).toBeNull();
    expect(
      parseSearch({ docs: [{ title: "One Hundred Years", cover_i: -1 }] })[0]
        ?.coverUrl,
    ).toBeNull();
  });

  it("takes the subjects as categories", () => {
    const book = parseBook(
      json("openlibrary-isbn-9781640973985.json"),
      "9781640973985",
    );
    expect(book?.categories).toEqual(["Travel"]);
  });

  it("takes the edition's physical format as a binding statement", () => {
    const book = parseBook(
      json("openlibrary-isbn-9783442774241.json"),
      "9783442774241",
    );
    expect(book?.bindings).toEqual(["Taschenbuch"]);
  });

  it("returns null for an unknown ISBN", () => {
    expect(parseBook([], "9780000000002")).toBeNull();
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
      categories: [],
      bindings: [],
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
        categories: [],
        bindings: [],
      },
    ]);
  });

  it("parses an empty result", () => {
    expect(parseVolumes(json("googlebooks-empty.json"))).toEqual([]);
  });

  it("takes the categories", () => {
    const [volume] = parseVolumes({
      items: [
        { volumeInfo: { title: "Born a Crime", categories: ["Biography"] } },
      ],
    });
    expect(volume?.categories).toEqual(["Biography"]);
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
        categories: [],
        bindings: ["kart.", "kart."],
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

  it("collects subject headings, genre terms and keywords as categories", () => {
    const [record] = parseRecords(fixture("dnb-isbn-9783442492114.xml"));
    expect(record?.categories).toEqual(
      expect.arrayContaining([
        "Historische Romane und Erzählungen",
        "Krimis, Thriller, Spionage",
        "Historischer Roman",
        "(VLB-WN)2121: Taschenbuch / Belletristik/Krimis, Thriller, Spionage",
        "(BISAC Subject Heading)FIC014000",
      ]),
    );
    const [cookbook] = parseRecords(fixture("dnb-isbn-9783897484832.xml"));
    expect(cookbook?.categories).toEqual(
      expect.arrayContaining(["Kochbuch", "Kindersachbuch"]),
    );
  });
});
