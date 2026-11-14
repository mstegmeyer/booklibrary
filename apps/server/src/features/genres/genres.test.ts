import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/app.ts";

type Genre = {
  id: string;
  key: string | null;
  name: string | null;
  bookCount: number;
};

async function setup() {
  const app = createTestApp();
  const adminToken = await app.setupAdmin();
  await app.request("/api/v1/users", {
    method: "POST",
    token: adminToken,
    body: { name: "Ben", email: "ben@example.com", password: "password123" },
  });
  // Members manage genres just like the admin.
  const token =
    (await app.signIn("ben@example.com", "password123")).token ?? "";
  const call = async (path: string, method = "GET", body?: unknown) => {
    const res = await app.request(`/api/v1${path}`, { method, token, body });
    return {
      status: res.status,
      body: res.status === 204 ? null : await res.json(),
    };
  };
  const genres = async () => (await call("/genres")).body.items as Genre[];
  const builtIn = async (key: string) => {
    const found = (await genres()).find((g) => g.key === key);
    if (!found) throw new Error(`no genre ${key}`);
    return found;
  };
  return { ...app, call, genres, builtIn };
}

describe("genres", () => {
  it("starts with the built-in genres, keyed and without names", async () => {
    const { genres } = await setup();
    const items = await genres();
    expect(items).toHaveLength(24);
    expect(items.map((g) => g.key)).toEqual(
      expect.arrayContaining(["novel", "crime", "travel-guide", "reference"]),
    );
    expect(items.every((g) => g.name === null && g.bookCount === 0)).toBe(true);
  });

  it("counts the books of each genre", async () => {
    const { call, builtIn, genres } = await setup();
    const crime = await builtIn("crime");
    await call("/books", "POST", { title: "A", genreId: crime.id, copy: {} });
    await call("/books", "POST", {
      title: "B",
      genreId: crime.id,
      wantToRead: true,
    });
    await call("/books", "POST", { title: "C", copy: {} });
    const counts = (await genres()).filter((g) => g.bookCount > 0);
    expect(counts).toEqual([{ ...crime, bookCount: 2 }]);
  });

  it("adds and renames genres with names unique ignoring case", async () => {
    const { call, builtIn } = await setup();
    const added = await call("/genres", "POST", { name: "  Cozy mystery " });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      key: null,
      name: "Cozy mystery",
      bookCount: 0,
    });

    const twice = await call("/genres", "POST", { name: "cozy MYSTERY" });
    expect(twice.status).toBe(409);
    expect(twice.body).toMatchObject({ error: { code: "genre_exists" } });

    // Only custom names count: a built-in shown as "Thriller" does not.
    expect((await call("/genres", "POST", { name: "Thriller" })).status).toBe(
      201,
    );

    const thriller = await builtIn("thriller");
    const taken = await call(`/genres/${thriller.id}`, "PATCH", {
      name: "Cozy Mystery",
    });
    expect(taken.status).toBe(409);
    const renamed = await call(`/genres/${thriller.id}`, "PATCH", {
      name: "Spannung",
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ key: "thriller", name: "Spannung" });

    // Renaming to its own name in another case is fine.
    const recased = await call(`/genres/${added.body.id}`, "PATCH", {
      name: "Cozy Mystery",
    });
    expect(recased.body).toMatchObject({ name: "Cozy Mystery" });
  });

  it("rejects empty names and unknown genres", async () => {
    const { call } = await setup();
    expect((await call("/genres", "POST", { name: " " })).status).toBe(400);
    expect(
      (await call("/genres/nope", "PATCH", { name: "Krimi" })).status,
    ).toBe(404);
    expect((await call("/genres/nope", "DELETE")).status).toBe(404);
  });

  it("deletes a genre and leaves its books without one", async () => {
    const { call, builtIn, genres } = await setup();
    const cookbook = await builtIn("cookbook");
    const book = (
      await call("/books", "POST", {
        title: "Jerusalem",
        genreId: cookbook.id,
        copy: {},
      })
    ).body;

    expect((await call(`/genres/${cookbook.id}`, "DELETE")).status).toBe(204);
    expect((await genres()).some((g) => g.key === "cookbook")).toBe(false);
    expect((await call(`/books/${book.id}`)).body.genre).toBeNull();
  });
});

describe("a book's genre", () => {
  it("is set when adding, changed when editing and cleared with null", async () => {
    const { call, builtIn } = await setup();
    const crime = await builtIn("crime");
    const thriller = await builtIn("thriller");
    const created = await call("/books", "POST", {
      title: "Verblendung",
      genreId: crime.id,
      copy: {},
    });
    expect(created.body.genre).toEqual({
      id: crime.id,
      key: "crime",
      name: null,
    });

    const edited = await call(`/books/${created.body.id}`, "PATCH", {
      genreId: thriller.id,
    });
    expect(edited.body.genre).toMatchObject({ key: "thriller" });
    const untouched = await call(`/books/${created.body.id}`, "PATCH", {
      title: "Verblendung (Millennium 1)",
    });
    expect(untouched.body.genre).toMatchObject({ key: "thriller" });
    const cleared = await call(`/books/${created.body.id}`, "PATCH", {
      genreId: null,
    });
    expect(cleared.body.genre).toBeNull();
  });

  it("must be a genre that exists", async () => {
    const { call } = await setup();
    const res = await call("/books", "POST", { title: "X", genreId: "nope" });
    expect(res.status).toBe(400);
  });

  it("is left alone when a scan adds to a book the library has", async () => {
    const { call, builtIn } = await setup();
    const crime = await builtIn("crime");
    const thriller = await builtIn("thriller");
    const isbns = ["9783453432413"];
    const first = await call("/books", "POST", {
      title: "Book",
      isbns,
      genreId: crime.id,
      wantToRead: true,
    });
    const known = await call("/books", "POST", {
      title: "Book",
      isbns,
      genreId: thriller.id,
      copy: {},
    });
    expect(known.body).toMatchObject({ outcome: "known" });
    expect(known.body.genre).toMatchObject({ key: "crime" });

    const attached = await call("/books", "POST", {
      title: "Book",
      isbns: ["9783442492114"],
      genreId: thriller.id,
      attachTo: first.body.id,
      copy: {},
    });
    expect(attached.body).toMatchObject({ outcome: "attached" });
    expect(attached.body.genre).toMatchObject({ key: "crime" });
  });

  it("filters the library by genre and by no genre", async () => {
    const { call, builtIn } = await setup();
    const crime = await builtIn("crime");
    await call("/books", "POST", { title: "A", genreId: crime.id, copy: {} });
    await call("/books", "POST", { title: "B", copy: {} });
    await call("/books", "POST", { title: "C", genreId: crime.id, copy: {} });

    const titles = async (genre: string) => {
      const { body } = await call(`/books?sort=title&genre=${genre}`);
      return {
        titles: body.items.map((b: { title: string }) => b.title),
        total: body.total,
      };
    };
    expect(await titles(crime.id)).toEqual({ titles: ["A", "C"], total: 2 });
    expect(await titles("none")).toEqual({ titles: ["B"], total: 1 });
    const list = await call("/books?sort=title");
    expect(list.body.items[0].genre).toMatchObject({ key: "crime" });
  });
});
