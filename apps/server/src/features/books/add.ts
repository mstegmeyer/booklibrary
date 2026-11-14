import { and, eq, inArray } from "drizzle-orm";
import { ApiError } from "../../api/errors.ts";
import type { Db } from "../../db/client.ts";
import { book, bookIdentifier, copy } from "../../db/schema.ts";
import type { ContactInput } from "../contacts/service.ts";
import { borrowBook } from "../loans/service.ts";
import { downloadCover } from "../metadata/service.ts";
import type { SourceName } from "../metadata/source.ts";
import { getMyReading, setStatus, today } from "../reading/service.ts";
import { saveCover } from "./covers.ts";
import {
  assertIsbnsFree,
  assertLocationExists,
  type BookInput,
  type CopyInput,
  createBook,
  unique,
} from "./service.ts";

/** What the household has of the book: at most one of these is set. */
type Ownership = {
  copy?: CopyInput;
  borrowedFrom?: ContactInput;
  wantToRead?: boolean;
};

export type AddInput = BookInput &
  Ownership & {
    /** A cover found by a lookup; downloaded when the book is created. */
    coverUrl?: string;
    sources?: SourceName[];
    /** The answer to `same_book`: add to this book instead. */
    attachTo?: string;
    /** The answer to `same_book`: create a book of its own anyway. */
    keepSeparate?: boolean;
  };

export type AddOutcome = "created" | "known" | "attached";

const comparable = (text = "") =>
  text.toLowerCase().replace(/\p{P}/gu, "").replace(/\s+/g, " ").trim();

/** A book with the same title and first author, e.g. another edition. */
function findSameBook(db: Db, title: string, authors: string[] = []) {
  const wanted = [comparable(title), comparable(authors[0])];
  return db
    .select({ id: book.id, title: book.title, authors: book.authors })
    .from(book)
    .all()
    .find(
      (b) =>
        comparable(b.title) === wanted[0] &&
        comparable(b.authors[0]) === wanted[1],
    )?.id;
}

const hasCopies = (db: Db, bookId: string) =>
  db.select({ id: copy.id }).from(copy).where(eq(copy.bookId, bookId)).get() !==
  undefined;

/** Applies the ownership to a book; returns whether a reading status was kept. */
function applyOwnership(
  db: Db,
  userId: string,
  bookId: string,
  input: Ownership,
) {
  if (input.copy) {
    assertLocationExists(db, input.copy.locationId);
    db.insert(copy)
      .values({ ...input.copy, bookId, createdBy: userId })
      .run();
  }
  if (input.borrowedFrom) {
    borrowBook(db, bookId, { contact: input.borrowedFrom, startedOn: today() });
  }
  if (input.wantToRead) {
    if (getMyReading(db, userId, bookId).current) return true;
    setStatus(db, userId, bookId, "want");
  }
  return false;
}

/** Adds the ISBNs to an existing book and applies the ownership to it. */
function addToBook(
  db: Db,
  userId: string,
  bookId: string,
  isbns: string[],
  input: Ownership,
) {
  const found = db
    .select({ id: book.id })
    .from(book)
    .where(eq(book.id, bookId))
    .get();
  if (!found) throw new ApiError(404, "not_found", "Book not found");
  return db.transaction(() => {
    assertIsbnsFree(db, isbns, bookId);
    const known = db
      .select({ isbn13: bookIdentifier.isbn13 })
      .from(bookIdentifier)
      .where(
        and(
          eq(bookIdentifier.bookId, bookId),
          inArray(bookIdentifier.isbn13, isbns),
        ),
      )
      .all()
      .map((row) => row.isbn13);
    for (const isbn13 of isbns.filter((isbn) => !known.includes(isbn))) {
      db.insert(bookIdentifier).values({ bookId, isbn13 }).run();
    }
    return applyOwnership(db, userId, bookId, input);
  });
}

async function storeCover(db: Db, bookId: string, coverUrl: string) {
  try {
    const { bytes } = await downloadCover(coverUrl);
    await saveCover(db, bookId, bytes);
  } catch (error) {
    console.warn(`Cover for book ${bookId} not stored: ${error}`);
  }
}

/**
 * Adds a book with its ownership. An ISBN the system knows applies the
 * ownership to that book instead, unless the household already has a copy
 * and wants another (409 `isbn_taken`). A new ISBN whose title and first
 * author match an existing book asks first (409 `same_book`).
 */
export async function addBook(
  db: Db,
  userId: string,
  input: AddInput,
): Promise<{ bookId: string; outcome: AddOutcome; statusKept: boolean }> {
  const isbns = unique(input.isbns ?? []);
  if (input.attachTo) {
    const statusKept = addToBook(db, userId, input.attachTo, isbns, input);
    return { bookId: input.attachTo, outcome: "attached", statusKept };
  }

  const known =
    isbns.length > 0
      ? db
          .select({ bookId: bookIdentifier.bookId })
          .from(bookIdentifier)
          .where(inArray(bookIdentifier.isbn13, isbns))
          .get()?.bookId
      : undefined;
  if (known) {
    const owns = input.copy || input.borrowedFrom || input.wantToRead;
    if (!owns || (input.copy && hasCopies(db, known))) {
      throw new ApiError(
        409,
        "isbn_taken",
        "A book with this ISBN already exists",
        { bookId: known },
      );
    }
    const statusKept = addToBook(db, userId, known, isbns, input);
    return { bookId: known, outcome: "known", statusKept };
  }

  if (isbns.length > 0 && !input.keepSeparate) {
    const same = findSameBook(db, input.title, input.authors);
    if (same) {
      throw new ApiError(409, "same_book", "The same book already exists", {
        bookId: same,
      });
    }
  }

  const bookId = db.transaction(() => {
    const id = createBook(db, userId, {
      ...input,
      isbns,
      copy: undefined,
      metadataSource: input.sources?.length ? input.sources.join(",") : null,
    });
    applyOwnership(db, userId, id, input);
    return id;
  });
  if (input.coverUrl) await storeCover(db, bookId, input.coverUrl);
  return { bookId, outcome: "created", statusKept: false };
}
