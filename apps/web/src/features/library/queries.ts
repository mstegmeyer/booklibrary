import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "../../lib/api";
import type { LibraryFilters } from "./search";

const pageSize = 30;

const fetchPage = (filters: LibraryFilters, cursor?: string) =>
  unwrap(
    api.books.$get({
      query: {
        q: filters.q,
        locationId: filters.location,
        availability: filters.availability,
        reading: filters.reading,
        sort: filters.sort,
        cursor,
        limit: String(pageSize),
      },
    }),
  );

export type LibraryItem = Awaited<
  ReturnType<typeof fetchPage>
>["items"][number];

/** Everything under this key changes when books, copies or locations do. */
const libraryKey = ["library"];

export const libraryQuery = (filters: LibraryFilters) =>
  infiniteQueryOptions({
    queryKey: [...libraryKey, "books", filters],
    queryFn: ({ pageParam }) => fetchPage(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

export const summaryQuery = queryOptions({
  queryKey: [...libraryKey, "summary"],
  queryFn: () => unwrap(api.books.summary.$get()),
});
