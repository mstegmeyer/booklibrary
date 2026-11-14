import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  ne,
  not,
  or,
  type SQL,
  type SQLWrapper,
  sql,
} from "drizzle-orm";
import { ApiError } from "../../api/errors.ts";
import { decodeCursor, toPage } from "../../api/pagination.ts";
import type { Db } from "../../db/client.ts";
import {
  book,
  type bookFormats,
  bookIdentifier,
  contact,
  copy,
  loan,
  location,
  reading,
  readingProgress,
  type readingStatuses,
  user,
} from "../../db/schema.ts";
import {
  countPlaces,
  locationPaths,
  locationWithDescendants,
} from "../locations/service.ts";
import { coverUrls, deleteCoverFiles } from "./covers.ts";
import { normalizeIsbn } from "./isbn.ts";

export type BookFormat = (typeof bookFormats)[number];
export type ReadingStatus = (typeof readingStatuses)[number];
export type LibrarySort = "added" | "title" | "author";

export type LibraryQuery = {
  q?: string;
  locationId?: string;
  availability?: "shelf" | "lent";
  reading?: ReadingStatus | "none";
  sort?: LibrarySort;
  cursor?: string;
  limit: number;
};

export type BookInput = {
  title: string;
  subtitle?: string | null;
  authors?: string[];
  description?: string | null;
  pageCount?: number | null;
  publishedYear?: number | null;
  language?: string | null;
  /** ISBN-13s as returned by `normalizeIsbn`. */
  isbns?: string[];
};

export type CopyInput = {
  locationId?: string | null;
  format?: BookFormat | null;
  note?: string | null;
};

const bookNotFound = () => new ApiError(404, "not_found", "Book not found");
const copyNotFound = () => new ApiError(404, "not_found", "Copy not found");

const isActiveLend = and(eq(loan.direction, "lent"), isNull(loan.endedOn));

const ownedBook = exists(
  sql`(select 1 from ${copy} where ${copy.bookId} = ${book.id})`,
);

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const contains = (column: SQLWrapper, value: string) =>
  sql`${column} like ${`%${escapeLike(value)}%`} escape '\\'`;

function searchCondition(q: string) {
  const conditions = [contains(book.title, q), contains(book.authors, q)];
  const compact = q.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d+X?$/.test(compact)) {
    const isbn = normalizeIsbn(compact) ?? compact;
    conditions.push(
      exists(
        sql`(select 1 from ${bookIdentifier} where ${bookIdentifier.bookId} = ${book.id} and ${contains(bookIdentifier.isbn13, isbn)})`,
      ),
    );
  }
  return or(...conditions);
}

const currentReadingStatus = (userId: string) =>
  sql`(select ${reading.status} from ${reading} where ${reading.userId} = ${userId} and ${reading.bookId} = ${book.id} order by ${reading.createdAt} desc, ${reading.id} desc limit 1)`;

type SortKey = {
  expr: SQL | SQLWrapper;
  of: (row: SortRow) => string | number;
};
type SortRow = {
  id: string;
  title: string;
  authors: string[];
  createdAt: number;
};

const byTitle = sql`${book.title} collate nocase`;
const firstAuthor = sql`coalesce(json_extract(${book.authors}, '$[0]'), '') collate nocase`;

const sorts: Record<LibrarySort, { dir: "asc" | "desc"; keys: SortKey[] }> = {
  added: {
    dir: "desc",
    keys: [
      { expr: book.createdAt, of: (r) => r.createdAt },
      { expr: book.id, of: (r) => r.id },
    ],
  },
  title: {
    dir: "asc",
    keys: [
      { expr: byTitle, of: (r) => r.title },
      { expr: book.id, of: (r) => r.id },
    ],
  },
  author: {
    dir: "asc",
    keys: [
      { expr: firstAuthor, of: (r) => r.authors[0] ?? "" },
      { expr: byTitle, of: (r) => r.title },
      { expr: book.id, of: (r) => r.id },
    ],
  },
};

/** Rows that sort after `values` (keyset pagination over several keys). */
function after(keys: SortKey[], dir: "asc" | "desc", values: unknown[]) {
  const op = sql.raw(dir === "asc" ? ">" : "<");
  return or(
    ...keys.map((key, i) =>
      and(
        ...keys
          .slice(0, i)
          .map((earlier, j) => sql`${earlier.expr} = ${values[j]}`),
        sql`${key.expr} ${op} ${values[i]}`,
      ),
    ),
  );
}

