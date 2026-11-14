const library = {
  title: "Library",
  books_one: "{{count}} book",
  books_other: "{{count}} books",
  inPlaces_one: "in {{count}} place",
  inPlaces_other: "in {{count}} places",
  lentOut: "{{count}} lent out",
  search: "Search the library",
  searchPlaceholder: "Title, author or ISBN",
  gridView: "Grid view",
  listView: "List view",
  allPlaces: "All places",
  all: "All",
  lentOutFilter: "Lent out",
  availability: {
    label: "Availability",
    any: "Any",
    shelf: "On the shelf",
    lent: "Lent out",
  },
  reading: {
    label: "My reading",
    any: "Any",
    want: "Want to read",
    reading: "Reading",
    read: "Read",
    abandoned: "Abandoned",
    none: "No status",
  },
  sort: {
    label: "Sort",
    added: "Recently added",
    title: "Title",
    author: "Author",
  },
  columns: {
    book: "Book",
    location: "Location",
    copies: "Copies",
    reading: "My reading",
    pages: "Pages",
  },
  youReadThis: "You have read this",
  lentTo: "Lent to {{name}}",
  noLocation: "No location",
  readingProgress: "Reading · {{progress}}%",
  shown: "{{shown}} of {{total}} shown",
  moreOnScroll: "more load as you scroll",
  empty: "Your library is empty.",
  addFirst: "Add your first book",
  noMatches: "No books match your search and filters.",
  clearFilters: "Clear search and filters",
};

export default library;

declare module "../../i18n/types" {
  interface Namespaces {
    library: typeof library;
  }
}
