import { dnb } from "./dnb.ts";
import { googleBooks } from "./google-books.ts";
import { openLibrary } from "./open-library.ts";
import { type Candidate, type Source, timeoutMs, userAgent } from "./source.ts";

const maxResults = 10;
const maxCoverBytes = 5 * 1024 * 1024;
const maxRedirects = 3;
const coverTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// Where the sources' cover URLs point; Open Library redirects to archive.org.
const imageHosts = [
  "covers.openlibrary.org",
  "archive.org",
  "books.google.com",
];

/** 978-3 is the registration group of the German-speaking countries. */
const isGermanLanguageGroup = (isbn13: string) => isbn13.startsWith("9783");

const withoutSlash = (url: string) => url.replace(/\/+$/, "");

function baseUrls(env = process.env) {
  return {
    openLibrary: withoutSlash(
      env.OPEN_LIBRARY_URL || "https://openlibrary.org",
    ),
    openLibraryCovers: withoutSlash(
      env.OPEN_LIBRARY_COVERS_URL || "https://covers.openlibrary.org",
    ),
    googleBooks: withoutSlash(
      env.GOOGLE_BOOKS_URL || "https://www.googleapis.com",
    ),
    dnb: withoutSlash(env.DNB_SRU_URL || "https://services.dnb.de/sru/dnb"),
    dnbCovers: withoutSlash(
      env.DNB_COVERS_URL || "https://portal.dnb.de/opac/mvb/cover",
    ),
  };
}

function sources(env = process.env) {
  const urls = baseUrls(env);
  const key = env.GOOGLE_BOOKS_API_KEY;
  return {
    openLibrary: openLibrary(urls.openLibrary, urls.openLibraryCovers),
    // Google requires an API key for every request, so it is only asked when one is configured.
    googleBooks: key ? googleBooks(urls.googleBooks, key) : null,
    dnb: dnb(urls.dnb, urls.dnbCovers),
  };
}

async function askAll<T>(list: Source[], ask: (source: Source) => Promise<T>) {
  const settled = await Promise.allSettled(list.map(ask));
  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      const reason = result.reason as Error;
      console.warn(
        `Metadata source ${list[i]?.name} failed: ${reason.message}`,
      );
    }
  });
  return {
    allFailed: settled.every((result) => result.status === "rejected"),
    answers: settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    ),
  };
}

/**
 * Fills the fields `base` lacks from `extra`; the categories and binding
 * statements of both count.
 */
export function merge(base: Candidate, extra: Candidate): Candidate {
  const signals = {
    categories: [...base.categories, ...extra.categories],
    bindings: [...base.bindings, ...extra.bindings],
  };
  const merged: Omit<Candidate, keyof typeof signals> = {
    isbn13: base.isbn13 ?? extra.isbn13,
    title: base.title,
    subtitle: base.subtitle ?? extra.subtitle,
    authors: base.authors.length ? base.authors : extra.authors,
    description: base.description ?? extra.description,
    pageCount: base.pageCount ?? extra.pageCount,
    publishedYear: base.publishedYear ?? extra.publishedYear,
    language: base.language ?? extra.language,
    coverUrl: base.coverUrl ?? extra.coverUrl,
    sources: base.sources,
  };
  const contributed = (Object.keys(merged) as (keyof typeof merged)[]).some(
    (key) => merged[key] !== base[key],
  );
  return contributed
    ? { ...merged, ...signals, sources: [...base.sources, ...extra.sources] }
    : { ...merged, ...signals };
}

export async function lookupIsbn(
  isbn13: string,
): Promise<Candidate | "not_found" | "unavailable"> {
  const { openLibrary, googleBooks, dnb } = sources();
  const ordered = isGermanLanguageGroup(isbn13)
    ? [dnb, openLibrary, googleBooks]
    : [openLibrary, googleBooks, dnb];
  const { allFailed, answers } = await askAll(
    ordered.filter((source) => source !== null),
    (source) => source.byIsbn(isbn13),
  );
  if (allFailed) return "unavailable";
  const found = answers.filter((answer) => answer !== null);
  const [base, ...rest] = found;
  if (!base) return "not_found";
  const merged = rest.reduce(merge, base);
  if (merged.coverUrl) return merged;
  // Asked only now, so that lookups that already have a cover cost nothing extra.
  try {
    const coverUrl = await openLibrary.otherEditionCover(isbn13);
    if (!coverUrl) return merged;
    const sources = new Set([...merged.sources, openLibrary.name]);
    return { ...merged, coverUrl, sources: [...sources] };
  } catch (error) {
    console.warn(
      `Metadata source openlibrary failed: ${(error as Error).message}`,
    );
    return merged;
  }
}

export async function searchBooks(
  query: string,
): Promise<Candidate[] | "unavailable"> {
  const { openLibrary, googleBooks, dnb } = sources();
  const { allFailed, answers } = await askAll(
    [openLibrary, googleBooks, dnb].filter((source) => source !== null),
    (source) => source.search(query),
  );
  if (allFailed) return "unavailable";

  // Interleaved so that one source cannot fill the whole list.
  const interleaved = Array.from(
    { length: Math.max(0, ...answers.map((list) => list.length)) },
    (_, i) => answers.flatMap((list) => list[i] ?? []),
  ).flat();

  const results: Candidate[] = [];
  const indexByIsbn = new Map<string, number>();
  for (const found of interleaved) {
    const index = found.isbn13 ? indexByIsbn.get(found.isbn13) : undefined;
    const existing = index === undefined ? undefined : results[index];
    if (index !== undefined && existing) {
      results[index] = merge(existing, found);
      continue;
    }
    if (found.isbn13) indexByIsbn.set(found.isbn13, results.length);
    results.push(found);
  }
  return results.slice(0, maxResults);
}

function isAllowedCoverUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const sourceHosts = Object.values(baseUrls()).map(
    (base) => new URL(base).host,
  );
  return (
    sourceHosts.includes(url.host) ||
    imageHosts.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    )
  );
}

/**
 * Downloads a cover image found by a lookup. Only fetches from the sources and
 * their image hosts, also across redirects, so a stored URL cannot be used to
 * reach other hosts.
 */
export async function downloadCover(
  coverUrl: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  let url = new URL(coverUrl);
  for (let redirects = 0; ; redirects++) {
    if (!isAllowedCoverUrl(url)) {
      throw new Error(`Covers are not downloaded from ${url.host}`);
    }
    const res = await fetch(url, {
      headers: { "user-agent": userAgent },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      if (redirects >= maxRedirects) throw new Error("Too many redirects");
      url = new URL(location, url);
      continue;
    }
    if (!res.ok || !res.body) {
      throw new Error(`Cover download answered ${res.status}`);
    }
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim();
    if (!contentType || !coverTypes.includes(contentType)) {
      throw new Error(`Cover is not an image: ${contentType}`);
    }
    if (Number(res.headers.get("content-length")) > maxCoverBytes) {
      throw new Error("Cover is too large");
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxCoverBytes) throw new Error("Cover is too large");
      chunks.push(chunk);
    }
    return { bytes: Buffer.concat(chunks), contentType };
  }
}