/** The books the household owns, filtered and sorted for the Library. */
export async function listLibrary(db: Db, userId: string, query: LibraryQuery) {
  const sort = sorts[query.sort ?? "added"];
  const conditions: (SQL | undefined)[] = [ownedBook];

  const q = query.q?.trim();
  if (q) conditions.push(searchCondition(q));
  if (query.locationId) {
    const ids = await locationWithDescendants(db, query.locationId);
    conditions.push(
      exists(
        db
          .select({ id: copy.id })
          .from(copy)
          .where(and(eq(copy.bookId, book.id), inArray(copy.locationId, ids))),
      ),
    );
  }
  if (query.availability === "lent") {
    conditions.push(
      exists(
        db
          .select({ id: loan.id })
          .from(loan)
          .where(and(eq(loan.bookId, book.id), isActiveLend)),
      ),
    );
  } else if (query.availability === "shelf") {
    conditions.push(
      exists(
        db
          .select({ id: copy.id })
          .from(copy)
          .where(
            and(
              eq(copy.bookId, book.id),
              not(
                exists(
                  db
                    .select({ id: loan.id })
                    .from(loan)
                    .where(and(eq(loan.copyId, copy.id), isActiveLend)),
                ),
              ),
            ),
          ),
      ),
    );
  }
  if (query.reading === "none") {
    conditions.push(sql`${currentReadingStatus(userId)} is null`);
  } else if (query.reading) {
    conditions.push(sql`${currentReadingStatus(userId)} = ${query.reading}`);
  }
  if (query.cursor) {
    conditions.push(after(sort.keys, sort.dir, decodeCursor(query.cursor)));
  }

  const order = sort.dir === "asc" ? asc : desc;
  const rows = await db
    .select({
      id: book.id,
      title: book.title,
      authors: book.authors,
      pageCount: book.pageCount,
      coverPath: book.coverPath,
      createdAt: book.createdAt,
    })
    .from(book)
    .where(and(...conditions))
    .orderBy(...sort.keys.map((key) => order(key.expr)))
    .limit(query.limit + 1);

  const page = toPage(rows, query.limit, (row) =>
    sort.keys.map((key) => key.of(row)),
  );
  return {
    items: await toLibraryItems(db, userId, page.items),
    nextCursor: page.nextCursor,
  };
}

async function toLibraryItems(
  db: Db,
  userId: string,
  rows: {
    id: string;
    title: string;
    authors: string[];
    pageCount: number | null;
    coverPath: string | null;
  }[],
) {
  const ids = rows.map((row) => row.id);
  const [copies, readings, paths] = await Promise.all([
    copiesWithLoans(db, ids),
    currentReadings(db, userId, ids),
    locationPaths(db),
  ]);

  return rows.map((row) => {
    const own = copies.filter((c) => c.bookId === row.id);
    const available = own.find((c) => c.contactName === null);
    const current = readings.get(row.id);
    return {
      id: row.id,
      title: row.title,
      authors: row.authors,
      pageCount: row.pageCount,
      ...coverUrls(row.id, row.coverPath),
      copyCount: own.length,
      availability: available ? ("shelf" as const) : ("lent" as const),
      locationPath: available?.locationId
        ? (paths.get(available.locationId) ?? [])
        : [],
      lentTo: available ? null : (own[0]?.contactName ?? null),
      reading: current
        ? {
            status: current.status,
            progress:
              current.status === "reading" &&
              current.page !== null &&
              row.pageCount
                ? Math.min(
                    100,
                    Math.round((current.page / row.pageCount) * 100),
                  )
                : null,
          }
        : null,
    };
  });
}

async function copiesWithLoans(db: Db, bookIds: string[]) {
  if (bookIds.length === 0) return [];
  return db
    .select({
      id: copy.id,
      bookId: copy.bookId,
      locationId: copy.locationId,
      format: copy.format,
      note: copy.note,
      createdAt: copy.createdAt,
      contactName: contact.name,
      lentSince: loan.startedOn,
    })
    .from(copy)
    .leftJoin(loan, and(eq(loan.copyId, copy.id), isActiveLend))
    .leftJoin(contact, eq(contact.id, loan.contactId))
    .where(inArray(copy.bookId, bookIds))
    .orderBy(asc(copy.createdAt), asc(copy.id));
}

