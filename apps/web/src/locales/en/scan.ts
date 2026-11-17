const scan = {
  title: "Scan books",
  close: "Close scanner",
  torch: "Torch",
  hint: "Hold the barcode on the back cover inside the frame",
  notIsbn: "This barcode is not an ISBN.",
  prompt: "Scan the barcode of a book to add it.",
  invalid: "This barcode is not a valid ISBN.",
  enterByHand: "Enter by hand",
  foundOn: "found on {{sources}}",
  addNext: "Add and scan next",
  notThis: "Not this book",
  typeIsbn: "Type an ISBN",
  added_one: "{{count}} book added in this session",
  added_other: "{{count}} books added in this session",
  done: "Done",
  denied:
    "Hootshelf may not use the camera. To scan, allow camera access for Hootshelf in the iOS Settings app.",
  unavailable: "This device has no camera to scan with.",
};

export default scan;

declare module "../../i18n/types" {
  interface Namespaces {
    scan: typeof scan;
  }
}
