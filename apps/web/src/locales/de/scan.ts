import type { Translation } from "../../i18n/types";

export default {
  title: "Bücher scannen",
  close: "Scanner schließen",
  torch: "Taschenlampe",
  hint: "Halte den Barcode auf der Rückseite in den Rahmen",
  notIsbn: "Dieser Barcode ist keine ISBN.",
  prompt: "Scanne den Barcode eines Buchs, um es hinzuzufügen.",
  invalid: "Dieser Barcode ist keine gültige ISBN.",
  enterByHand: "Von Hand eingeben",
  foundOn: "gefunden in: {{sources}}",
  addNext: "Hinzufügen und weiter scannen",
  notThis: "Nicht dieses Buch",
  typeIsbn: "ISBN eingeben",
  added_one: "{{count}} Buch in dieser Sitzung hinzugefügt",
  added_other: "{{count}} Bücher in dieser Sitzung hinzugefügt",
  done: "Fertig",
  denied:
    "Book Library darf die Kamera nicht verwenden. Um zu scannen, erlaube Book Library den Kamerazugriff in der Einstellungen-App von iOS.",
  unavailable: "Dieses Gerät hat keine Kamera zum Scannen.",
} satisfies Translation<"scan">;