/** The user's latest reading of each book, with the last page reached. */
async function currentReadings(db: Db, userId: string, bookIds: string[]) {
  const latest = new Map<
    string,
    { status: ReadingStatus; page: number | null }
  >();
  if (bookIds.length === 0) return latest;
  const rows = await db
    .select({ id: reading.id, bookId: reading.bookId, status: reading.status })
    .from(reading)
    .where(and(eq(reading.userId, userId), inArray(reading.bookId, bookIds)))
    .orderBy(desc(reading.createdAt), desc(reading.id));
  for (const row of rows) {
    if (latest.has(row.bookId)) continue;
    const [progress] = await db
      .select({ page: readingProgress.page })
      .from(readingProgress)
      .where(eq(readingProgress.readingId, row.id))
      .orderBy(desc(readingProgress.date), desc(readingProgress.page))
      .limit(1);
    latest.set(row.bookId, {
      status: row.status,
      page: progress?.page ?? null,
    });
  }
  return latest;
}

/** Figures for the Library header. */
export async function librarySummary(db: Db) {
  return {
    books: await db.$count(book, ownedBook),
    places: await countPlaces(db),
    lentOut: await db.$count(loan, isActiveLend),
  };
}

export async function getBook(db: Db, id: string) {
  const [row] = await db
    .select({ book, createdByName: user.name })
    .from(book)
    .innerJoin(user, eq(user.id, book.createdBy))
    .where(eq(book.id, id));
  if (!row) throw bookNotFound();
  const [identifiers, copies, paths] = await Promise.all([
    db
      .select({ isbn13: bookIdentifier.isbn13 })
      .from(bookIdentifier)
      .where(eq(bookIdentifier.bookId, id))
      .orderBy(asc(bookIdentifier.isbn13)),
    copiesWithLoans(db, [id]),
    locationPaths(db),
  ]);
  const b = row.book;
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    authors: b.authors,
    description: b.description,
    pageCount: b.pageCount,
    publishedYear: b.publishedYear,
    language: b.language,
    isbns: identifiers.map((i) => i.isbn13),
    ...coverUrls(b.id, b.coverPath),
    metadataSource: b.metadataSource,
    createdAt: b.createdAt,
    createdBy: { id: b.createdBy, name: row.createdByName },
    copies: copies.map((c) => ({
      id: c.id,
      format: c.format,
      note: c.note,
      location: c.locationId
        ? { id: c.locationId, path: paths.get(c.locationId) ?? [] }
        : null,
      loan:
        c.contactName !== null && c.lentSince !== null
          ? { contactName: c.contactName, startedOn: c.lentSince }
          : null,
    })),
  };
}

function assertIsbnsFree(db: Db, isbns: string[], bookId?: string) {
  if (isbns.length === 0) return;
  const taken = db
    .select({ bookId: bookIdentifier.bookId })
    .from(bookIdentifier)
    .where(
      and(
        inArray(bookIdentifier.isbn13, isbns),
        bookId ? ne(bookIdentifier.bookId, bookId) : undefined,
      ),
    )
    .get();
  if (taken) {
    throw new ApiError(
      409,
      "isbn_taken",
      "A book with this ISBN already exists",
      { bookId: taken.bookId },
    );
  }
}

function assertLocationExists(db: Db, locationId: string | null | undefined) {
  if (!locationId) return;
  const found = db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.id, locationId))
    .get();
  if (!found) throw new ApiError(400, "bad_request", "Unknown location");
}

const bookFields = (input: Partial<BookInput>) => ({
  title: input.title,
  subtitle: input.subtitle,
  authors: input.authors,
  description: input.description,
  pageCount: input.pageCount,
  publishedYear: input.publishedYear,
  language: input.language,
});

const unique = (values: string[]) => [...new Set(values)];

