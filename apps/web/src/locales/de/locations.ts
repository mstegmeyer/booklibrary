import type { Translation } from "../../i18n/types";

export default {
  title: "Orte",
  subtitle: "Orte, Räume und Regale, so tief verschachtelt wie nötig",
  add: "Ort hinzufügen",
  addTitle: "Ort hinzufügen",
  addInside: "Ort darin hinzufügen",
  addInsideTitle: "Ort in {{name}} hinzufügen",
  addSubmit: "Hinzufügen",
  name: "Name",
  inside: "Liegt in",
  topLevel: "Nichts, es ist ein eigener Ort",
  save: "Speichern",
  showBooks_one: "{{count}} Buch anzeigen",
  showBooks_other: "{{count}} Bücher anzeigen",
  delete: "Ort löschen",
  blockedByChildren:
    "Verschiebe oder lösche zuerst die Orte, die darin liegen.",
  blockedByBooks_one: "Stelle zuerst sein Buch an einen anderen Ort.",
  blockedByBooks_other:
    "Stelle zuerst seine {{count}} Bücher an einen anderen Ort.",
  cycle: "Ein Ort kann nicht in sich selbst verschoben werden.",
  empty:
    "Noch keine Orte. Beginne mit einem Ort wie deiner Wohnung und füge dann Räume und Regale darin hinzu.",
  noSelection:
    "Wähle einen Ort, um ihn umzubenennen, zu verschieben oder zu löschen.",
} satisfies Translation<"locations">;
