import { infiniteQueryOptions, type QueryClient } from "@tanstack/react-query";
import { api, unwrap } from "../../lib/api";
import { fromIsoDate, refreshCatalogue } from "../books/queries";

export type LoanList = "lent" | "borrowed" | "returned";

const fetchPage = (list: LoanList, cursor?: string) =>
  unwrap(api.loans[list].$get({ query: { cursor, limit: "20" } }));

export type Loan = Awaited<ReturnType<typeof fetchPage>>["items"][number];

export const loansQuery = (list: LoanList) =>
  infiniteQueryOptions({
    queryKey: ["loans", list],
    queryFn: ({ pageParam }) => fetchPage(list, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

/** The active loan of a copy, if it is lent out. */
export const fetchCopyLoan = async (copyId: string) =>
  (await unwrap(api.loans.lent.$get({ query: { copyId, limit: "1" } })))
    .items[0] ?? null;

/** Refreshes everything that shows loans: lists, people, books and the library. */
export const refreshLoans = (queryClient: QueryClient) =>
  Promise.all([
    refreshCatalogue(queryClient),
    queryClient.invalidateQueries({ queryKey: ["loans"] }),
    queryClient.invalidateQueries({ queryKey: ["contacts"] }),
  ]);

/** Today in the browser's time zone, as `YYYY-MM-DD`. */
export function today() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whole days from one `YYYY-MM-DD` date to another. */
export const daysBetween = (from: string, to: string) =>
  Math.round(
    (fromIsoDate(to).getTime() - fromIsoDate(from).getTime()) / 86_400_000,
  );
