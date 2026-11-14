import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/app.ts";

type Book = { id: string; copies: { id: string }[] };

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
  const addBook = async (title: string, copy: object | undefined = {}) => {
    const res = await call("/books", "POST", { title, copy });
    if (res.status !== 201) throw new Error(JSON.stringify(res.body));
    return res.body as Book;
  };
  const lend = async (copyId: string, contact: object = { name: "Lena" }) =>
    call("/loans/lent", "POST", { copyId, contact, startedOn: "2026-10-02" });
  const titles = async (list: string) =>
    (await call(`/loans/${list}`)).body.items.map(
      (l: { book: { title: string } }) => l.book.title,
    );
  return { ...app, call, addBook, lend, titles };
}

describe("loans", () => {
  it("lends to the known person when a typed name already exists", async () => {
    const { call, addBook, lend } = await setup();
    const dune = await addBook("Dune");
    const momo = await addBook("Momo");

    await lend(dune.copies[0]?.id ?? "", { name: "Lena K." });
    await lend(momo.copies[0]?.id ?? "", { name: "lena k." });

    const people = (await call("/contacts")).body.items;
    expect(people).toMatchObject([{ name: "Lena K.", lent: 2 }]);
  });

  it("lends a copy to a new person and lists it with where it goes back", async () => {
    const { call, addBook, lend } = await setup();
    const shelf = (await call("/locations", "POST", { name: "Shelf A" })).body;
    const book = await addBook("Dune", {
      locationId: shelf.id,
      format: "paperback",
    });

    const res = await lend(book.copies[0]?.id ?? "", { name: "Lena K." });
    expect(res.status).toBe(201);
    const { body } = await call("/loans/lent");
    expect(body).toMatchObject({
      total: 1,
      nextCursor: null,
      items: [
        {
          direction: "lent",
          startedOn: "2026-10-02",
          endedOn: null,
          book: { id: book.id, title: "Dune", thumbnailUrl: null },
          copy: { format: "paperback", locationPath: ["Shelf A"] },
          contact: { name: "Lena K." },
        },
      ],
    });
    expect((await call(`/books/${book.id}`)).body.copies[0].loan).toEqual({
      contactName: "Lena K.",
      startedOn: "2026-10-02",
    });
  });

  it("allows one active loan per copy", async () => {
    const { addBook, lend, call } = await setup();
    const book = await addBook("Dune");
    const copyId = book.copies[0]?.id ?? "";
    const first = await lend(copyId);

    const second = await lend(copyId, { id: first.body.contact.id });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("copy_lent");

    await call(`/loans/${first.body.id}/return`, "POST", {
      endedOn: "2026-10-20",
    });
    expect((await lend(copyId, { id: first.body.contact.id })).status).toBe(
      201,
    );
    expect((await lend("missing")).status).toBe(404);
  });

  it("returns a loan on a given day, not before it started", async () => {
    const { addBook, lend, call, titles } = await setup();
    const book = await addBook("Dune");
    const loan = (await lend(book.copies[0]?.id ?? "")).body;

    const early = await call(`/loans/${loan.id}/return`, "POST", {
      endedOn: "2026-10-01",
    });
    expect(early.status).toBe(400);

    const res = await call(`/loans/${loan.id}/return`, "POST", {
      endedOn: "2026-10-20",
    });
    expect(res.status).toBe(200);
    expect(res.body.endedOn).toBe("2026-10-20");
    expect(await titles("lent")).toEqual([]);
    expect(await titles("returned")).toEqual(["Dune"]);
    expect((await call(`/books/${book.id}`)).body.copies[0].loan).toBeNull();

    const again = await call(`/loans/${loan.id}/return`, "POST", {
      endedOn: "2026-10-21",
    });
    expect(again.status).toBe(409);
  });

  it("records borrowed books without a copy, outside the library", async () => {
    const { call, titles } = await setup();
    const book = (await call("/books", "POST", { title: "Klara" })).body;

    const res = await call("/loans/borrowed", "POST", {
      bookId: book.id,
      contact: { name: "Sophie" },
      startedOn: "2026-10-28",
      note: "Signed",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      direction: "borrowed",
      copy: null,
      note: "Signed",
    });
    expect(await titles("borrowed")).toEqual(["Klara"]);
    expect(await titles("lent")).toEqual([]);
    expect((await call("/books")).body.items).toEqual([]);

    await call(`/loans/${res.body.id}/return`, "POST", {
      endedOn: "2026-11-02",
    });
    expect(await titles("borrowed")).toEqual([]);
    expect(await titles("returned")).toEqual(["Klara"]);
  });

  it("keeps history when the copy is removed", async () => {
    const { call, addBook, lend, titles } = await setup();
    const book = await addBook("Dune");
    await call(`/books/${book.id}/copies`, "POST", {});
    const copyId = book.copies[0]?.id ?? "";
    const loan = (await lend(copyId)).body;

    const refused = await call(`/books/${book.id}/copies/${copyId}`, "DELETE");
    expect(refused.body.error.code).toBe("copy_lent");

    await call(`/loans/${loan.id}/return`, "POST", { endedOn: "2026-10-20" });
    const removed = await call(`/books/${book.id}/copies/${copyId}`, "DELETE");
    expect(removed).toEqual({ status: 200, body: { bookKept: true } });

    const history = (await call("/loans/returned")).body.items;
    expect(history).toMatchObject([
      { id: loan.id, copy: null, book: { title: "Dune" } },
    ]);
    expect(await titles("returned")).toEqual(["Dune"]);
  });

  it("keeps a book whose last copy is removed while its history remains", async () => {
    const { call, addBook, lend } = await setup();
    const book = await addBook("Dune");
    const copyId = book.copies[0]?.id ?? "";
    const loan = (await lend(copyId)).body;
    await call(`/loans/${loan.id}/return`, "POST", { endedOn: "2026-10-20" });

    const removed = await call(`/books/${book.id}/copies/${copyId}`, "DELETE");
    expect(removed.body).toEqual({ bookKept: true });
    expect((await call("/books")).body.items).toEqual([]);

    expect((await call(`/loans/${loan.id}`, "DELETE")).status).toBe(204);
    expect((await call(`/books/${book.id}`)).status).toBe(404);
  });

  it("deleting a loan keeps a book that is still referenced", async () => {
    const { call, addBook, lend } = await setup();
    const book = await addBook("Dune");
    const loan = (await lend(book.copies[0]?.id ?? "")).body;
    expect((await call(`/loans/${loan.id}`, "DELETE")).status).toBe(204);
    expect((await call(`/books/${book.id}`)).status).toBe(200);
    expect((await call(`/loans/${loan.id}`, "DELETE")).status).toBe(404);
  });

  it("corrects the person, dates and note", async () => {
    const { call, addBook, lend } = await setup();
    const book = await addBook("Dune");
    const loan = (await lend(book.copies[0]?.id ?? "")).body;
    await call(`/loans/${loan.id}/return`, "POST", { endedOn: "2026-10-20" });

    const res = await call(`/loans/${loan.id}`, "PATCH", {
      contact: { name: "Sophie" },
      startedOn: "2026-10-01",
      endedOn: "2026-10-15",
      note: "Coffee stain",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      contact: { name: "Sophie" },
      startedOn: "2026-10-01",
      endedOn: "2026-10-15",
      note: "Coffee stain",
    });

    const backwards = await call(`/loans/${loan.id}`, "PATCH", {
      startedOn: "2026-10-16",
    });
    expect(backwards.status).toBe(400);
    const unknown = await call(`/loans/${loan.id}`, "PATCH", {
      contact: { id: "missing" },
    });
    expect(unknown.status).toBe(400);
  });

  it("pages through the lists newest first", async () => {
    const { call, addBook } = await setup();
    const days = ["2026-01-05", "2026-03-01", "2026-03-01", "2026-02-10"];
    for (const [i, startedOn] of days.entries()) {
      const book = await addBook(`Book ${i}`);
      await call("/loans/lent", "POST", {
        copyId: book.copies[0]?.id,
        contact: { name: "Lena" },
        startedOn,
      });
    }
    const seen: string[] = [];
    let cursor = "";
    do {
      const { body } = await call(
        `/loans/lent?limit=3${cursor ? `&cursor=${cursor}` : ""}`,
      );
      expect(body.total).toBe(4);
      seen.push(...body.items.map((l: { startedOn: string }) => l.startedOn));
      cursor = body.nextCursor ?? "";
    } while (cursor);
    expect(seen).toEqual([
      "2026-03-01",
      "2026-03-01",
      "2026-02-10",
      "2026-01-05",
    ]);
  });
});
