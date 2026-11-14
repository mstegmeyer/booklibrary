import { DOMParser, type Element } from "@xmldom/xmldom";
import { normalizeIsbn } from "../books/isbn.ts";
import {
  type Candidate,
  candidate,
  get,
  languageOf,
  type Source,
  yearOf,
} from "./source.ts";

const marcNamespace = "http://www.loc.gov/MARC21/slim";

const datafields = (record: Element, tag: string) =>
  [...record.getElementsByTagNameNS(marcNamespace, "datafield")].filter(
    (field) => field.getAttribute("tag") === tag,
  );

const values = (field: Element, code: string) =>
  [...field.getElementsByTagNameNS(marcNamespace, "subfield")]
    .filter((sub) => sub.getAttribute("code") === code)
    // The DNB sends decomposed characters ("u" followed by a combining diaeresis).
    .map((sub) => (sub.textContent ?? "").normalize("NFC"));

const first = (record: Element, tag: string, code: string) =>
  datafields(record, tag).flatMap((field) => values(field, code))[0];

// MARC wraps leading articles ignored for sorting in these control characters.
const clean = (text: string | undefined) =>
  text?.replace(/[\u0098\u009c]/g, "").trim();

// "Schlink, Bernhard" becomes "Bernhard Schlink".
const displayName = (name: string) =>
  name.replace(/^([^,]+), ([^,]+)$/, "$2 $1");

// Main author plus added entries with the relator code "aut", skipping
// translators, editors and illustrators.
const authorsOf = (record: Element) =>
  [
    ...datafields(record, "100"),
    ...datafields(record, "700").filter((field) =>
      values(field, "4").includes("aut"),
    ),
  ]
    .flatMap((field) => values(field, "a"))
    .map(displayName);

function parseRecord(record: Element): Candidate | null {
  const title = clean(first(record, "245", "a"));
  if (!title) return null;
  const isbns = datafields(record, "020")
    .flatMap((field) => values(field, "a"))
    .map(normalizeIsbn);
  const pages = /(\d+) (S\.|Seiten)/.exec(first(record, "300", "a") ?? "");
  return candidate("dnb", title, {
    isbn13: isbns.find((isbn) => isbn !== null),
    subtitle: clean(first(record, "245", "b")),
    authors: authorsOf(record),
    pageCount: pages ? Number(pages[1]) : null,
    publishedYear: yearOf(
      first(record, "264", "c") ?? first(record, "260", "c"),
    ),
    language: languageOf(first(record, "041", "a")),
  });
}

/** SRU searchRetrieve response with MARC21-xml records. */
export function parseRecords(xml: string): Candidate[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return [...doc.getElementsByTagNameNS(marcNamespace, "record")].flatMap(
    (record) => parseRecord(record) ?? [],
  );
}

export function dnb(baseUrl: string): Source {
  const searchRetrieve = async (query: string, maximumRecords: number) => {
    const url = new URL(baseUrl);
    url.search = new URLSearchParams({
      version: "1.1",
      operation: "searchRetrieve",
      query,
      recordSchema: "MARC21-xml",
      maximumRecords: String(maximumRecords),
    }).toString();
    return parseRecords(await (await get(url)).text());
  };
  return {
    name: "dnb",
    async byIsbn(isbn13) {
      const [found] = await searchRetrieve(`isbn=${isbn13}`, 1);
      return found ? { ...found, isbn13 } : null;
    },
    search: (query) =>
      searchRetrieve(
        `WOE all "${query.replace(/["\\]/g, " ")}" and mat=books`,
        10,
      ),
  };
}
