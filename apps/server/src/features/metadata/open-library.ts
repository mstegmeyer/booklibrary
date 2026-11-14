import { normalizeIsbn } from "../books/isbn.ts";
import {
  type Candidate,
  candidate,
  get,
  languageOf,
  type Source,
  yearOf,
} from "./source.ts";

type Book = {
  title?: string;
  subtitle?: string;
  authors?: { name: string }[];
  number_of_pages?: number;
  publish_date?: string;
  cover?: { large?: string };
};

type Edition = {
  title?: string;
  subtitle?: string;
  isbn?: string[];
  language?: string[];
  publish_date?: string[];
  cover_i?: number;
};

type Work = {
  title?: string;
  subtitle?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  editions?: { docs?: Edition[] };
};

const coverUrl = (id: number | undefined) =>
  id ? `https://covers.openlibrary.org/b/id/${id}-L.jpg` : null;

/** Response of the Books API (`/api/books?jscmd=data`). */
export function parseBook(
  json: Record<string, Book>,
  isbn13: string,
): Candidate | null {
  const book = Object.values(json)[0];
  if (!book?.title) return null;
  return candidate("openlibrary", book.title, {
    isbn13,
    subtitle: book.subtitle,
    authors: book.authors?.map((a) => a.name),
    pageCount: book.number_of_pages,
    publishedYear: yearOf(book.publish_date),
    coverUrl: book.cover?.large,
  });
}

/** Response of the Search API; each work carries its best-matching edition. */
export function parseSearch(json: { docs?: Work[] }): Candidate[] {
  return (json.docs ?? []).flatMap((work) => {
    const edition = work.editions?.docs?.[0];
    const title = edition?.title ?? work.title;
    if (!title) return [];
    const isbns = (edition?.isbn ?? []).map(normalizeIsbn);
    return [
      candidate("openlibrary", title, {
        isbn13: isbns.find((isbn) => isbn !== null),
        subtitle: edition?.subtitle ?? work.subtitle,
        authors: work.author_name,
        publishedYear: yearOf(
          edition?.publish_date?.[0] ?? work.first_publish_year,
        ),
        language: languageOf(edition?.language?.[0]),
        coverUrl: coverUrl(edition?.cover_i ?? work.cover_i),
      }),
    ];
  });
}

const searchFields = [
  "title",
  "subtitle",
  "author_name",
  "first_publish_year",
  "cover_i",
  "editions",
  "editions.title",
  "editions.subtitle",
  "editions.isbn",
  "editions.language",
  "editions.publish_date",
  "editions.cover_i",
].join(",");

export function openLibrary(baseUrl: string): Source {
  return {
    name: "openlibrary",
    async byIsbn(isbn13) {
      const url = new URL(`${baseUrl}/api/books`);
      url.search = new URLSearchParams({
        bibkeys: `ISBN:${isbn13}`,
        jscmd: "data",
        format: "json",
      }).toString();
      return parseBook(await (await get(url)).json(), isbn13);
    },
    async search(query) {
      const url = new URL(`${baseUrl}/search.json`);
      url.search = new URLSearchParams({
        q: query,
        limit: "10",
        fields: searchFields,
      }).toString();
      return parseSearch(await (await get(url)).json());
    },
  };
}
