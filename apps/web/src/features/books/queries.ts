import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { ApiError, api, unwrap } from "../../lib/api";

const fetchBook = (id: string) =>
  unwrap(api.books[":id"].$get({ param: { id } }));

export type BookDetail = Awaited<ReturnType<typeof fetchBook>>;
export type CopyDetail = BookDetail["copies"][number];
export type FileDetail = BookDetail["files"][number];

export const bookQuery = (id: string) =>
  queryOptions({
    queryKey: ["books", id],
    queryFn: () => fetchBook(id),
    retry: (failures, error) =>
      !(error instanceof ApiError && error.status === 404) && failures < 3,
  });

/** Refreshes everything that shows books, copies or location and genre counts. */
export const refreshCatalogue = (queryClient: QueryClient) =>
  Promise.all(
    [["library"], ["books"], ["locations"], ["genres"]].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );

/** A `YYYY-MM-DD` date from the API as a local date. */
export function fromIsoDate(value: string) {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export const lookupIsbn = (isbn: string) =>
  unwrap(api.metadata.isbn[":isbn"].$get({ param: { isbn } }));

export const searchCatalogues = async (q: string) =>
  (await unwrap(api.metadata.search.$get({ query: { q } }))).items;

/** A book found in the catalogues. */
export type Candidate = Awaited<ReturnType<typeof lookupIsbn>>;

/** Uploads an e-book to add; nothing is saved before `POST /books`. */
export const stageEbook = (file: File) =>
  unwrap(api.books.uploads.$post({ form: { file } }));

export type StagedEbook = Awaited<ReturnType<typeof stageEbook>>;

export const addEbook = (bookId: string, file: File, replace: boolean) =>
  unwrap(
    api.books[":id"].files.$post({
      param: { id: bookId },
      query: { replace: String(replace) },
      form: { file },
    }),
  );

export const fileUrl = (bookId: string, fileId: string) =>
  `/api/v1/books/${bookId}/files/${fileId}`;

export const lookUpCover = (bookId: string) =>
  unwrap(api.books[":id"].cover.lookup.$post({ param: { id: bookId } }));

export async function uploadCover(bookId: string, file: File) {
  return unwrap(
    api.books[":id"].cover.$put({ param: { id: bookId }, form: { file } }),
  );
}
