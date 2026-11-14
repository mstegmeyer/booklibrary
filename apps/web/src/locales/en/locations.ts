const locations = {
  title: "Locations",
  subtitle: "Places, rooms and shelves, nested as deep as you need",
  add: "Add location",
  addTitle: "Add a location",
  addInside: "Add a location inside",
  addInsideTitle: "Add a location inside {{name}}",
  addSubmit: "Add",
  name: "Name",
  inside: "Inside",
  topLevel: "Nothing, it is a place of its own",
  save: "Save",
  showBooks_one: "Show {{count}} book",
  showBooks_other: "Show {{count}} books",
  delete: "Delete location",
  blockedByChildren: "Move or delete the locations inside it first.",
  blockedByBooks_one: "Move its book somewhere else first.",
  blockedByBooks_other: "Move its {{count}} books somewhere else first.",
  cycle: "A location cannot be moved inside itself.",
  empty:
    "No locations yet. Start with a place, such as your home, then add rooms and shelves inside it.",
  noSelection: "Select a location to rename, move or delete it.",
};

export default locations;

declare module "../../i18n/types" {
  interface Namespaces {
    locations: typeof locations;
  }
}
