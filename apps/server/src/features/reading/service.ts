import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNull,
  like,
  lt,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { ApiError } from "../../api/errors.ts";
import { decodeCursor, toPage } from "../../api/pagination.ts";
import type { Db } from "../../db/client.ts";
import { book, reading, readingProgress, user } from "../../db/schema.ts";
import { coverUrls } from "../books/covers.ts";
import { deleteBookIfUnreferenced, updateBook } from "../books/service.ts";

/** The statuses a user picks directly; "read" is set by finishing. */
export type ActiveStatus = "want" | "reading" | "abandoned";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Today's date on the server as `YYYY-MM-DD`. */
export const today = () => isoDate(new Date());

const bookNotFound = () => new ApiError(404, "not_found", "Book not found");

function findBook(db: Db, bookId: string) {
  const found = db
    .select({ id: book.id, pageCount: book.pageCount })
    .from(book)
    .where(eq(book.id, bookId))
    .get();
  if (!found) throw bookNotFound();
  return found;
}

/** The user's read-throughs of a book, newest (the current status) first. */
function readThroughs(db: Db | Tx, userId: string, bookId: string) {
  return db
    .select()
    .from(reading)
    .where(and(eq(reading.userId, userId), eq(reading.bookId, bookId)))
    .orderBy(desc(reading.createdAt), desc(reading.id))
    .all();
}

// Written out with table names: Drizzle leaves columns unqualified in
// single-table queries, which would bind them to the subquery's table.
const lastPage = sql<
  number | null
>`(select "page" from "reading_progress" where "reading_progress"."reading_id" = "reading"."id" order by "date" desc, "page" desc limit 1)`;
/** Whether the household owns the read book as a copy or an e-book file. */
export const owned = sql`(exists (select 1 from "copy" where "copy"."book_id" = "reading"."book_id") or exists (select 1 from "book_file" where "book_file"."book_id" = "reading"."book_id"))`;
const borrowed = sql`exists (select 1 from "loan" where "loan"."book_id" = "reading"."book_id" and "loan"."direction" = 'borrowed' and "loan"."ended_on" is null)`;

/** The signed-in user's reading of a book with their earlier read-throughs. */
export function getMyReading(db: Db, userId: string, bookId: string) {
  findBook(db, bookId);
  const [current, ...earlier] = readThroughs(db, userId, bookId);
  const page = current
    ? (db
        .select({ page: lastPage })
        .from(reading)
        .where(eq(reading.id, current.id))
        .get()?.page ?? null)
    : null;
  return {
    current: current
      ? {
          id: current.id,
          status: current.status,
          startedOn: current.startedOn,
          endedOn: current.endedOn,
          createdAt: current.createdAt,
          page,
        }
      : null,
    earlier: earlier.map((r) => ({
      id: r.id,
      status: r.status,
      startedOn: r.startedOn,
      endedOn: r.endedOn,
    })),
  };
}

/** A new row must sort after the current one even within the same millisecond. */
const nextCreatedAt = (current?: { createdAt: number }) =>
  Math.max(Date.now(), (current?.createdAt ?? 0) + 1);

export function setStatus(
  db: Db,
  userId: string,
  bookId: string,
  status: ActiveStatus,
  date = today(),
) {
  findBook(db, bookId);
  const [current] = readThroughs(db, userId, bookId);
  if (!current || current.status === "read") {
    if (current && status === "abandoned") {
      throw new ApiError(
        409,
        "conflict",
        "A finished book cannot be abandoned",
      );
    }
    db.insert(reading)
      .values({
        userId,
        bookId,
        status,
        startedOn: status === "reading" ? date : null,
        endedOn: status === "abandoned" ? date : null,
        createdAt: nextCreatedAt(current),
      })
      .run();
  } else if (current.status !== status) {
    db.update(reading)
      .set({
        status,
        startedOn:
          status === "reading"
            ? (current.startedOn ?? date)
            : current.startedOn,
        endedOn: status === "abandoned" ? date : null,
      })
      .where(eq(reading.id, current.id))
      .run();
  }
}

