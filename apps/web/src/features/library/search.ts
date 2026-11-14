export const availabilities = ["shelf", "lent"] as const;
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
  reading?: (typeof readingFilters)[number];
  sort?: Exclude<(typeof sorts)[number], "added">;
  /** Opens the "Add a book" dialog. */
  add?: boolean;
  /** Preselects how the added book is owned. */
  own?: (typeof owns)[number];
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
    reading: oneOf(readingFilters, search.reading),
    sort: oneOf(["title", "author"] as const, search.sort),
    add: search.add === true || undefined,
    own: oneOf(owns, search.own),
  };
}

export type LibraryFilters = Omit<LibrarySearch, "add" | "own">;

export const filtersOf = ({
  add: _add,
  own: _own,
  ...filters
}: LibrarySearch): LibraryFilters => filters;

export const hasFilters = (filters: LibraryFilters) =>
  Object.values(filters).some((value) => value !== undefined);
