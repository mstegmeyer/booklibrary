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
  resetSignsOut: "{{name}} wird auf allen Geräten abgemeldet.",
  makeAdmin: "Zum Admin machen",
  makeAdminTitle: "{{name}} zum Admin machen?",
  makeAdminText:
    "{{name}} kann dann Benutzer verwalten: sie hinzufügen, ihre Passwörter zurücksetzen, ihre Rollen ändern und sie entfernen.",
  removeAdmin: "Admin-Rolle entziehen",
  removeAdminTitle: "{{name}} die Admin-Rolle entziehen?",
  removeAdminText:
    "{{name}} bleibt Mitglied und kann keine Benutzer mehr verwalten.",
  lastAdmin: "Der letzte Admin muss Admin bleiben.",
  remove: "Entfernen",
  removeTitle: "{{name}} entfernen?",
  removeText:
    "{{name}} kann sich dann nicht mehr anmelden, und der Leseverlauf wird gelöscht. Die hinzugefügten Bücher und Exemplare bleiben in der Bibliothek. Das lässt sich nicht rückgängig machen.",
  removeSubmit: "Benutzer entfernen",
  loadMore: "Mehr laden",
} satisfies Translation<"users">;
