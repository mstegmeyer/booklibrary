import { asc, eq } from "drizzle-orm";
import { ApiError } from "../../api/errors.ts";
import type { Db } from "../../db/client.ts";
import { book, bookIdentifier, copy, genre } from "../../db/schema.ts";
import { guessBinding } from "../metadata/guess-binding.ts";
import { guessGenre } from "../metadata/guess-genre.ts";
import { downloadCover, lookupIsbn, merge } from "../metadata/service.ts";
import type { Candidate } from "../metadata/source.ts";
import { saveCover } from "./covers.ts";
import { type BookInput, updateBook } from "./service.ts";

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** The book's ISBNs looked up and combined, like a lookup when adding. */
async function lookUp(isbns: string[]) {
  let unreachable = false;
  const found: Candidate[] = [];
  for (const isbn13 of isbns) {
    const result = await lookupIsbn(isbn13);
    if (result === "unavailable") unreachable = true;
    else if (result !== "not_found") found.push(result);
  }
  const [base, ...rest] = found;
  if (base) return rest.reduce(merge, base);
  if (unreachable) {
    throw new ApiError(
      502,
      "metadata_unavailable",
      "No metadata source could be reached",
    );
  }
  throw new ApiError(404, "metadata_not_found", "No source knows this book");
}

/**
 * Replaces the book's details with what the catalogues say about its ISBNs:
 * metadata, cover and genre, and with a single ISBN the copies' format. What
 * the catalogues lack keeps its value. Returns what changed for the files.
 */
export async function refreshFromCatalogue(db: Db, bookId: string) {
  const current = db.select().from(book).where(eq(book.id, bookId)).get();
  if (!current) throw new ApiError(404, "not_found", "Book not found");
  const isbns = db
    .select({ isbn13: bookIdentifier.isbn13 })
    .from(bookIdentifier)
    .where(eq(bookIdentifier.bookId, bookId))
    .orderBy(asc(bookIdentifier.isbn13))
    .all()
    .map((row) => row.isbn13);
  if (isbns.length === 0) {
    throw new ApiError(404, "metadata_not_found", "The book has no ISBN");
  }
  const found = await lookUp(isbns);

  const guessed = guessGenre(found.categories, found.subtitle).genre;
  const genreId = guessed
    ? db
        .select({ id: genre.id })
        .from(genre)
        .where(eq(genre.key, guessed))
        .get()?.id
    : undefined;
  const replacements: Partial<BookInput> = {
    title: found.title,
    subtitle: found.subtitle ?? undefined,
    authors: found.authors.length > 0 ? found.authors : undefined,
    description: found.description ?? undefined,
    pageCount: found.pageCount ?? undefined,
    publishedYear: found.publishedYear ?? undefined,
    language: found.language ?? undefined,
    genreId,
  };
  // Only what differs is sent, so unchanged authors keep a hand-made "Sort as".
  const changes = Object.fromEntries(
    Object.entries(replacements).filter(
      ([key, value]) =>
        value !== undefined &&
        !same(value, current[key as keyof typeof current]),
    ),
  ) as Partial<BookInput>;
  const { titleOrAuthorsChanged } = updateBook(db, bookId, changes);
  db.update(book)
    .set({ metadataSource: found.sources.join(",") })
    .where(eq(book.id, bookId))
    .run();

  // Which copy is which edition is unknown once the book has several ISBNs.
  const format = isbns.length === 1 ? guessBinding(found.bindings) : null;
  if (format) {
    db.update(copy).set({ format }).where(eq(copy.bookId, bookId)).run();
  }

  let coverStored = false;
  if (found.coverUrl) {
    try {
      const { bytes } = await downloadCover(found.coverUrl);
      await saveCover(db, bookId, bytes);
      coverStored = true;
    } catch (error) {
      console.warn(`Cover ${found.coverUrl} not stored: ${error}`);
    }
  }
  return { titleOrAuthorsChanged, coverStored };
}
