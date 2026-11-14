import { describe, expect, it } from "vitest";
import { contact, loan } from "../../db/schema.ts";
import { createTestApp } from "../../test/app.ts";
import { today } from "./service.ts";

type State = {
  current: {
    status: string;
    startedOn: string | null;
    endedOn: string | null;
    page: number | null;
  } | null;
  earlier: { status: string; endedOn: string | null }[];
};

async function setup() {
  const app = createTestApp();
  const adminToken = await app.setupAdmin();
  const as = (token: string) => {
    const call = async (path: string, method = "GET", body?: unknown) => {
      const res = await app.request(`/api/v1${path}`, { method, token, body });
      return { status: res.status, body: await res.json() };
    };
    const state = async (bookId: string) =>
      (await call(`/reading/books/${bookId}`)).body as State;
    return {
      call,
      state,
      setStatus: (bookId: string, status: string) =>
        call(`/reading/books/${bookId}`, "PUT", { status }),
      finish: (bookId: string, date: string | null, pageCount?: number) =>
        call(`/reading/books/${bookId}/finish`, "POST", { date, pageCount }),
      progress: (bookId: string, date: string, page: number) =>
        call(`/reading/books/${bookId}/progress`, "POST", { date, page }),
      clear: (bookId: string) => call(`/reading/books/${bookId}`, "DELETE"),
    };
  };
  const admin = as(adminToken);
  const addBook = async (input: Record<string, unknown>) => {
    const res = await admin.call("/books", "POST", input);
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    return res.body.id as string;
  };
  const addMember = async (name: string, email: string) => {
    await admin.call("/users", "POST", {
      name,
      email,
      password: "password123",
    });
    const { token } = await app.signIn(email, "password123");
    return as(token ?? "");
  };
  const borrow = (bookId: string, endedOn?: string) => {
    const lender = app.db
      .insert(contact)
      .values({ name: "Lena" })
      .returning()
      .get();
    app.db
      .insert(loan)
      .values({
        direction: "borrowed",
        bookId,
        contactId: lender.id,
        startedOn: "2026-10-01",
        endedOn,
      })
      .run();
  };
  return { ...app, ...admin, addBook, addMember, borrow };
}

