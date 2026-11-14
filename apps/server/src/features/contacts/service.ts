import { asc, eq, sql } from "drizzle-orm";
import { ApiError } from "../../api/errors.ts";
import type { Db } from "../../db/client.ts";
import { contact, loan, type loanDirections } from "../../db/schema.ts";

/** An existing person by id, or a new one by name. */
export type ContactInput = { id: string } | { name: string };

const notFound = () => new ApiError(404, "not_found", "Person not found");

const activeLoans = (direction: (typeof loanDirections)[number]) =>
  sql<number>`count(case when ${loan.direction} = ${direction} and ${loan.endedOn} is null then 1 end)`.mapWith(
    Number,
  );

/** Everyone, by name, with how many active loans they have in each direction. */
export async function listContacts(db: Db) {
  return db
    .select({
      id: contact.id,
      name: contact.name,
      lent: activeLoans("lent"),
      borrowed: activeLoans("borrowed"),
    })
    .from(contact)
    .leftJoin(loan, eq(loan.contactId, contact.id))
    .groupBy(contact.id)
    .orderBy(asc(sql`${contact.name} collate nocase`), asc(contact.id));
}

async function getContact(db: Db, id: string) {
  const found = (await listContacts(db)).find((c) => c.id === id);
  if (!found) throw notFound();
  return found;
}

export async function createContact(db: Db, name: string) {
  const created = db.insert(contact).values({ name }).returning().get();
  return getContact(db, created.id);
}

export async function renameContact(db: Db, id: string, name: string) {
  const [renamed] = await db
    .update(contact)
    .set({ name })
    .where(eq(contact.id, id))
    .returning();
  if (!renamed) throw notFound();
  return getContact(db, id);
}

/** Deletes a person unless a loan, active or finished, refers to them. */
export async function deleteContact(db: Db, id: string) {
  await getContact(db, id);
  if (await db.$count(loan, eq(loan.contactId, id))) {
    throw new ApiError(
      409,
      "conflict",
      "The person still has loans and cannot be deleted",
    );
  }
  await db.delete(contact).where(eq(contact.id, id));
}

/** Throws unless the referenced person exists; a new name is always valid. */
export function assertContact(db: Db, input: ContactInput) {
  if ("name" in input) return;
  const found = db
    .select({ id: contact.id })
    .from(contact)
    .where(eq(contact.id, input.id))
    .get();
  if (!found) throw new ApiError(400, "bad_request", "Unknown person");
}
