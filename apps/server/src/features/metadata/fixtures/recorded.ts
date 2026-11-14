import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceName } from "../source.ts";

const read = (name: string) => {
  const file = join(import.meta.dirname, name);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
};

/** The ISBNs the DNB cover service had an image for when recorded. */
export const dnbCoverIsbns = [
  "9783257229530",
  "9783257073690",
  "9783963232176",
  "9783442492114",
];

/**
 * The recorded answer to a request to one of the sources, chosen by path and
 * query. Unknown ISBNs get the service's empty answer. Shared by the unit tests
 * and the end-to-end stub server. A DNB cover is answered without its image.
 */
export function recordedResponse(url: URL) {
  const params = url.searchParams;
  if (url.pathname.endsWith("/opac/mvb/cover")) {
    const found = dnbCoverIsbns.includes(params.get("isbn") ?? "");
    return {
      source: "dnb" as SourceName,
      status: found ? 200 : 404,
      body: "",
      contentType: found ? "image/jpeg" : "text/html",
    };
  }
  // Only digits reach the file name.
  const isbn = (value: string | undefined) =>
    value && /^\d{13}$/.test(value) ? value : "unknown";
  const [source, file, fallback, contentType]: [
    SourceName,
    string,
    string,
    string,
  ] = url.pathname.endsWith("/sru/dnb")
    ? [
        "dnb",
        params.get("query")?.startsWith("isbn=")
          ? `dnb-isbn-${isbn(params.get("query")?.slice(5))}.xml`
          : "dnb-search.xml",
        "dnb-empty.xml",
        "application/xml",
      ]
    : url.pathname.endsWith("/books/v1/volumes")
      ? [
          "googlebooks",
          params.get("q")?.startsWith("isbn:")
            ? `googlebooks-isbn-${isbn(params.get("q")?.slice(5))}.json`
            : "googlebooks-search.json",
          "googlebooks-empty.json",
          "application/json",
        ]
      : [
          "openlibrary",
          url.pathname.includes("/api/volumes/brief/isbn/")
            ? `openlibrary-isbn-${isbn(url.pathname.split("/").at(-1)?.replace(".json", ""))}.json`
            : params.get("q")?.startsWith("isbn:")
              ? `openlibrary-work-${isbn(params.get("q")?.slice(5))}.json`
              : "openlibrary-search.json",
          "openlibrary-empty.json",
          "application/json",
        ];
  const body = read(file) ?? read(fallback) ?? "";
  return { source, status: 200, body, contentType };
}
