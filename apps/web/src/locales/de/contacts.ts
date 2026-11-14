import type { Translation } from "../../i18n/types";

export default {
  title: "Personen",
  explain:
    "Personen, denen du Bücher leihst oder die dir welche leihen, sind nur Namen. Sie brauchen kein Konto.",
  none: "Noch niemand.",
  has: "Hat {{count}} deiner Bücher",
  lentYou: "hat dir {{count}} geliehen",
  onlyLentYou: "Hat dir {{count}} geliehen",
  noLoans: "Keine offenen Ausleihen",
  add: "Person hinzufügen",
  addSubmit: "Hinzufügen",
  name: "Name",
  menu: "Mehr zu {{name}}",
  rename: "Umbenennen",
  renameTitle: "{{name}} umbenennen",
  save: "Speichern",
  delete: "Löschen",
  deleteTitle: "{{name}} löschen?",
  deleteText:
    "Nur Personen ohne Ausleihen, offene oder zurückgegebene, können gelöscht werden.",
  inUse: "{{name}} kommt noch in Ausleihen vor und kann nicht gelöscht werden.",
  picker: {
    label: "Person",
    newPerson: "Neue Person",
    newName: "Name der neuen Person",
  },
} satisfies Translation<"contacts">;
