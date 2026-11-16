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
  subjects?: { name: string }[];
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

/**
 * Response of the Read API (`/api/volumes/brief/isbn/…`): the Books API's
 * `data` and the edition record, which alone has the physical format, in one
 * request. An unknown ISBN gives an empty list.
 */
export type ReadApiResponse =
  | {
      records?: Record<
        string,
        { data?: Book; details?: { details?: { physical_format?: string } } }
      >;
    }
  | [];

// Open Library records "no cover" as the id -1 and still builds a URL from it.
const hasCover = (id: number | undefined): id is number => !!id && id > 0;
const coverIdOf = (url: string | undefined) =>
  Number(/\/b\/id\/(-?\d+)-/.exec(url ?? "")?.[1]);

export function parseBook(
  json: ReadApiResponse,
  isbn13: string,
): Candidate | null {
  const record = Array.isArray(json)
    ? undefined
    : Object.values(json.records ?? {})[0];
  const book = record?.data;
  if (!book?.title) return null;
  const binding = record?.details?.details?.physical_format;
  return candidate("openlibrary", book.title, {
    isbn13,
    subtitle: book.subtitle,
    authors: book.authors?.map((a) => a.name),
    pageCount: book.number_of_pages,
    publishedYear: yearOf(book.publish_date),
    coverUrl: hasCover(coverIdOf(book.cover?.large)) ? book.cover?.large : null,
    categories: book.subjects?.map((subject) => subject.name),
    bindings: binding ? [binding] : [],
  });
}

/** Response of the Search API; each work carries its best-matching edition. */
export function parseSearch(
  json: { docs?: Work[] },
  coversUrl = "https://covers.openlibrary.org",
): Candidate[] {
  const coverUrl = (id: number | undefined) =>
    hasCover(id) ? `${coversUrl}/b/id/${id}-L.jpg` : null;
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

export function openLibrary(
  baseUrl: string,
  coversUrl: string,
): Source & { otherEditionCover: (isbn13: string) => Promise<string | null> } {
  return {
    name: "openlibrary",
    async byIsbn(isbn13) {
      const url = new URL(`${baseUrl}/api/volumes/brief/isbn/${isbn13}.json`);
      return parseBook(await (await get(url)).json(), isbn13);
    },
    async search(query) {
      const url = new URL(`${baseUrl}/search.json`);
      url.search = new URLSearchParams({
        q: query,
        limit: "10",
        fields: searchFields,
      }).toString();
      return parseSearch(await (await get(url)).json(), coversUrl);
    },
    /**
     * The cover of the work the ISBN belongs to. An edition record often has
     * none while another edition of the same work does.
     */
    async otherEditionCover(isbn13) {
      const url = new URL(`${baseUrl}/search.json`);
      url.search = new URLSearchParams({
        q: `isbn:${isbn13}`,
        fields: "cover_i",
        limit: "1",
      }).toString();
      const json: { docs?: Work[] } = await (await get(url)).json();
      const id = json.docs?.[0]?.cover_i;
      return hasCover(id) ? `${coversUrl}/b/id/${id}-L.jpg` : null;
    },
  };
}
