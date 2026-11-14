import type { Translation } from "../../i18n/types";

export default {
  title: "Statistik",
  subtitle: "Was {{name}} {{year}} gelesen hat",
  subtitleHousehold: "Was der Haushalt {{year}} gelesen hat",
  whose: "Wessen Lesen",
  household: "Haushalt",
  previousYear: "Vorheriges Jahr",
  nextYear: "Nächstes Jahr",
  tiles: {
    booksFinished: "Bücher gelesen",
    previousYear: "{{count}} im ganzen Jahr {{year}}",
    pagesRead: "Seiten gelesen",
    perDay: "{{value}} pro Tag im Schnitt",
    pagesPerDay: "Seiten pro Tag",
    outside: "Nicht aus der Bibliothek",
    ofBooks_one: "von {{count}} Buch",
    ofBooks_other: "von {{count}} Büchern",
  },
  charts: {
    booksPerMonth: "Gelesene Bücher pro Monat",
    pagesPerMonth: "Gelesene Seiten pro Monat",
    books: "Bücher",
    pages: "Seiten",
    month: "Monat",
    viewAsTable: "Als Tabelle",
    viewAsChart: "Als Diagramm",
  },
  perYear: {
    title: "Gelesene Bücher pro Jahr",
    undated: "Ohne Datum",
    allTime_one: "Insgesamt {{count}} Buch gelesen.",
    allTime_other: "Insgesamt {{count}} Bücher gelesen.",
    untilToday: "{{year}} zählt bis heute, {{date}}.",
  },
  byGenre: {
    title: "Nach Genre",
    none: "{{year}} noch keine Bücher gelesen.",
  },
} satisfies Translation<"statistics">;
