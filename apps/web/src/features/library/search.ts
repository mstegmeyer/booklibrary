export const availabilities = ["shelf", "lent"] as const;
export const formats = ["print", "ebook"] as const;
export const readingFilters = [
  "want",
  "reading",
  "read",
  "abandoned",
  "none",
] as const;
export const sorts = ["added", "title", "author"] as const;
export const owns = ["borrowed", "reading-list"] as const;

/** The Library's state in the URL, so going back restores it. */
export type LibrarySearch = {
  q?: string;
  location?: string;
  availability?: (typeof availabilities)[number];
  format?: (typeof formats)[number];
  reading?: (typeof readingFilters)[number];
  /** A genre's id, or "none". */
  genre?: string;
  sort?: Exclude<(typeof sorts)[number], "added">;
  /** Opens the "Add a book" dialog. */
  add?: boolean;
  /** Preselects how the added book is owned. */
  own?: (typeof owns)[number];
  /** Opens the dialog's manual entry with this ISBN. */
  isbn?: string;
};

const oneOf = <T extends string>(values: readonly T[], value: unknown) =>
  values.find((v) => v === value);

export function parseLibrarySearch(
  search: Record<string, unknown>,
): LibrarySearch {
  const text = (value: unknown) =>
    typeof value === "string" && value ? value : undefined;
  return {
    q: text(search.q),
    location: text(search.location),
    availability: oneOf(availabilities, search.availability),
    format: oneOf(formats, search.format),
    reading: oneOf(readingFilters, search.reading),
    genre: text(search.genre),
    sort: oneOf(["title", "author"] as const, search.sort),
    add: search.add === true || undefined,
    own: oneOf(owns, search.own),
    isbn: text(search.isbn),
  };
}

export type LibraryFilters = Omit<LibrarySearch, "add" | "own" | "isbn">;

export const filtersOf = ({
  add: _add,
  own: _own,
  isbn: _isbn,
  ...filters
}: LibrarySearch): LibraryFilters => filters;

export const hasFilters = (filters: LibraryFilters) =>
  Object.values(filters).some((value) => value !== undefined);