describe("reading status", () => {
  it("creates a row for any status chosen from no status", async () => {
    const { addBook, setStatus, finish, state } = await setup();
    const [want, reading, abandoned, read] = await Promise.all(
      ["Want", "Reading", "Abandoned", "Read"].map((title) =>
        addBook({ title, copy: {} }),
      ),
    );

    expect(await state(want as string)).toEqual({
      current: null,
      earlier: [],
    });
    await setStatus(want as string, "want");
    await setStatus(reading as string, "reading");
    await setStatus(abandoned as string, "abandoned");
    await finish(read as string, "2026-03-04");

    expect((await state(want as string)).current).toMatchObject({
      status: "want",
      startedOn: null,
      endedOn: null,
    });
    expect((await state(reading as string)).current).toMatchObject({
      status: "reading",
      startedOn: today(),
    });
    expect((await state(abandoned as string)).current).toMatchObject({
      status: "abandoned",
      endedOn: today(),
    });
    expect((await state(read as string)).current).toMatchObject({
      status: "read",
      startedOn: null,
      endedOn: "2026-03-04",
    });
  });

  it("switches between want, reading and abandoned on the same row", async () => {
    const { addBook, setStatus, progress, state } = await setup();
    const book = await addBook({ title: "Dune", pageCount: 600, copy: {} });

    await setStatus(book, "want");
    await setStatus(book, "reading");
    await progress(book, "2026-11-01", 120);
    await setStatus(book, "abandoned");
    let result = await state(book);
    expect(result.earlier).toEqual([]);
    expect(result.current).toMatchObject({
      status: "abandoned",
      startedOn: today(),
      endedOn: today(),
      page: 120,
    });

    await setStatus(book, "reading");
    result = await state(book);
    expect(result.earlier).toEqual([]);
    expect(result.current).toMatchObject({
      status: "reading",
      startedOn: today(),
      endedOn: null,
      page: 120,
    });
  });

  it("starts a re-read after a finished read and keeps the history", async () => {
    const { addBook, setStatus, finish, state } = await setup();
    const book = await addBook({ title: "Dune", copy: {} });
    await finish(book, "2019-03-10");

    await setStatus(book, "reading");
    let result = await state(book);
    expect(result.current).toMatchObject({
      status: "reading",
      startedOn: today(),
      page: null,
    });
    expect(result.earlier).toMatchObject([
      { status: "read", endedOn: "2019-03-10" },
    ]);

    await finish(book, "2026-11-01");
    await setStatus(book, "want");
    result = await state(book);
    expect(result.current).toMatchObject({ status: "want" });
    expect(result.earlier.map((r) => r.endedOn)).toEqual([
      "2026-11-01",
      "2019-03-10",
    ]);
  });

  it("takes the start and abandon dates from the caller", async () => {
    const { addBook, call, state } = await setup();
    const book = await addBook({ title: "Dune", copy: {} });
    const put = (status: string, date: string) =>
      call(`/reading/books/${book}`, "PUT", { status, date });

    await put("reading", "2026-11-13");
    await put("abandoned", "2026-11-15");
    expect((await state(book)).current).toMatchObject({
      status: "abandoned",
      startedOn: "2026-11-13",
      endedOn: "2026-11-15",
    });
    expect((await put("reading", "13.11.2026")).status).toBe(400);
  });

  it("changes or forgets the start date of the current read", async () => {
    const { addBook, setStatus, finish, call, state } = await setup();
    const book = await addBook({ title: "Dune", copy: {} });
    const startDate = (date: string | null) =>
      call(`/reading/books/${book}/start-date`, "PUT", { date });
    expect((await startDate("2026-10-01")).status).toBe(404);

    await finish(book, "2019-03-10");
    await setStatus(book, "reading");
    expect((await startDate("2026-10-01")).body).toMatchObject({
      current: { status: "reading", startedOn: "2026-10-01" },
      earlier: [{ status: "read", startedOn: null }],
    });
    await startDate(null);
    expect((await state(book)).current?.startedOn).toBeNull();
    expect((await startDate("1.10.2026")).status).toBe(400);
  });

  it("refuses to abandon a finished book", async () => {
    const { addBook, setStatus, finish } = await setup();
    const book = await addBook({ title: "Dune", copy: {} });
    await finish(book, "2026-01-02");
    expect((await setStatus(book, "abandoned")).status).toBe(409);
  });

  it("finishes with or without a date and ends on the last page", async () => {
    const { addBook, setStatus, finish, progress, state, call } = await setup();
    const book = await addBook({ title: "Dune", pageCount: 600, copy: {} });
    await setStatus(book, "reading");
    await progress(book, "2026-11-01", 200);

    await finish(book, "2026-11-10");
    expect((await state(book)).current).toMatchObject({
      status: "read",
      endedOn: "2026-11-10",
      page: 600,
    });

    // Changing the date moves the final entry; not remembering removes it.
    await finish(book, "2026-11-12");
    const stats = async () =>
      (await call("/statistics?year=2026")).body.pagesPerMonth[10];
    expect(await stats()).toBe(600);
    await finish(book, null);
    expect((await state(book)).current).toMatchObject({
      status: "read",
      endedOn: null,
      page: 200,
    });
    expect(await stats()).toBe(200);
  });

  it("saves the page count when finishing a book without one", async () => {
    const { addBook, finish, state, call } = await setup();
    const book = await addBook({ title: "Dune", copy: {} });
    await finish(book, "2026-11-10", 412);
    expect((await call(`/books/${book}`)).body.pageCount).toBe(412);
    expect((await state(book)).current?.page).toBe(412);
  });

  it("records progress only while reading and within the book", async () => {
    const { addBook, setStatus, progress, call, state } = await setup();
    const book = await addBook({ title: "Dune", pageCount: 600, copy: {} });
    expect((await progress(book, "2026-11-01", 10)).status).toBe(409);

    await setStatus(book, "reading");
    expect((await progress(book, "2026-11-01", 601)).status).toBe(400);
    expect((await progress(book, "2026-11-01", 50)).status).toBe(200);
    await progress(book, "2026-11-03", 90);
    expect((await state(book)).current?.page).toBe(90);

    const unknown = await addBook({ title: "No pages", copy: {} });
    await setStatus(unknown, "reading");
    await call(`/reading/books/${unknown}/progress`, "POST", {
      date: "2026-11-01",
      page: 30,
      pageCount: 250,
    });
    expect((await call(`/books/${unknown}`)).body.pageCount).toBe(250);
  });
});

