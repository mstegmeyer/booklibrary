import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { ApiError } from "../../api/errors.ts";
import { decodeCursor, toPage } from "../../api/pagination.ts";
import type { Db } from "../../db/client.ts";
import { book, contact, copy, loan } from "../../db/schema.ts";
import { coverUrls } from "../books/covers.ts";
import { deleteBookIfUnreferenced } from "../books/service.ts";
import { assertContact, type ContactInput } from "../contacts/service.ts";
import { locationPaths } from "../locations/service.ts";

export type LoanList = "lent" | "borrowed" | "returned";

export type LoanInput = {
  contact: ContactInput;
  startedOn: string;
  note?: string | null;
};

export type LoanChanges = {
  contact?: ContactInput;
  startedOn?: string;
  endedOn?: string;
  note?: string | null;
};

const notFound = () => new ApiError(404, "not_found", "Loan not found");

const lists: Record<
  LoanList,
  { where: SQL | undefined; date: typeof loan.startedOn | typeof loan.endedOn }
> = {
  lent: {
    where: and(eq(loan.direction, "lent"), isNull(loan.endedOn)),
    date: loan.startedOn,
  },
  borrowed: {
    where: and(eq(loan.direction, "borrowed"), isNull(loan.endedOn)),
    date: loan.startedOn,
  },
  returned: { where: isNotNull(loan.endedOn), date: loan.endedOn },
};

const selectLoans = (db: Db) =>
  db
    .select({
      id: loan.id,
      direction: loan.direction,
      startedOn: loan.startedOn,
      endedOn: loan.endedOn,
      note: loan.note,
      bookId: book.id,
      title: book.title,
      authors: book.authors,
      coverPath: book.coverPath,
      copyId: copy.id,
      format: copy.format,
      locationId: copy.locationId,
      contactId: contact.id,
      contactName: contact.name,
    })
    .from(loan)
    .innerJoin(book, eq(book.id, loan.bookId))
    .innerJoin(contact, eq(contact.id, loan.contactId))
    .leftJoin(copy, eq(copy.id, loan.copyId));

type LoanRow = Awaited<
  ReturnType<ReturnType<typeof selectLoans>["all"]>
>[number];

async function toLoans(db: Db, rows: LoanRow[]) {
  const paths = await locationPaths(db);
  return rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    startedOn: row.startedOn,
    endedOn: row.endedOn,
    note: row.note,
    book: {
      id: row.bookId,
      title: row.title,
      authors: row.authors,
      ...coverUrls(row.bookId, row.coverPath),
    },
    copy: row.copyId
      ? {
          id: row.copyId,
          format: row.format,
          locationPath: row.locationId ? (paths.get(row.locationId) ?? []) : [],
        }
      : null,
    contact: { id: row.contactId, name: row.contactName },
  }));
}

/**
 * Active lent or borrowed loans, newest first, or finished loans of both
 * directions, most recently returned first. `total` counts the whole list.
 */
export async function listLoans(
  db: Db,
  list: LoanList,
  query: { copyId?: string; cursor?: string; limit: number },
) {
  const { where, date } = lists[list];
  const conditions = [
    where,
    query.copyId ? eq(loan.copyId, query.copyId) : undefined,
  ];
  const total = await db.$count(loan, and(...conditions));
  if (query.cursor) {
    const [day, id] = decodeCursor(query.cursor);
    conditions.push(
      or(
        lt(date, String(day)),
        and(eq(date, String(day)), lt(loan.id, String(id))),
      ),
    );
  }
  const rows = await selectLoans(db)
    .where(and(...conditions))
    .orderBy(desc(date), desc(loan.id))
    .limit(query.limit + 1);
  const page = toPage(rows, query.limit, (row) => [
    (list === "returned" ? row.endedOn : row.startedOn) ?? "",
    row.id,
  ]);
  return {
    items: await toLoans(db, page.items),
    nextCursor: page.nextCursor,
    total,
  };
}

