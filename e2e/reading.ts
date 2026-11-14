import { type APIRequestContext, expect } from "@playwright/test";

// Seeding helpers for reading: they call the API as the user signed in to
// `request` (`page.request` after `setupAdmin`, or `signIn` below).

export async function setStatus(
  request: APIRequestContext,
  bookId: string,
  status: "want" | "reading" | "abandoned",
) {
  const res = await request.put(`/api/v1/reading/books/${bookId}`, {
    data: { status },
  });
  expect(res.status()).toBe(200);
}

/** Marks a book as read; `date` null means the date is not known. */
export async function finishBook(
  request: APIRequestContext,
  bookId: string,
  date: string | null,
) {
  const res = await request.post(`/api/v1/reading/books/${bookId}/finish`, {
    data: { date },
  });
  expect(res.status()).toBe(200);
}

/** Records the page reached; the status must be "reading". */
export async function addProgress(
  request: APIRequestContext,
  bookId: string,
  date: string,
  page: number,
) {
  const res = await request.post(`/api/v1/reading/books/${bookId}/progress`, {
    data: { date, page },
  });
  expect(res.status()).toBe(200);
}

/** A separate API session for another member, e.g. from `createMember`. */
export async function signIn(
  request: APIRequestContext,
  member: { email: string; password: string },
) {
  const res = await request.post("/api/auth/sign-in/email", {
    data: { email: member.email, password: member.password },
  });
  expect(res.status()).toBe(200);
}

/** Today in the browser's sense, as `YYYY-MM-DD`. */
export function today() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
