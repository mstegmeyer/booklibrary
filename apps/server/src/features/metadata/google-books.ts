import { normalizeIsbn } from "../books/isbn.ts";
import {
  type Candidate,
  candidate,
  get,
  languageOf,
  type Source,
  yearOf,
} from "./source.ts";

type Volume = {
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    pageCount?: number;
    language?: string;
    imageLinks?: { thumbnail?: string };
    categories?: string[];
  };
};

/** Response of `volumes.list`. */
export function parseVolumes(json: { items?: Volume[] }): Candidate[] {
  return (json.items ?? []).flatMap(({ volumeInfo: info }) => {
    if (!info?.title) return [];
    const isbns = (info.industryIdentifiers ?? [])
      .filter((id) => id.type === "ISBN_13" || id.type === "ISBN_10")
      .map((id) => normalizeIsbn(id.identifier));
    return [
      candidate("googlebooks", info.title, {
        isbn13: isbns.find((isbn) => isbn !== null),
        subtitle: info.subtitle,
        authors: info.authors,
        description: info.description,
        pageCount: info.pageCount,
        publishedYear: yearOf(info.publishedDate),
        language: languageOf(info.language),
        coverUrl: info.imageLinks?.thumbnail?.replace(/^http:/, "https:"),
        categories: info.categories,
      }),
    ];
  });
}

export function googleBooks(baseUrl: string, apiKey: string): Source {
  const volumes = async (params: Record<string, string>) => {
    const url = new URL(`${baseUrl}/books/v1/volumes`);
    url.search = new URLSearchParams({ ...params, key: apiKey }).toString();
    return parseVolumes(await (await get(url)).json());
  };
  return {
    name: "googlebooks",
    async byIsbn(isbn13) {
      const [found] = await volumes({ q: `isbn:${isbn13}` });
      return found ? { ...found, isbn13 } : null;
    },
    search: (query) =>
      volumes({ q: query, maxResults: "10", printType: "books" }),
  };
}