export async function getLoan(db: Db, id: string) {
  const [row] = await selectLoans(db).where(eq(loan.id, id));
  if (!row) throw notFound();
  const [found] = await toLoans(db, [row]);
  return found as NonNullable<typeof found>;
}

function assertOrder(startedOn: string, endedOn: string | null) {
  if (endedOn !== null && endedOn < startedOn) {
    throw new ApiError(
      400,
      "bad_request",
      "A loan cannot end before it starts",
    );
  }
}

/**
 * The person's id. A name that someone already has means that person, so
 * typing a known name while lending does not create a double.
 */
function contactIdOf(tx: Pick<Db, "insert" | "select">, input: ContactInput) {
  if ("id" in input) return input.id;
  const known = tx
    .select({ id: contact.id })
    .from(contact)
    .where(sql`${contact.name} = ${input.name} collate nocase`)
    .get();
  if (known) return known.id;
  return tx.insert(contact).values({ name: input.name }).returning().get().id;
}

/** Lends one of our copies. A copy can only be lent to one person at a time. */
export function lendCopy(db: Db, copyId: string, input: LoanInput) {
  const found = db
    .select({ bookId: copy.bookId })
    .from(copy)
    .where(eq(copy.id, copyId))
    .get();
  if (!found) throw new ApiError(404, "not_found", "Copy not found");
  const active = db
    .select({ id: loan.id })
    .from(loan)
    .where(and(eq(loan.copyId, copyId), isNull(loan.endedOn)))
    .get();
  if (active) {
    throw new ApiError(409, "copy_lent", "The copy is lent out");
  }
  assertContact(db, input.contact);
  return db.transaction(
    (tx) =>
      tx
        .insert(loan)
        .values({
          direction: "lent",
          bookId: found.bookId,
          copyId,
          contactId: contactIdOf(tx, input.contact),
          startedOn: input.startedOn,
          note: input.note,
        })
        .returning({ id: loan.id })
        .get().id,
  );
}

/** Records a book someone lent us. It has no copy: it is not ours. */
export function borrowBook(db: Db, bookId: string, input: LoanInput) {
  const found = db
    .select({ id: book.id })
    .from(book)
    .where(eq(book.id, bookId))
    .get();
  if (!found) throw new ApiError(404, "not_found", "Book not found");
  assertContact(db, input.contact);
  return db.transaction(
    (tx) =>
      tx
        .insert(loan)
        .values({
          direction: "borrowed",
          bookId,
          contactId: contactIdOf(tx, input.contact),
          startedOn: input.startedOn,
          note: input.note,
        })
        .returning({ id: loan.id })
        .get().id,
  );
}

function findLoan(db: Db, id: string) {
  const found = db.select().from(loan).where(eq(loan.id, id)).get();
  if (!found) throw notFound();
  return found;
}

export function returnLoan(db: Db, id: string, endedOn: string) {
  const found = findLoan(db, id);
  if (found.endedOn !== null) {
    throw new ApiError(409, "conflict", "The loan has already been returned");
  }
  assertOrder(found.startedOn, endedOn);
  db.update(loan).set({ endedOn }).where(eq(loan.id, id)).run();
}

/** Corrects the person, dates or note of a loan, active or finished. */
export function updateLoan(db: Db, id: string, changes: LoanChanges) {
  const found = findLoan(db, id);
  assertOrder(
    changes.startedOn ?? found.startedOn,
    changes.endedOn ?? found.endedOn,
  );
  if (changes.contact) assertContact(db, changes.contact);
  db.transaction((tx) => {
    const { contact: person, ...fields } = changes;
    const set = { ...fields, contactId: person && contactIdOf(tx, person) };
    if (Object.values(set).some((value) => value !== undefined)) {
      tx.update(loan).set(set).where(eq(loan.id, id)).run();
    }
  });
}

/** Deletes a loan record; a book that nothing refers to any more goes too. */
export async function deleteLoan(db: Db, id: string) {
  const found = findLoan(db, id);
  await db.delete(loan).where(eq(loan.id, id));
  await deleteBookIfUnreferenced(db, found.bookId);
}