/** Changes the start date of the current read-through; null forgets it. */
export function setStartDate(
  db: Db,
  userId: string,
  bookId: string,
  date: string | null,
) {
  findBook(db, bookId);
  const [current] = readThroughs(db, userId, bookId);
  if (!current) throw new ApiError(404, "not_found", "No reading status");
  db.update(reading)
    .set({ startedOn: date })
    .where(eq(reading.id, current.id))
    .run();
}

/** Saves the total page count on a book that has none yet. */
function completePageCount(
  db: Db,
  found: { id: string; pageCount: number | null },
  pageCount: number | undefined,
) {
  if (found.pageCount !== null || !pageCount) return found.pageCount;
  updateBook(db, found.id, { pageCount });
  return pageCount;
}

/**
 * Marks the book as read on `date` (null: the user does not remember). On a
 * book already read this changes the finish date. With a date and a known
 * page count the read-through ends with a progress entry on the last page.
 */
export function finish(
  db: Db,
  userId: string,
  bookId: string,
  input: { date: string | null; pageCount?: number },
) {
  const pageCount = completePageCount(
    db,
    findBook(db, bookId),
    input.pageCount,
  );
  db.transaction((tx) => {
    const [current] = readThroughs(tx, userId, bookId);
    let id: string;
    if (!current) {
      id = tx
        .insert(reading)
        .values({ userId, bookId, status: "read", endedOn: input.date })
        .returning({ id: reading.id })
        .get().id;
    } else {
      id = current.id;
      // The final entry follows the finish date when that changes.
      if (current.status === "read" && current.endedOn && pageCount) {
        tx.delete(readingProgress)
          .where(
            and(
              eq(readingProgress.readingId, id),
              eq(readingProgress.date, current.endedOn),
              gte(readingProgress.page, pageCount),
            ),
          )
          .run();
      }
      tx.update(reading)
        .set({ status: "read", endedOn: input.date })
        .where(eq(reading.id, id))
        .run();
    }
    if (!input.date || !pageCount) return;
    const page = tx
      .select({ page: lastPage })
      .from(reading)
      .where(eq(reading.id, id))
      .get()?.page;
    if (page == null || page < pageCount) {
      tx.insert(readingProgress)
        .values({ readingId: id, date: input.date, page: pageCount })
        .run();
    }
  });
}

export function addProgress(
  db: Db,
  userId: string,
  bookId: string,
  input: { date: string; page: number; pageCount?: number },
) {
  const found = findBook(db, bookId);
  const [current] = readThroughs(db, userId, bookId);
  if (current?.status !== "reading") {
    throw new ApiError(409, "conflict", "You are not reading this book");
  }
  const pageCount = found.pageCount ?? input.pageCount;
  if (pageCount && input.page > pageCount) {
    throw new ApiError(400, "bad_request", "The book has fewer pages");
  }
  completePageCount(db, found, input.pageCount);
  db.insert(readingProgress)
    .values({ readingId: current.id, date: input.date, page: input.page })
    .run();
}

/**
 * Removes the current read-through with its progress, so an earlier one
 * becomes current again. Deletes the book when nothing refers to it any more.
 */
export async function clearStatus(db: Db, userId: string, bookId: string) {
  findBook(db, bookId);
  const [current] = readThroughs(db, userId, bookId);
  if (!current) throw new ApiError(404, "not_found", "No reading status");
  db.delete(reading).where(eq(reading.id, current.id)).run();
  const { kept } = await deleteBookIfUnreferenced(db, bookId);
  return { bookKept: kept };
}

/** The other household members' current status for a book. */
export function householdReading(db: Db, userId: string, bookId: string) {
  findBook(db, bookId);
  const rows = db
    .select({
      userId: reading.userId,
      name: user.name,
      status: reading.status,
      startedOn: reading.startedOn,
      endedOn: reading.endedOn,
    })
    .from(reading)
    .innerJoin(user, eq(user.id, reading.userId))
    .where(eq(reading.bookId, bookId))
    .orderBy(asc(user.name), desc(reading.createdAt), desc(reading.id))
    .all();
  const seen = new Set([userId]);
  return rows
    .filter((row) => !seen.has(row.userId) && seen.add(row.userId))
    .map(({ userId: id, name, ...status }) => ({
      user: { id, name },
      ...status,
    }));
}

