import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api, unwrap } from "../../lib/api";
import { fromIsoDate } from "../books/queries";

const fetchMyReading = (bookId: string) =>
  unwrap(api.reading.books[":bookId"].$get({ param: { bookId } }));

export type MyReading = Awaited<ReturnType<typeof fetchMyReading>>;
export type CurrentReading = NonNullable<MyReading["current"]>;

export const myReadingQuery = (bookId: string) =>
  queryOptions({
    queryKey: ["reading", "book", bookId],
    queryFn: () => fetchMyReading(bookId),
  });

export const householdQuery = (bookId: string) =>
  queryOptions({
    queryKey: ["reading", "household", bookId],
    queryFn: () =>
      unwrap(
        api.reading.books[":bookId"].household.$get({ param: { bookId } }),
      ),
  });

export const currentQuery = queryOptions({
  queryKey: ["reading", "current"],
  queryFn: () => unwrap(api.reading.current.$get()),
});

export type ReadingItem = Awaited<
  ReturnType<NonNullable<typeof currentQuery.queryFn>>
>["items"][number];

const pageSize = 50;
const pages = <Page extends { nextCursor: string | null }>(
  queryKey: unknown[],
  fetch: (cursor: string | undefined) => Promise<Page>,
) =>
  infiniteQueryOptions({
    queryKey,
    queryFn: ({ pageParam }) => fetch(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const wantQuery = (reach: "within" | "wishlist") =>
  pages(["reading", "want", reach], (cursor) =>
    unwrap(
      api.reading.want.$get({
        query: { reach, cursor, limit: String(pageSize) },
      }),
    ),
  );

export const finishedQuery = (year: number | "undated") =>
  pages(["reading", "finished", year], (cursor) =>
    unwrap(
      api.reading.finished.$get({
        query: { year: String(year), cursor, limit: String(pageSize) },
      }),
    ),
  );

export const abandonedQuery = pages(["reading", "abandoned"], (cursor) =>
  unwrap(
    api.reading.abandoned.$get({ query: { cursor, limit: String(pageSize) } }),
  ),
);

/** Refreshes everything that shows reading status, progress or figures. */
export const refreshReading = (queryClient: QueryClient) =>
  Promise.all(
    [["reading"], ["statistics"], ["library"], ["books"]].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );

const pad = (n: number) => String(n).padStart(2, "0");

/** Today in the browser's time zone as `YYYY-MM-DD`. */
export function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const percent = (page: number, pageCount: number) =>
  Math.min(100, Math.round((page / pageCount) * 100));

/** Formats a `YYYY-MM-DD` date as a month and year ("March 2019"). */
export function useMonthYear() {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    month: "long",
    year: "numeric",
  });
  return (date: string) => format.format(fromIsoDate(date));
}
