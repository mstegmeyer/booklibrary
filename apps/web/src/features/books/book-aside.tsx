import type { BookDetail } from "./queries";

/**
 * The right-hand column of the book page ("Your reading", "Household").
 * The reading feature fills it; until then it renders nothing and the column
 * stays empty.
 */
export function BookAside(_: { book: BookDetail }) {
  return null;
}