describe("clearing the status", () => {
  it("falls back to the earlier finished read", async () => {
    const { addBook, setStatus, finish, progress, clear, state } =
      await setup();
    const book = await addBook({ title: "Dune", pageCount: 600, copy: {} });
    await finish(book, "2019-03-10");
    await setStatus(book, "reading");
    await progress(book, "2026-11-01", 100);

    expect((await clear(book)).body).toEqual({ bookKept: true });
    expect(await state(book)).toMatchObject({
      current: { status: "read", endedOn: "2019-03-10", page: 600 },
      earlier: [],
    });
  });

  it("deletes a book nothing refers to any more", async () => {
    const { addBook, setStatus, clear, call } = await setup();
    const owned = await addBook({ title: "Owned", copy: {} });
    const outside = await addBook({ title: "Outside" });
    await setStatus(owned, "want");
    await setStatus(outside, "want");

    expect((await clear(owned)).body).toEqual({ bookKept: true });
    expect((await clear(outside)).body).toEqual({ bookKept: false });
    expect((await call(`/books/${outside}`)).status).toBe(404);
    expect((await clear(owned)).status).toBe(404);
  });

  it("keeps a book another member still reads", async () => {
    const { addBook, setStatus, addMember, clear } = await setup();
    const book = await addBook({ title: "Outside" });
    const ben = await addMember("Ben", "ben@example.com");
    await setStatus(book, "want");
    await ben.setStatus(book, "reading");
    expect((await clear(book)).body).toEqual({ bookKept: true });
  });
});

describe("reading lists", () => {
  it("splits want to read into within reach and the wishlist", async () => {
    const { addBook, setStatus, borrow, call } = await setup();
    const owned = await addBook({ title: "Owned", copy: {} });
    const borrowed = await addBook({ title: "Borrowed" });
    const returned = await addBook({ title: "Returned" });
    const wished = await addBook({ title: "Wished" });
    borrow(borrowed);
    borrow(returned, "2026-10-20");
    for (const book of [owned, borrowed, returned, wished]) {
      await setStatus(book, "want");
    }

    const within = (await call("/reading/want?reach=within")).body;
    expect(within.total).toBe(2);
    expect(
      within.items
        .map((i: { book: { title: string }; borrowed: boolean }) => [
          i.book.title,
          i.borrowed,
        ])
        .sort(),
    ).toEqual([
      ["Borrowed", true],
      ["Owned", false],
    ]);
    const wishlist = (await call("/reading/want?reach=wishlist")).body;
    expect(wishlist.total).toBe(2);
    expect(
      wishlist.items
        .map((i: { book: { title: string } }) => i.book.title)
        .sort(),
    ).toEqual(["Returned", "Wished"]);
  });

  it("pages through finished reads of a year and the undated ones", async () => {
    const { addBook, finish, call } = await setup();
    for (const [title, date] of [
      ["A", "2026-01-05"],
      ["B", "2026-03-01"],
      ["C", "2026-02-11"],
      ["D", "2025-12-31"],
      ["E", null],
    ] as const) {
      await finish(await addBook({ title }), date);
    }

    const first = (await call("/reading/finished?year=2026&limit=2")).body;
    expect(first.total).toBe(3);
    const titles = (body: { items: { book: { title: string } }[] }) =>
      body.items.map((i) => i.book.title);
    expect(titles(first)).toEqual(["B", "C"]);
    const second = (
      await call(
        `/reading/finished?year=2026&limit=2&cursor=${first.nextCursor}`,
      )
    ).body;
    expect(titles(second)).toEqual(["A"]);
    expect(second.nextCursor).toBeNull();

    const undated = (await call("/reading/finished?year=undated")).body;
    expect(titles(undated)).toEqual(["E"]);
    expect(undated.items[0].inLibrary).toBe(false);
  });

  it("lists current and abandoned books with the page reached", async () => {
    const { addBook, setStatus, progress, call } = await setup();
    const now = await addBook({ title: "Now", pageCount: 300, copy: {} });
    const stopped = await addBook({ title: "Stopped", pageCount: 700 });
    await setStatus(now, "reading");
    await progress(now, "2026-11-01", 120);
    await setStatus(stopped, "reading");
    await progress(stopped, "2026-02-01", 148);
    await setStatus(stopped, "abandoned");

    expect((await call("/reading/current")).body.items).toMatchObject([
      { page: 120, inLibrary: true, book: { title: "Now", pageCount: 300 } },
    ]);
    const abandoned = (await call("/reading/abandoned")).body;
    expect(abandoned.total).toBe(1);
    expect(abandoned.items).toMatchObject([
      { page: 148, endedOn: today(), inLibrary: false },
    ]);
  });
});

describe("household reading", () => {
  it("shows the other members' current status", async () => {
    const { addBook, finish, addMember, call } = await setup();
    const book = await addBook({ title: "Dune", copy: {} });
    const ben = await addMember("Ben", "ben@example.com");
    const cleo = await addMember("Cleo", "cleo@example.com");
    await finish(book, "2026-01-01");
    await ben.finish(book, "2024-08-03");
    await ben.setStatus(book, "reading");
    await cleo.finish(book, "2024-08-10");

    expect((await call(`/reading/books/${book}/household`)).body).toMatchObject(
      [
        { user: { name: "Ben" }, status: "reading", startedOn: today() },
        { user: { name: "Cleo" }, status: "read", endedOn: "2024-08-10" },
      ],
    );
  });
});
