import { eq } from "drizzle-orm";
import type { Db } from "../../db/client.ts";
import { bookIdentifier, genre } from "../../db/schema.ts";
import { guessGenre } from "./guess-genre.ts";
import type { Candidate } from "./source.ts";

/**
 * A lookup's result as clients get it: the categories turned into a guess of
 * a built-in genre that still exists. A book the system already has gets no
 * guess, because adding to it leaves its genre alone.
 */
export function withGuesses(db: Db, found: Candidate) {
  const { categories, ...candidate } = found;
  const bookId = found.isbn13
    ? (db
        .select({ bookId: bookIdentifier.bookId })
        .from(bookIdentifier)
        .where(eq(bookIdentifier.isbn13, found.isbn13))
        .get()?.bookId ?? null)
    : null;
  const key = bookId ? null : guessGenre(categories, found.subtitle).genre;
  const genreId = key
    ? (db.select({ id: genre.id }).from(genre).where(eq(genre.key, key)).get()
        ?.id ?? null)
    : null;
  return { ...candidate, bookId, genreId };
}
