import { expect, type Page } from "@playwright/test";

// Seeding helpers for the catalogue: they call the API as the signed-in user
// of `page` (see `setupAdmin` in fixtures.ts).

export type SeededLocation = { id: string; name: string; path: string[] };
export type SeededBook = {
  id: string;
  title: string;
  copies: { id: string }[];
};

export async function createLocation(
  page: Page,
  name: string,
  parentId?: string,
): Promise<SeededLocation> {
  const res = await page.request.post("/api/v1/locations", {
    data: { name, parentId },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

/** Creates a book; pass `copy` (even `{}`) to put a copy in the library. */
export async function createBook(
  page: Page,
  book: {
    title: string;
    authors?: string[];
    isbns?: string[];
    pageCount?: number;
    publishedYear?: number;
    language?: string;
    description?: string;
    copy?: {
      locationId?: string;
      format?: "paperback" | "hardcover" | "other";
    };
  },
): Promise<SeededBook> {
  const res = await page.request.post("/api/v1/books", { data: book });
  expect(res.status()).toBe(201);
  return res.json();
}

/** Adds a copy and returns the book with all its copies. */
export async function createCopy(
  page: Page,
  bookId: string,
  copy: {
    locationId?: string;
    format?: "paperback" | "hardcover" | "other";
  } = {},
): Promise<SeededBook> {
  const res = await page.request.post(`/api/v1/books/${bookId}/copies`, {
    data: copy,
  });
  expect(res.status()).toBe(201);
  return res.json();
}

/** Adds an e-book file to a book and returns the book with its files. */
export async function addFile(
  page: Page,
  bookId: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<SeededBook & { files: { id: string; path: string }[] }> {
  const res = await page.request.post(`/api/v1/books/${bookId}/files`, {
    multipart: { file },
  });
  expect(res.status()).toBe(201);
  return res.json();
}
