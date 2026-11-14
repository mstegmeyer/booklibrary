import { describe, expect, it } from "vitest";
import { bookFile, reading, readingProgress, user } from "../../db/schema.ts";
import { createTestApp } from "../../test/app.ts";

async function setup() {
  const app = createTestApp();
  const token = await app.setupAdmin();
  const call = async (path: string, method = "GET", body?: unknown) => {
    const res = await app.request(`/api/v1${path}`, { method, token, body });
    return { status: res.status, body: await res.json() };
  };
  await call("/users", "POST", {
    name: "Ben",
    email: "ben@example.com",
    password: "password123",
  });
  const ids = Object.fromEntries(
    app.db
      .select({ id: user.id, name: user.name })
      .from(user)
      .all()
      .map((u) => [u.name, u.id]),
  );
  const mara = ids.Admin ?? "";
  const ben = ids.Ben ?? "";
  const addBook = async (pageCount: number | null, owned = true) => {
    const res = await call("/books", "POST", {
      title: "Book",
      pageCount,
      ...(owned ? { copy: {} } : {}),
    });
    return res.body.id as string;
  };
  /** A read-through with its progress entries as [date, page] pairs. */
  const readThrough = (
    userId: string,
    bookId: string,
    status: "reading" | "read" | "abandoned",
    endedOn: string | null,
    entries: [string, number][] = [],
  ) => {
    const row = app.db
      .insert(reading)
      .values({ userId, bookId, status, endedOn })
      .returning()
      .get();
    for (const [date, page] of entries) {
      app.db
        .insert(readingProgress)
        .values({ readingId: row.id, date, page })
        .run();
    }
  };
  const stats = async (year: number, userId?: string) =>
    (await call(`/statistics?year=${year}${userId ? `&userId=${userId}` : ""}`))
      .body;
  return { app, call, mara, ben, addBook, readThrough, stats };
}

describe("pages read", () => {
  it("counts the increase of each progress entry in its month", async () => {
    const { mara, addBook, readThrough, stats } = await setup();
    const dune = await addBook(600);
    readThrough(mara, dune, "read", "2025-03-02", [
      ["2025-01-30", 100],
      ["2025-02-10", 250],
      ["2025-02-10", 220],
      ["2025-03-02", 600],
    ]);
    // A second read-through starts again from page 0.
    readThrough(mara, dune, "reading", null, [["2025-03-20", 40]]);

    const result = await stats(2025, mara);
    expect(result.pagesPerMonth.slice(0, 4)).toEqual([100, 150, 390, 0]);
    expect(result.pagesRead).toBe(640);
    expect(result.pagesPerDay).toBe(Math.round(640 / 365));
    expect(result.booksPerMonth.slice(0, 4)).toEqual([0, 0, 1, 0]);
  });

  it("counts a dated read without entries on its finish date", async () => {
    const { mara, addBook, readThrough, stats } = await setup();
    readThrough(mara, await addBook(300), "read", "2024-06-15");
    readThrough(mara, await addBook(null), "read", "2024-07-01");
    readThrough(mara, await addBook(200), "read", null);
    readThrough(mara, await addBook(150), "abandoned", "2024-08-01", [
      ["2024-07-20", 50],
    ]);

    const result = await stats(2024, mara);
    expect(result.pagesPerMonth[5]).toBe(300);
    expect(result.pagesPerMonth[6]).toBe(50);
    expect(result.pagesRead).toBe(350);
    expect(result.booksFinished).toBe(2);
    expect(result.pagesPerDay).toBe(1);
  });
});

describe("statistics", () => {
  it("separates undated reads and sums the years", async () => {
    const { mara, addBook, readThrough, stats } = await setup();
    const book = await addBook(100);
    readThrough(mara, book, "read", "2023-05-01");
    readThrough(mara, book, "read", "2025-05-01");
    readThrough(mara, await addBook(100), "read", "2025-09-09");
    readThrough(mara, await addBook(100), "read", null);

    const result = await stats(2025, mara);
    expect(result).toMatchObject({
      year: 2025,
      booksFinished: 2,
      booksPerYear: [
        { year: 2023, books: 1 },
        { year: 2025, books: 2 },
      ],
      undated: 1,
      allTime: 4,
      years: [2023, 2025],
    });
  });

  it("counts a book twice for the household when two people read it", async () => {
    const { mara, ben, addBook, readThrough, stats } = await setup();
    const owned = await addBook(200);
    const outside = await addBook(100, false);
    readThrough(mara, owned, "read", "2025-02-01");
    readThrough(ben, owned, "read", "2025-04-01");
    readThrough(ben, outside, "read", "2025-04-20");

    expect(await stats(2025, mara)).toMatchObject({
      booksFinished: 1,
      pagesRead: 200,
      notInLibrary: 0,
    });
    expect(await stats(2025, ben)).toMatchObject({
      booksFinished: 2,
      pagesRead: 300,
      notInLibrary: 1,
    });
    const household = await stats(2025);
    expect(household).toMatchObject({
      booksFinished: 3,
      pagesRead: 500,
      notInLibrary: 1,
      allTime: 3,
    });
    expect(household.booksPerMonth.slice(0, 4)).toEqual([0, 1, 0, 2]);
  });

  it("counts a book owned as an e-book file as in the library", async () => {
    const { app, mara, addBook, readThrough, stats } = await setup();
    const ebook = await addBook(100, false);
    app.db
      .insert(bookFile)
      .values({
        bookId: ebook,
        format: "epub",
        path: "Book.epub",
        size: 1,
        sha256: "a",
        uploadSha256: "a",
      })
      .run();
    readThrough(mara, ebook, "read", "2025-03-01");

    expect(await stats(2025, mara)).toMatchObject({
      booksFinished: 1,
      notInLibrary: 0,
    });
  });

  it("lists the members and rejects an unknown user", async () => {
    const { call } = await setup();
    expect((await call("/statistics/members")).body).toMatchObject([
      { name: "Admin" },
      { name: "Ben" },
    ]);
    expect((await call("/statistics?year=2025&userId=nobody")).status).toBe(
      404,
    );
  });
});
