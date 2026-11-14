import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/app.ts";

async function setup() {
  const app = createTestApp();
  const token = await app.setupAdmin();
  const call = async (path: string, method = "GET", body?: unknown) => {
    const res = await app.request(`/api/v1${path}`, { method, token, body });
    return {
      status: res.status,
      body: res.status === 204 ? null : await res.json(),
    };
  };
  const create = async (name: string, parentId?: string) =>
    (await call("/locations", "POST", { name, parentId })).body as {
      id: string;
    };
  return { ...app, call, create };
}

describe("locations", () => {
  it("returns the tree with book counts that include descendants", async () => {
    const { call, create } = await setup();
    const home = await create("Home");
    const living = await create("Living room", home.id);
    const shelf = await create("Shelf A", living.id);
    const study = await create("Study", home.id);
    await create("Lake house");

    const book = (title: string, locationId: string) =>
      call("/books", "POST", { title, copy: { locationId } });
    await book("Dune", shelf.id);
    await book("Momo", study.id);
    const rose = (await book("The Name of the Rose", shelf.id)).body;
    await call(`/books/${rose.id}/copies`, "POST", { locationId: living.id });

    const { body } = await call("/locations");
    expect(
      body.items.map((l: { path: string[]; bookCount: number }) => [
        l.path.join(" › "),
        l.bookCount,
      ]),
    ).toEqual([
      ["Home", 3],
      ["Home › Living room", 2],
      ["Home › Living room › Shelf A", 2],
      ["Home › Study", 1],
      ["Lake house", 0],
    ]);
  });

  it("renames and moves a location", async () => {
    const { call, create } = await setup();
    const home = await create("Home");
    const lake = await create("Lake house");
    const shelf = await create("Shelf", home.id);

    const res = await call(`/locations/${shelf.id}`, "PATCH", {
      name: "Hallway shelf",
      parentId: lake.id,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Hallway shelf",
      parentId: lake.id,
      path: ["Lake house", "Hallway shelf"],
    });

    const top = await call(`/locations/${shelf.id}`, "PATCH", {
      parentId: null,
    });
    expect(top.body).toMatchObject({ parentId: null, path: ["Hallway shelf"] });
  });

  it("rejects moving a location inside itself", async () => {
    const { call, create } = await setup();
    const home = await create("Home");
    const room = await create("Room", home.id);
    const shelf = await create("Shelf", room.id);

    for (const parentId of [home.id, shelf.id]) {
      const res = await call(`/locations/${home.id}`, "PATCH", { parentId });
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: { code: "location_cycle" } });
    }
  });

  it("deletes only empty locations", async () => {
    const { call, create } = await setup();
    const home = await create("Home");
    const shelf = await create("Shelf", home.id);
    const book = (
      await call("/books", "POST", {
        title: "Dune",
        copy: { locationId: shelf.id },
      })
    ).body;

    const withChild = await call(`/locations/${home.id}`, "DELETE");
    expect(withChild.status).toBe(409);
    expect(withChild.body).toMatchObject({
      error: { code: "location_not_empty" },
    });
    const withCopy = await call(`/locations/${shelf.id}`, "DELETE");
    expect(withCopy.status).toBe(409);
    expect(withCopy.body).toMatchObject({
      error: { code: "location_not_empty" },
    });

    await call(`/books/${book.id}/copies/${book.copies[0].id}`, "PATCH", {
      locationId: null,
    });
    expect((await call(`/locations/${shelf.id}`, "DELETE")).status).toBe(204);
    expect((await call(`/locations/${home.id}`, "DELETE")).status).toBe(204);
    expect((await call("/locations")).body.items).toEqual([]);
  });

  it("answers 404 for an unknown parent", async () => {
    const { call } = await setup();
    const res = await call("/locations", "POST", {
      name: "Shelf",
      parentId: "missing",
    });
    expect(res.status).toBe(404);
  });
});
