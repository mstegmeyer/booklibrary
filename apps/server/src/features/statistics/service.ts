import { and, asc, eq } from "drizzle-orm";
import { ApiError } from "../../api/errors.ts";
import type { Db } from "../../db/client.ts";
import {
  book,
  genre,
  reading,
  readingProgress,
  user,
} from "../../db/schema.ts";
import type { GenreRef } from "../books/service.ts";
import { owned, today } from "../reading/service.ts";

/** Everyone in the household, for choosing whose statistics to show. */
export function listMembers(db: Db) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .orderBy(asc(user.name), asc(user.id))
    .all();
}

/**
 * Pages read per date. Each progress entry counts its increase over the
 * previous entry of the same read-through (the first from page 0); a dated
 * finished read without entries counts all its pages on the finish date.
 * Books without a page count contribute nothing.
 */
function pagesByDate(
  entries: {
    readingId: string;
    date: string;
    page: number;
    pageCount: number | null;
  }[],
  reads: { id: string; endedOn: string | null; pageCount: number | null }[],
) {
  const pages: { date: string; pages: number }[] = [];
  let previous = { readingId: "", page: 0 };
  for (const entry of entries) {
    if (entry.pageCount === null) continue;
    const page = Math.min(entry.page, entry.pageCount);
    const from = previous.readingId === entry.readingId ? previous.page : 0;
    pages.push({ date: entry.date, pages: Math.max(0, page - from) });
    previous = { readingId: entry.readingId, page };
  }
  const withEntries = new Set(entries.map((entry) => entry.readingId));
  for (const read of reads) {
    if (read.endedOn && read.pageCount && !withEntries.has(read.id)) {
      pages.push({ date: read.endedOn, pages: read.pageCount });
    }
  }
  return pages;
}

const yearOf = (date: string) => Number(date.slice(0, 4));
const monthOf = (date: string) => Number(date.slice(5, 7)) - 1;

function perMonth(values: { date: string; n: number }[], year: number) {
  const months = Array<number>(12).fill(0);
  for (const { date, n } of values) {
    if (yearOf(date) === year)
      months[monthOf(date)] = (months[monthOf(date)] ?? 0) + n;
  }
  return months;
}

/** Days of `year` that have passed, today included. */
function daysPassed(year: number) {
  const now = today();
  const days = (date: string) =>
    Date.UTC(yearOf(date), monthOf(date), Number(date.slice(8, 10))) /
    86_400_000;
  if (year > yearOf(now)) return 0;
  const end = year < yearOf(now) ? `${year}-12-31` : now;
  return days(end) - days(`${year}-01-01`) + 1;
}

/** Books per genre, most first; books without a genre last. */
function perGenre(reads: { genre: GenreRef | null }[]) {
  const counts = new Map<
    string | null,
    { genre: GenreRef | null; books: number }
  >();
  for (const read of reads) {
    const id = read.genre?.id ?? null;
    const entry = counts.get(id) ?? { genre: read.genre, books: 0 };
    entry.books++;
    counts.set(id, entry);
  }
  return [...counts.values()].sort(
    (a, b) =>
      Number(a.genre === null) - Number(b.genre === null) || b.books - a.books,
  );
}

/**
 * Reading statistics of one user, or of the whole household when `userId` is
 * missing (a book read by two people counts twice).
 */
export function statistics(db: Db, userId: string | undefined, year: number) {
  if (userId && !db.select().from(user).where(eq(user.id, userId)).get()) {
    throw new ApiError(404, "not_found", "User not found");
  }
  const who = userId ? eq(reading.userId, userId) : undefined;
  const reads = db
    .select({
      id: reading.id,
      endedOn: reading.endedOn,
      pageCount: book.pageCount,
      inLibrary: owned.mapWith(Boolean),
      genre: { id: genre.id, key: genre.key, name: genre.name },
    })
    .from(reading)
    .innerJoin(book, eq(book.id, reading.bookId))
    .leftJoin(genre, eq(genre.id, book.genreId))
    .where(and(who, eq(reading.status, "read")))
    .all();
  const entries = db
    .select({
      readingId: readingProgress.readingId,
      date: readingProgress.date,
      page: readingProgress.page,
      pageCount: book.pageCount,
    })
    .from(readingProgress)
    .innerJoin(reading, eq(reading.id, readingProgress.readingId))
    .innerJoin(book, eq(book.id, reading.bookId))
    .where(who)
    .orderBy(
      asc(readingProgress.readingId),
      asc(readingProgress.date),
      asc(readingProgress.page),
    )
    .all();
  const pages = pagesByDate(entries, reads);

  const finished = reads.filter((r) => r.endedOn && yearOf(r.endedOn) === year);
  const booksPerMonth = perMonth(
    finished.map((read) => ({ date: read.endedOn ?? "", n: 1 })),
    year,
  );
  const pagesPerMonth = perMonth(
    pages.map((day) => ({ date: day.date, n: day.pages })),
    year,
  );
  const pagesRead = pagesPerMonth.reduce((sum, n) => sum + n, 0);
  const days = daysPassed(year);

  const perYear = new Map<number, number>();
  for (const read of reads) {
    if (!read.endedOn) continue;
    const y = yearOf(read.endedOn);
    perYear.set(y, (perYear.get(y) ?? 0) + 1);
  }
  const years = new Set([
    ...perYear.keys(),
    ...entries.map((entry) => yearOf(entry.date)),
  ]);

  return {
    year,
    booksFinished: finished.length,
    pagesRead,
    pagesPerDay: days ? Math.round(pagesRead / days) : 0,
    notInLibrary: finished.filter((read) => !read.inLibrary).length,
    booksPerMonth,
    pagesPerMonth,
    byGenre: perGenre(finished),
    booksPerYear: [...perYear]
      .map(([y, books]) => ({ year: y, books }))
      .sort((a, b) => a.year - b.year),
    undated: reads.filter((read) => !read.endedOn).length,
    allTime: reads.length,
    years: [...years].sort((a, b) => a - b),
  };
}
