import { asc, count, eq } from "drizzle-orm";
import { ApiError } from "../../api/errors.ts";
import type { Db } from "../../db/client.ts";
import { book, genre } from "../../db/schema.ts";

const notFound = () => new ApiError(404, "not_found", "Genre not found");

/** Every genre with the number of books that have it. */
export function listGenres(db: Db) {
  return db
    .select({
      id: genre.id,
      key: genre.key,
      name: genre.name,
      bookCount: count(book.id),
    })
    .from(genre)
    .leftJoin(book, eq(book.genreId, genre.id))
    .groupBy(genre.id)
    .orderBy(asc(genre.key), asc(genre.name))
    .all();
}

function getGenre(db: Db, id: string) {
  const found = listGenres(db).find((g) => g.id === id);
  if (!found) throw notFound();
  return found;
}

const comparable = (name: string) => name.toLocaleLowerCase();

function assertNameFree(db: Db, name: string, id?: string) {
  const taken = db
    .select({ id: genre.id, name: genre.name })
    .from(genre)
    .all()
    .some(
      (g) =>
        g.id !== id &&
        g.name !== null &&
        comparable(g.name) === comparable(name),
    );
  if (taken) {
    throw new ApiError(409, "genre_exists", "A genre with this name exists");
  }
}

export function assertGenreExists(db: Db, id: string | null | undefined) {
  if (!id) return;
  const found = db
    .select({ id: genre.id })
    .from(genre)
    .where(eq(genre.id, id))
    .get();
  if (!found) throw new ApiError(400, "bad_request", "Unknown genre");
}

export function createGenre(db: Db, name: string) {
  assertNameFree(db, name);
  const created = db
    .insert(genre)
    .values({ name })
    .returning({ id: genre.id })
    .get();
  return getGenre(db, created.id);
}

/** A built-in genre keeps its key, so lookups still guess it. */
export function renameGenre(db: Db, id: string, name: string) {
  getGenre(db, id);
  assertNameFree(db, name, id);
  db.update(genre).set({ name }).where(eq(genre.id, id)).run();
  return getGenre(db, id);
}

/** The genre's books are left without a genre. */
export function deleteGenre(db: Db, id: string) {
  getGenre(db, id);
  db.transaction((tx) => {
    tx.update(book).set({ genreId: null }).where(eq(book.genreId, id)).run();
    tx.delete(genre).where(eq(genre.id, id)).run();
  });
}
