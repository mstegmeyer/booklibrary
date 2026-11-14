import { expect, type Page } from "@playwright/test";

// Seeding helpers for people and loans: they call the API as the signed-in
// user of `page` (see `setupAdmin` in fixtures.ts).

export type SeededContact = { id: string; name: string };
export type SeededLoan = {
  id: string;
  contact: SeededContact;
  book: { id: string; title: string };
};

/** An existing person by id, or a new one by name. */
type Person = { id: string } | { name: string };

export async function createContact(
  page: Page,
  name: string,
): Promise<SeededContact> {
  const res = await page.request.post("/api/v1/contacts", { data: { name } });
  expect(res.status()).toBe(201);
  return res.json();
}

export async function lendCopy(
  page: Page,
  copyId: string,
  contact: Person,
  startedOn = "2026-10-02",
): Promise<SeededLoan> {
  const res = await page.request.post("/api/v1/loans/lent", {
    data: { copyId, contact, startedOn },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

/** Records that someone lent us an existing book. */
export async function borrowBook(
  page: Page,
  bookId: string,
  contact: Person,
  startedOn = "2026-10-28",
): Promise<SeededLoan> {
  const res = await page.request.post("/api/v1/loans/borrowed", {
    data: { bookId, contact, startedOn },
  });
  expect(res.status()).toBe(201);
  return res.json();
}

export async function returnLoan(
  page: Page,
  loanId: string,
  endedOn = "2026-11-01",
) {
  const res = await page.request.post(`/api/v1/loans/${loanId}/return`, {
    data: { endedOn },
  });
  expect(res.status()).toBe(200);
}
