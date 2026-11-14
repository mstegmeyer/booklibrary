import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceName } from "../source.ts";

const read = (name: string) => {
  const file = join(import.meta.dirname, name);
  return existsSync(file) ? readFileSync(file, "utf8") : null;
};

/**
 * The recorded answer to a request to one of the sources, chosen by path and
 * query. Unknown ISBNs get the service's empty answer. Shared by the unit tests
 * and the end-to-end stub server.
 */
export function recordedResponse(url: URL) {
  const params = url.searchParams;
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
          url.pathname.endsWith("/api/books")
            ? `openlibrary-isbn-${isbn(params.get("bibkeys")?.slice(5))}.json`
            : "openlibrary-search.json",
          "openlibrary-empty.json",
          "application/json",
        ];
  const body = read(file) ?? read(fallback) ?? "";
  return { source, body, contentType };
}
