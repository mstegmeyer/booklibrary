import { asc, eq, isNotNull, isNull, max } from "drizzle-orm";
import { ApiError } from "../../api/errors.ts";
import type { Db } from "../../db/client.ts";
import { copy, location } from "../../db/schema.ts";

type LocationRow = typeof location.$inferSelect;

export type LocationNode = {
  id: string;
  parentId: string | null;
  name: string;
  /** Names from the top-level location down to this one. */
  path: string[];
  /** Distinct books with a copy here or in any location inside. */
  bookCount: number;
};

const notFound = () => new ApiError(404, "not_found", "Location not found");

async function loadLocations(db: Db) {
  return db
    .select()
    .from(location)
    .orderBy(asc(location.position), asc(location.name));
}

/** Full paths of every location, keyed by id. */
export async function locationPaths(db: Db) {
  return pathsOf(await loadLocations(db));
}

function pathsOf(rows: LocationRow[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const paths = new Map<string, string[]>();
  const pathOf = (row: LocationRow): string[] => {
    const known = paths.get(row.id);
    if (known) return known;
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    const path = [...(parent ? pathOf(parent) : []), row.name];
    paths.set(row.id, path);
    return path;
  };
  for (const row of rows) pathOf(row);
  return paths;
}

/** The location and every location inside it, at any depth. */
export async function locationWithDescendants(db: Db, id: string) {
  const rows = await loadLocations(db);
  const ids = [id];
  for (let i = 0; i < ids.length; i++) {
    for (const row of rows) if (row.parentId === ids[i]) ids.push(row.id);
  }
  return ids;
}

/** Every location in depth-first order, parents before their children. */
export async function listLocations(db: Db): Promise<LocationNode[]> {
  const rows = await loadLocations(db);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const paths = pathsOf(rows);

  const books = new Map<string, Set<string>>();
  const placed = await db
    .selectDistinct({ locationId: copy.locationId, bookId: copy.bookId })
    .from(copy)
    .where(isNotNull(copy.locationId));
  for (const { locationId, bookId } of placed) {
    for (
      let row = locationId ? byId.get(locationId) : undefined;
      row;
      row = row.parentId ? byId.get(row.parentId) : undefined
    ) {
      const set = books.get(row.id) ?? new Set();
      set.add(bookId);
      books.set(row.id, set);
    }
  }

  const nodes: LocationNode[] = [];
  const visit = (parentId: string | null) => {
    for (const row of rows) {
      if (row.parentId !== parentId) continue;
      nodes.push({
        id: row.id,
        parentId: row.parentId,
        name: row.name,
        path: paths.get(row.id) ?? [row.name],
        bookCount: books.get(row.id)?.size ?? 0,
      });
      visit(row.id);
    }
  };
  visit(null);
  return nodes;
}

async function getNode(db: Db, id: string) {
  const node = (await listLocations(db)).find((n) => n.id === id);
  if (!node) throw notFound();
  return node;
}

const childrenOf = (parentId: string | null) =>
  parentId ? eq(location.parentId, parentId) : isNull(location.parentId);

async function nextPosition(db: Db, parentId: string | null) {
  const [row] = await db
    .select({ last: max(location.position) })
    .from(location)
    .where(childrenOf(parentId));
  return (row?.last ?? -1) + 1;
}

async function assertExists(db: Db, id: string) {
  const [row] = await db
    .select({ id: location.id })
    .from(location)
    .where(eq(location.id, id));
  if (!row) throw notFound();
}

export async function createLocation(
  db: Db,
  input: { name: string; parentId?: string | null },
) {
  const parentId = input.parentId ?? null;
  if (parentId) await assertExists(db, parentId);
  const [row] = await db
    .insert(location)
    .values({
      name: input.name,
      parentId,
      position: await nextPosition(db, parentId),
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  return getNode(db, row.id);
}

export async function updateLocation(
  db: Db,
  id: string,
  input: { name?: string; parentId?: string | null },
) {
  const [current] = await db.select().from(location).where(eq(location.id, id));
  if (!current) throw notFound();

  const changes: Partial<LocationRow> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.parentId !== undefined && input.parentId !== current.parentId) {
    if (input.parentId) {
      await assertExists(db, input.parentId);
      if ((await locationWithDescendants(db, id)).includes(input.parentId)) {
        throw new ApiError(
          409,
          "location_cycle",
          "A location cannot be moved inside itself",
        );
      }
    }
    changes.parentId = input.parentId;
    changes.position = await nextPosition(db, input.parentId);
  }
  if (Object.keys(changes).length > 0) {
    await db.update(location).set(changes).where(eq(location.id, id));
  }
  return getNode(db, id);
}

export async function deleteLocation(db: Db, id: string) {
  await assertExists(db, id);
  const notEmpty = (message: string) =>
    new ApiError(409, "location_not_empty", message);
  if (await db.$count(location, childrenOf(id))) {
    throw notEmpty("The location still contains other locations");
  }
  if (await db.$count(copy, eq(copy.locationId, id))) {
    throw notEmpty("The location still holds copies");
  }
  await db.delete(location).where(eq(location.id, id));
}

/** Number of top-level locations, the places of the household. */
export async function countPlaces(db: Db) {
  return db.$count(location, childrenOf(null));
}
