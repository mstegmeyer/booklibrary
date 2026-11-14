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
  const copyOf = async (title: string) =>
    (await call("/books", "POST", { title, copy: {} })).body.copies[0].id;
  return { call, copyOf };
}

describe("contacts", () => {
  it("adds, renames and lists people by name", async () => {
    const { call } = await setup();
    const tobias = (await call("/contacts", "POST", { name: " Tobias " })).body;
    expect(tobias).toMatchObject({ name: "Tobias", lent: 0, borrowed: 0 });
    await call("/contacts", "POST", { name: "lena" });

    const renamed = await call(`/contacts/${tobias.id}`, "PATCH", {
      name: "Anton",
    });
    expect(renamed.body.name).toBe("Anton");
    const names = (await call("/contacts")).body.items.map(
      (c: { name: string }) => c.name,
    );
    expect(names).toEqual(["Anton", "lena"]);
    expect((await call("/contacts", "POST", { name: " " })).status).toBe(400);
    expect(
      (await call("/contacts/missing", "PATCH", { name: "X" })).status,
    ).toBe(404);
  });

  it("counts the books each person has and has lent us", async () => {
    const { call, copyOf } = await setup();
    const lena = (await call("/contacts", "POST", { name: "Lena" })).body;
    const contact = { id: lena.id };
    for (const title of ["Dune", "Momo", "Stoner"]) {
      await call("/loans/lent", "POST", {
        copyId: await copyOf(title),
        contact,
        startedOn: "2026-10-02",
      });
    }
    const returned = (await call("/loans/lent")).body.items[0];
    await call(`/loans/${returned.id}/return`, "POST", {
      endedOn: "2026-10-03",
    });
    const klara = (await call("/books", "POST", { title: "Klara" })).body;
    await call("/loans/borrowed", "POST", {
      bookId: klara.id,
      contact,
      startedOn: "2026-10-02",
    });

    expect((await call("/contacts")).body.items).toEqual([
      { id: lena.id, name: "Lena", lent: 2, borrowed: 1 },
    ]);
  });

  it("deletes a person only when no loan refers to them", async () => {
    const { call, copyOf } = await setup();
    const loan = (
      await call("/loans/lent", "POST", {
        copyId: await copyOf("Dune"),
        contact: { name: "Lena" },
        startedOn: "2026-10-02",
      })
    ).body;
    await call(`/loans/${loan.id}/return`, "POST", { endedOn: "2026-10-03" });

    const refused = await call(`/contacts/${loan.contact.id}`, "DELETE");
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("conflict");

    await call(`/loans/${loan.id}`, "DELETE");
    expect((await call(`/contacts/${loan.contact.id}`, "DELETE")).status).toBe(
      204,
    );
    expect((await call("/contacts")).body.items).toEqual([]);
    expect((await call(`/contacts/${loan.contact.id}`, "DELETE")).status).toBe(
      404,
    );
  });
});
