import { HouseholdReading, YourReading } from "../reading/book-reading";
import type { BookDetail } from "./queries";

/**
 * The right-hand column of the book page. Below the widest layout the
 * column dissolves: "Your reading" stays above the copies and "Household"
 * moves to the end of the page.
 */
export function BookAside({ book }: { book: BookDetail }) {
  return (
    <>
      <YourReading book={book} />
      <HouseholdReading book={book} className="max-xl:order-last" />
    </>
  );
}
