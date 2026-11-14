import type { Translation } from "../../i18n/types";

export default {
  setup: {
    title: "Bibliothek einrichten",
    intro:
      "Lege das Administratorkonto an. Weitere Haushaltsmitglieder kannst du danach hinzufügen.",
    submit: "Konto anlegen",
  },
  login: {
    title: "Anmelden",
    intro: "Melde dich bei eurer Haushaltsbibliothek an.",
    submit: "Anmelden",
    invalid: "E-Mail-Adresse oder Passwort ist falsch.",
  },
} satisfies Translation<"auth">;
