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
  assertFormatFree,
  attachFile,
  discardUpload,
  readUpload,
} from "./files.ts";
import {
  assertIsbnsFree,
  assertLocationExists,
  type BookInput,
  type CopyInput,
  createBook,
  deleteBookIfUnreferenced,
  unique,
} from "./service.ts";

/** What the household has of the book: at most one of these is set. */
type Ownership = {
  copy?: CopyInput;
  borrowedFrom?: ContactInput;
  /** The day the borrowed loan starts; the server's today otherwise. */
  borrowedOn?: string;
  wantToRead?: boolean;
  /** An uploaded e-book file, by the id its upload returned. */
  upload?: string;
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
    /** The answer to `format_exists`: replace the book's file. */
    replace?: boolean;
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
    borrowBook(db, bookId, {
      contact: input.borrowedFrom,
      startedOn: input.borrowedOn ?? today(),
    });
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
  const current = db
    .select({ coverPath: book.coverPath })
    .from(book)
    .where(eq(book.id, bookId))
    .get();
  if (current?.coverPath) return;
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
 * author match an existing book asks first (409 `same_book`). An uploaded
 * file of a format the book already has asks too (409 `format_exists`).
 * A book without a cover takes the one the lookup found.
 */
export async function addBook(
  db: Db,
  libraryDir: string,
  userId: string,
  input: AddInput,
): Promise<{ bookId: string; outcome: AddOutcome; statusKept: boolean }> {
  const isbns = unique(input.isbns ?? []);
  const upload = input.upload ? await readUpload(db, input.upload) : undefined;
  const complete = async (bookId: string, outcome: AddOutcome) => {
    if (input.coverUrl) await storeCover(db, bookId, input.coverUrl);
    if (!upload || !input.upload) return;
    try {
      await attachFile(db, libraryDir, userId, bookId, upload, input.replace);
    } catch (error) {
      // A book created only to hold the file must not stay behind without it.
      if (outcome === "created") await deleteBookIfUnreferenced(db, bookId);
      throw error;
    }
    await discardUpload(db, input.upload);
  };

  if (input.attachTo) {
    if (upload) {
      assertFormatFree(db, input.attachTo, upload.format, input.replace);
    }
    const statusKept = addToBook(db, userId, input.attachTo, isbns, input);
    await complete(input.attachTo, "attached");
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
    const owns =
      input.copy || input.borrowedFrom || input.wantToRead || input.upload;
    if (!owns || (input.copy && hasCopies(db, known))) {
      throw new ApiError(
        409,
        "isbn_taken",
        "A book with this ISBN already exists",
        { bookId: known },
      );
    }
    if (upload) assertFormatFree(db, known, upload.format, input.replace);
    const statusKept = addToBook(db, userId, known, isbns, input);
    await complete(known, "known");
    return { bookId: known, outcome: "known", statusKept };
  }

  // E-book files often carry no ISBN, so for them title and author decide.
  if ((isbns.length > 0 || upload) && !input.keepSeparate) {
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
  await complete(bookId, "created");
  return { bookId, outcome: "created", statusKept: false };
}
