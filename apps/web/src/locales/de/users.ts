import type { Translation } from "../../i18n/types";

export default {
  title: "Benutzer",
  subtitle: "Alle im Haushalt, die sich anmelden können",
  add: "Benutzer hinzufügen",
  addTitle: "Benutzer hinzufügen",
  addSubmit: "Hinzufügen",
  emailTaken: "Es gibt bereits einen Benutzer mit dieser E-Mail-Adresse.",
  roles: { admin: "Admin", member: "Mitglied" },
  added: "Hinzugefügt am {{date}}",
  resetPassword: "Passwort zurücksetzen",
  resetTitle: "Neues Passwort für {{name}}",
  resetDone: "Das Passwort von {{name}} wurde geändert.",
  newPassword: "Neues Passwort",
  loadMore: "Mehr laden",
} satisfies Translation<"users">;
