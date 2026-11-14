import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { ApiError } from "../../api/errors.ts";
import type { Db } from "../../db/client.ts";
import { book, bookIdentifier } from "../../db/schema.ts";
import { downloadCover, lookupIsbn } from "../metadata/service.ts";

export type CoverSize = "full" | "thumb";

// Covers live in DATA_DIR next to the database, so the database file tells us
// where that is.
const coversDir = (db: Db) => join(dirname(db.$client.name), "covers");

const fileName = (coverPath: string, size: CoverSize) =>
  size === "full" ? coverPath : coverPath.replace(/\.jpg$/, "-thumb.jpg");

export const coverUrls = (bookId: string, coverPath: string | null) =>
  coverPath
    ? {
        coverUrl: `/api/v1/books/${bookId}/cover?v=${coverPath}`,
        thumbnailUrl: `/api/v1/books/${bookId}/cover?size=thumb&v=${coverPath}`,
      }
    : { coverUrl: null, thumbnailUrl: null };

/**
 * Stores an uploaded image as the book's cover, re-encoded as JPEG, together
 * with a small thumbnail for the library grid. Replaces any previous cover.
 */
export async function saveCover(db: Db, bookId: string, image: Uint8Array) {
  const [row] = await db
    .select({ coverPath: book.coverPath })
    .from(book)
    .where(eq(book.id, bookId));
  if (!row) throw new ApiError(404, "not_found", "Book not found");

  let full: Buffer;
  let thumb: Buffer;
  try {
    const source = sharp(image).rotate();
    full = await source
      .clone()
      .resize({
        width: 1200,
        height: 1800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    thumb = await source
      .clone()
      .resize({ width: 320, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new ApiError(400, "bad_request", "The file is not a readable image");
  }

  const dir = coversDir(db);
  await mkdir(dir, { recursive: true });
  const coverPath = `${randomUUID()}.jpg`;
  await writeFile(join(dir, fileName(coverPath, "full")), full);
  await writeFile(join(dir, fileName(coverPath, "thumb")), thumb);
  await db.update(book).set({ coverPath }).where(eq(book.id, bookId));
  if (row.coverPath) await deleteCoverFiles(db, row.coverPath);
  return coverPath;
}

/**
 * Looks up the book's ISBNs in turn and stores the first cover the catalogues
 * have, as `saveCover` does. 404 `cover_not_found` when none has one, 502
 * `metadata_unavailable` when a lookup could not reach them.
 */
export async function lookUpCover(db: Db, bookId: string) {
  const exists = db
    .select({ id: book.id })
    .from(book)
    .where(eq(book.id, bookId))
    .get();
  if (!exists) throw new ApiError(404, "not_found", "Book not found");
  const identifiers = db
    .select({ isbn13: bookIdentifier.isbn13 })
    .from(bookIdentifier)
    .where(eq(bookIdentifier.bookId, bookId))
    .orderBy(asc(bookIdentifier.isbn13))
    .all();
  let unreachable = false;
  for (const { isbn13 } of identifiers) {
    const found = await lookupIsbn(isbn13);
    if (found === "unavailable") unreachable = true;
    if (typeof found === "string" || !found.coverUrl) continue;
    try {
      const { bytes } = await downloadCover(found.coverUrl);
      await saveCover(db, bookId, bytes);
      return;
    } catch (error) {
      console.warn(`Cover ${found.coverUrl} not stored: ${error}`);
    }
  }
  if (unreachable) {
    throw new ApiError(
      502,
      "metadata_unavailable",
      "No metadata source could be reached",
    );
  }
  throw new ApiError(
    404,
    "cover_not_found",
    "No catalogue has a cover for this book",
  );
}

export async function readCover(db: Db, bookId: string, size: CoverSize) {
  const [row] = await db
    .select({ coverPath: book.coverPath })
    .from(book)
    .where(eq(book.id, bookId));
  if (!row?.coverPath) {
    throw new ApiError(404, "not_found", "This book has no cover");
  }
  return readFile(join(coversDir(db), fileName(row.coverPath, size)));
}

export async function deleteCoverFiles(db: Db, coverPath: string) {
  for (const size of ["full", "thumb"] as const) {
    await rm(join(coversDir(db), fileName(coverPath, size)), { force: true });
  }
}
