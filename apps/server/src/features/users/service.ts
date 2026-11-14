import { APIError } from "better-auth/api";
import { and, asc, eq, gt, or } from "drizzle-orm";
import { ApiError } from "../../api/errors.ts";
import { decodeCursor, toPage } from "../../api/pagination.ts";
import type { Auth, Role } from "../../auth.ts";
import type { Db } from "../../db/client.ts";
import { user } from "../../db/schema.ts";

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
}
