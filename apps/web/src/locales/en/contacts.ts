const contacts = {
  title: "People",
  explain:
    "People you lend to or borrow from are just names. They do not need an account.",
  none: "Nobody yet.",
  has: "Has {{count}} of your books",
  lentYou: "lent you {{count}}",
  onlyLentYou: "Lent you {{count}}",
  noLoans: "No open loans",
  add: "Add a person",
  addSubmit: "Add",
  name: "Name",
  menu: "More for {{name}}",
  rename: "Rename",
  renameTitle: "Rename {{name}}",
  save: "Save",
  delete: "Delete",
  deleteTitle: "Delete {{name}}?",
  deleteText:
    "Only people without any loans, open or returned, can be deleted.",
  inUse: "{{name}} still appears in loans and cannot be deleted.",
  picker: {
    label: "Person",
    newPerson: "New person",
    newName: "Name of the new person",
  },
};

export default contacts;

declare module "../../i18n/types" {
  interface Namespaces {
    contacts: typeof contacts;
  }
}
