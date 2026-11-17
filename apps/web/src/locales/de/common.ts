import type { Translation } from "../../i18n/types";

export default {
  appName: "Hootshelf",
  nav: {
    main: "Hauptnavigation",
    library: "Bibliothek",
    reading: "Lesen",
    statistics: "Statistik",
    loans: "Ausleihen",
    locations: "Orte",
    addBook: "Buch hinzufügen",
  },
  account: {
    menu: "Konto: {{name}}",
    language: "Sprache",
    users: "Benutzer",
    changeServer: "Server wechseln",
    signOut: "Abmelden",
  },
  pages: {
    empty: "Hier ist noch nichts.",
  },
  form: {
    name: "Name",
    email: "E-Mail",
    password: "Passwort",
    passwordHint: "Mindestens 8 Zeichen",
    cancel: "Abbrechen",
    save: "Speichern",
  },
  errors: {
    generic: "Etwas ist schiefgelaufen. Bitte versuche es noch einmal.",
    network: "Der Server ist nicht erreichbar.",
  },
} satisfies Translation<"common">;