const listColumns = {
  id: reading.id,
  status: reading.status,
  startedOn: reading.startedOn,
  endedOn: reading.endedOn,
  createdAt: reading.createdAt,
  page: lastPage,
  inLibrary: owned.mapWith(Boolean),
  borrowed: borrowed.mapWith(Boolean),
  bookId: book.id,
  title: book.title,
  authors: book.authors,
  pageCount: book.pageCount,
  coverPath: book.coverPath,
};

const readingList = (db: Db) =>
  db
    .select(listColumns)
    .from(reading)
    .innerJoin(book, eq(book.id, reading.bookId));

type ListRow = ReturnType<ReturnType<typeof readingList>["all"]>[number];

const toItem = ({
  bookId,
  title,
  authors,
  pageCount,
  coverPath,
  createdAt: _,
  ...rest
}: ListRow) => ({
  ...rest,
  book: {
    id: bookId,
    title,
    authors,
    pageCount,
    ...coverUrls(bookId, coverPath),
  },
});

/** The books the user is reading now, most recently started first. */
export function listCurrent(db: Db, userId: string) {
  return readingList(db)
    .where(and(eq(reading.userId, userId), eq(reading.status, "reading")))
    .orderBy(desc(reading.createdAt), desc(reading.id))
    .all()
    .map(toItem);
}

type PageQuery = { cursor?: string; limit: number };

/** A page of read-throughs sorted newest first by `sortBy`, with the total. */
function pageOf(
  db: Db,
  where: SQL | undefined,
  sortBy: typeof reading.createdAt | typeof reading.endedOn,
  { cursor, limit }: PageQuery,
) {
  const total =
    db.select({ n: count() }).from(reading).where(where).get()?.n ?? 0;
  let after: SQL | undefined;
  if (cursor) {
    const [value, id] = decodeCursor(cursor);
    after = or(
      lt(sortBy, value as never),
      and(eq(sortBy, value as never), lt(reading.id, String(id))),
    );
  }
  const rows = readingList(db)
    .where(and(where, after))
    .orderBy(desc(sortBy), desc(reading.id))
    .limit(limit + 1)
    .all();
  const page = toPage(rows, limit, (row) => [
    (sortBy === reading.endedOn ? row.endedOn : row.createdAt) ?? "",
    row.id,
  ]);
  return { items: page.items.map(toItem), nextCursor: page.nextCursor, total };
}

/**
 * Books the user wants to read. "Within reach" means the household owns a
 * copy or an e-book file or has borrowed the book; everything else is the
 * wishlist.
 */
export function listWanted(
  db: Db,
  userId: string,
  reach: "within" | "wishlist",
  query: PageQuery,
) {
  const withinReach = or(owned, borrowed);
  return pageOf(
    db,
    and(
      eq(reading.userId, userId),
      eq(reading.status, "want"),
      reach === "within" ? withinReach : not(withinReach as SQL),
    ),
    reading.createdAt,
    query,
  );
}

/** Finished read-throughs, of one year or without a date. */
export function listFinished(
  db: Db,
  userId: string,
  year: number | "undated",
  query: PageQuery,
) {
  const mine = and(eq(reading.userId, userId), eq(reading.status, "read"));
  return year === "undated"
    ? pageOf(db, and(mine, isNull(reading.endedOn)), reading.createdAt, query)
    : pageOf(
        db,
        and(mine, like(reading.endedOn, `${year}-%`)),
        reading.endedOn,
        query,
      );
}

export function listAbandoned(db: Db, userId: string, query: PageQuery) {
  return pageOf(
    db,
    and(eq(reading.userId, userId), eq(reading.status, "abandoned")),
    reading.endedOn,
    query,
  );
}
