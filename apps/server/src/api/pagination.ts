import { z } from "@hono/zod-openapi";
import { ApiError } from "./errors.ts";

export const PaginationQuery = z.object({
  cursor: z.string().optional().openapi({
    description: "Opaque cursor from the previous page's `nextCursor`.",
  }),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

type CursorKey = (string | number)[];

export function decodeCursor(cursor: string): CursorKey {
  try {
    const key: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString(),
    );
    if (Array.isArray(key)) return key;
  } catch {}
  throw new ApiError(400, "bad_request", "Invalid cursor");
}

/**
 * Turns rows fetched with `limit + 1` into a page. `keyOf` returns the sort
 * key of a row, which becomes the cursor for the next page.
 */
export function toPage<T>(
  rows: T[],
  limit: number,
  keyOf: (row: T) => CursorKey,
) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor =
    rows.length > limit && last
      ? Buffer.from(JSON.stringify(keyOf(last))).toString("base64url")
      : null;
  return { items, nextCursor };
}
