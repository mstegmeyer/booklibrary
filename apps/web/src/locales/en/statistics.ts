const statistics = {
  title: "Statistics",
  subtitle: "What {{name}} read in {{year}}",
  subtitleHousehold: "What the household read in {{year}}",
  whose: "Whose reading",
  household: "Household",
  previousYear: "Previous year",
  nextYear: "Next year",
  tiles: {
    booksFinished: "Books finished",
    previousYear: "{{count}} in all of {{year}}",
    pagesRead: "Pages read",
    perDay: "{{value}} a day on average",
    pagesPerDay: "Pages a day",
    outside: "From outside the library",
    ofBooks_one: "of {{count}} book",
    ofBooks_other: "of {{count}} books",
  },
  charts: {
    booksPerMonth: "Books finished per month",
    pagesPerMonth: "Pages read per month",
    books: "Books",
    pages: "Pages",
    month: "Month",
    viewAsTable: "View as table",
    viewAsChart: "View as chart",
  },
  perYear: {
    title: "Books finished per year",
    undated: "No date",
    allTime_one: "All time: {{count}} book.",
    allTime_other: "All time: {{count}} books.",
    untilToday: "{{year}} counts up to today, {{date}}.",
  },
  byGenre: {
    title: "By genre",
    none: "No books finished in {{year}}.",
  },
};

export default statistics;

declare module "../../i18n/types" {
  interface Namespaces {
    statistics: typeof statistics;
  }
}
