import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { ApiError } from "../../api/errors.ts";
import type { Db } from "../../db/client.ts";
import { book } from "../../db/schema.ts";

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
