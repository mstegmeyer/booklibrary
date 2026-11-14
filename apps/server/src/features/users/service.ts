import { APIError } from "better-auth/api";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { ApiError } from "../../api/errors.ts";
import { decodeCursor, toPage } from "../../api/pagination.ts";
import type { Auth, Role } from "../../auth.ts";
import type { Db } from "../../db/client.ts";
import { reading, user } from "../../db/schema.ts";
import { deleteBookIfUnreferenced } from "../books/service.ts";

export type NewUser = { name: string; email: string; password: string };

type UserRow = {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  createdAt: Date;
};

const toDto = (row: UserRow) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: (row.role ?? "member") as Role,
  createdAt: row.createdAt.getTime(),
});

function after(cursor: string) {
  const [createdAt, id] = decodeCursor(cursor);
  const at = new Date(Number(createdAt));
  return or(
    gt(user.createdAt, at),
    and(eq(user.createdAt, at), gt(user.id, String(id))),
  );
}

export async function listUsers(
  db: Db,
  { cursor, limit }: { cursor?: string; limit: number },
) {
  const rows = await db
    .select()
    .from(user)
    .where(cursor ? after(cursor) : undefined)
    .orderBy(asc(user.createdAt), asc(user.id))
    .limit(limit + 1);
  return toPage(rows.map(toDto), limit, (u) => [u.createdAt, u.id]);
}

export async function countUsers(db: Db) {
  return db.$count(user);
}

/** Without `headers` Better Auth trusts the call; first-run setup relies on that. */
export async function createUser(
  auth: Auth,
  input: NewUser & { role: Role },
  headers?: Headers,
) {
  try {
    const { user: created } = await auth.api.createUser({
      body: { ...input, email: input.email.toLowerCase() },
      headers,
    });
    return toDto(created);
  } catch (err) {
    if (
      err instanceof APIError &&
      err.body?.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
    ) {
      throw new ApiError(
        409,
        "conflict",
        "A user with this email already exists",
      );
    }
    throw err;
  }
}

export async function setPassword(
  auth: Auth,
  headers: Headers,
  userId: string,
  password: string,
) {
  await auth.api.setUserPassword({
    body: { userId, newPassword: password },
    headers,
  });
  await auth.api.revokeUserSessions({ body: { userId }, headers });
}

async function findUser(db: Db, userId: string) {
  const [row] = await db.select().from(user).where(eq(user.id, userId));
  if (!row) throw new ApiError(404, "not_found", "User not found");
  return row;
}

async function assertNotLastAdmin(db: Db, target: { role: string | null }) {
  if (
    target.role === "admin" &&
    (await db.$count(user, eq(user.role, "admin"))) <= 1
  ) {
    throw new ApiError(409, "conflict", "The last admin must stay an admin");
  }
}

export async function setRole(db: Db, userId: string, role: Role) {
  const target = await findUser(db, userId);
  if (role === "member") await assertNotLastAdmin(db, target);
  const [updated] = await db
    .update(user)
    .set({ role, updatedAt: new Date() })
    .where(eq(user.id, userId))
    .returning();
  return toDto(updated ?? target);
}

/**
 * Removes a user with their reading history and sessions. Books and copies
 * they added stay; a book that only their reading history kept is deleted.
 */
export async function removeUser(db: Db, actorId: string, userId: string) {
  if (userId === actorId) {
    throw new ApiError(409, "conflict", "You cannot remove your own account");
  }
  await assertNotLastAdmin(db, await findUser(db, userId));
  const readings = await db
    .delete(reading)
    .where(eq(reading.userId, userId))
    .returning({ bookId: reading.bookId });
  for (const bookId of new Set(readings.map((r) => r.bookId))) {
    await deleteBookIfUnreferenced(db, bookId);
  }
  await db.delete(user).where(eq(user.id, userId));
}
