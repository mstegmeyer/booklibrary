import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { ApiError, api, unwrap } from "../../lib/api";

const fetchBook = (id: string) =>
  unwrap(api.books[":id"].$get({ param: { id } }));

export type BookDetail = Awaited<ReturnType<typeof fetchBook>>;
export type CopyDetail = BookDetail["copies"][number];

export const bookQuery = (id: string) =>
  queryOptions({
    queryKey: ["books", id],
    queryFn: () => fetchBook(id),
    retry: (failures, error) =>
      !(error instanceof ApiError && error.status === 404) && failures < 3,
  });

/** Refreshes everything that shows books, copies or location counts. */
export const refreshCatalogue = (queryClient: QueryClient) =>
  Promise.all(
    [["library"], ["books"], ["locations"]].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );

/** A `YYYY-MM-DD` date from the API as a local date. */
export function fromIsoDate(value: string) {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export async function uploadCover(bookId: string, file: File) {
  return unwrap(
    api.books[":id"].cover.$put({ param: { id: bookId }, form: { file } }),
  );
}