/** Creates a book, optionally with its first copy. Returns the new id. */
export function createBook(
  db: Db,
  userId: string,
  input: BookInput & { copy?: CopyInput },
) {
  const isbns = unique(input.isbns ?? []);
  assertIsbnsFree(db, isbns);
  assertLocationExists(db, input.copy?.locationId);
  return db.transaction((tx) => {
    const created = tx
      .insert(book)
      .values({ ...bookFields(input), title: input.title, createdBy: userId })
      .returning({ id: book.id })
      .get();
    for (const isbn13 of isbns) {
      tx.insert(bookIdentifier).values({ bookId: created.id, isbn13 }).run();
    }
    if (input.copy) {
      tx.insert(copy)
        .values({ ...input.copy, bookId: created.id, createdBy: userId })
        .run();
    }
    return created.id;
  });
}

export function updateBook(db: Db, id: string, input: Partial<BookInput>) {
  if (!db.select({ id: book.id }).from(book).where(eq(book.id, id)).get()) {
    throw bookNotFound();
  }
  const isbns = input.isbns && unique(input.isbns);
  if (isbns) assertIsbnsFree(db, isbns, id);
  db.transaction((tx) => {
    const fields = bookFields(input);
    if (Object.values(fields).some((value) => value !== undefined)) {
      tx.update(book).set(fields).where(eq(book.id, id)).run();
    }
    if (isbns) {
      tx.delete(bookIdentifier).where(eq(bookIdentifier.bookId, id)).run();
      for (const isbn13 of isbns) {
        tx.insert(bookIdentifier).values({ bookId: id, isbn13 }).run();
      }
    }
  });
}

export async function addCopy(
  db: Db,
  userId: string,
  bookId: string,
  input: CopyInput,
) {
  const [found] = await db
    .select({ id: book.id })
    .from(book)
    .where(eq(book.id, bookId));
  if (!found) throw bookNotFound();
  assertLocationExists(db, input.locationId);
  await db.insert(copy).values({ ...input, bookId, createdBy: userId });
}

async function findCopy(db: Db, bookId: string, copyId: string) {
  const [found] = await db
    .select({ id: copy.id })
    .from(copy)
    .where(and(eq(copy.id, copyId), eq(copy.bookId, bookId)));
  if (!found) throw copyNotFound();
}

export async function updateCopy(
  db: Db,
  bookId: string,
  copyId: string,
  input: CopyInput,
) {
  await findCopy(db, bookId, copyId);
  assertLocationExists(db, input.locationId);
  if (Object.values(input).some((value) => value !== undefined)) {
    await db.update(copy).set(input).where(eq(copy.id, copyId));
  }
}

/**
 * Removes a copy. When it was the book's last reference the book is deleted
 * too; `bookKept` tells whether it is still there.
 */
export async function removeCopy(db: Db, bookId: string, copyId: string) {
  await findCopy(db, bookId, copyId);
  const loans = await db
    .select({ endedOn: loan.endedOn })
    .from(loan)
    .where(eq(loan.copyId, copyId));
  if (loans.some((l) => l.endedOn === null)) {
    throw new ApiError(409, "copy_lent", "The copy is lent out");
  }
  // A lent loan must name its copy, so the copy has to stay for its history.
  if (loans.length > 0) {
    throw new ApiError(
      409,
      "copy_has_loans",
      "The copy has loan history and cannot be removed",
    );
  }
  await db.delete(copy).where(eq(copy.id, copyId));
  const { kept } = await deleteBookIfUnreferenced(db, bookId);
  return { bookKept: kept };
}

/**
 * Deletes a book (with its ISBNs and cover) once nothing refers to it any
 * more: no copies, reading records or loan records. Call it after removing
 * any of those. Returns whether the book was kept.
 */
export async function deleteBookIfUnreferenced(db: Db, bookId: string) {
  const referenced = (table: typeof copy | typeof reading | typeof loan) =>
    db.$count(table, eq(table.bookId, bookId));
  if (
    (await referenced(copy)) ||
    (await referenced(reading)) ||
    (await referenced(loan))
  ) {
    return { kept: true };
  }
  const [deleted] = await db
    .delete(book)
    .where(eq(book.id, bookId))
    .returning({ coverPath: book.coverPath });
  if (deleted?.coverPath) await deleteCoverFiles(db, deleted.coverPath);
  return { kept: false };
}
