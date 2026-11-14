import type { BookDetail, CopyDetail } from "./queries";

/**
 * Loan buttons in a copy's row ("Lend", "Mark returned"). The loans feature
 * fills it; until then it renders nothing.
 */
export function CopyLoanActions(_: { book: BookDetail; copy: CopyDetail }) {
  return null;
}
