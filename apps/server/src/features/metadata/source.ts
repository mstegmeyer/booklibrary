import { version } from "../../config.ts";

// "epub" is the e-book file itself, when its metadata was read.
export const sourceNames = [
  "openlibrary",
  "googlebooks",
  "dnb",
  "epub",
] as const;
export type SourceName = (typeof sourceNames)[number];

export type Candidate = {
  isbn13: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  description: string | null;
  pageCount: number | null;
  publishedYear: number | null;
  language: string | null;
  coverUrl: string | null;
  sources: SourceName[];
  /** Subjects, genre terms and keywords; what the genre is guessed from. */
  categories: string[];
};

export type Source = {
  name: SourceName;
  byIsbn: (isbn13: string) => Promise<Candidate | null>;
  search: (query: string) => Promise<Candidate[]>;
};

export const userAgent = `BookLibrary/${version}`;
export const timeoutMs = 5000;

export async function get(url: URL) {
  const res = await fetch(url, {
    headers: { "user-agent": userAgent },
    signal: AbortSignal.timeout(timeoutMs),
  });
  // Only the host: the query may carry an API key.
  if (!res.ok) throw new Error(`${url.host} answered ${res.status}`);
  return res;
}

type Fields = Partial<Omit<Candidate, "title" | "sources">>;

export function candidate(
  source: SourceName,
  title: string,
  fields: Fields,
): Candidate {
  return {
    isbn13: fields.isbn13 ?? null,
    title,
    subtitle: fields.subtitle || null,
    authors: fields.authors ?? [],
    description: fields.description || null,
    pageCount: fields.pageCount || null,
    publishedYear: fields.publishedYear ?? null,
    language: fields.language ?? null,
    coverUrl: fields.coverUrl ?? null,
    sources: [source],
    categories: fields.categories ?? [],
  };
}

export function yearOf(date: string | number | undefined) {
  const match = /\d{4}/.exec(String(date ?? ""));
  return match ? Number(match[0]) : null;
}

/** BCP 47 language from ISO 639-1 or 639-2 codes ("ger" and "deu" become "de"). */
export function languageOf(code: string | undefined) {
  try {
    return code ? new Intl.Locale(code).language : null;
  } catch {
    return null;
  }
}
