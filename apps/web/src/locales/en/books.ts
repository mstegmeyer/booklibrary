const books = {
  form: {
    title: "Title",
    subtitle: "Subtitle",
    authors: "Authors",
    authorsHint: "Separate several authors with commas",
    pages: "Pages",
    year: "Year",
    language: "Language",
    isbns: "ISBN",
    isbnsHint: "ISBN-10 or ISBN-13; separate several with commas",
    description: "Description",
    cover: "Cover image",
    chooseCover: "Choose image",
    isbnInvalid: "One of the ISBNs is not valid. Please check its digits.",
    imageInvalid: "This file is not an image we can read.",
    sortAs: "Sort as",
    sortAsHint:
      "How the Library sorts this book by author. Leave empty to use the surname.",
  },
  add: {
    title: "Add a book",
    thisBookIs: "This book is",
    inLibrary: "In our library",
    shelf: "Shelf",
    noLocation: "No location yet",
    submit: "Add",
    submitNext: "Add and enter next",
    added: "“{{title}}” was added.",
  },
  duplicate: {
    title: "This book is already in your library",
    noCopies: "This book is already known, but you have no copy of it yet.",
    addCopy: "Add another copy",
    skip: "Skip",
    open: "Open the book",
  },
  page: {
    library: "Library",
    breadcrumb: "Breadcrumb",
    edit: "Edit",
    editDetails: "Edit details",
    pages_one: "{{count}} page",
    pages_other: "{{count}} pages",
    notFound: "This book is not in the library any more.",
    backToLibrary: "Back to the library",
  },
  copies: {
    title: "Copies",
    add: "Add a copy",
    none: "There is no copy of this book in the household.",
    copy: "Copy",
    formats: {
      paperback: "Paperback",
      hardcover: "Hardcover",
      other: "Other",
    },
    format: "Format",
    unknownFormat: "Not specified",
    noLocation: "No location",
    onShelf: "On the shelf",
    lentTo: "Lent to {{name}} since {{date}}",
    move: "Move",
    moveTitle: "Move this copy",
    location: "Location",
    save: "Save",
    addTitle: "Add a copy",
    addSubmit: "Add copy",
    remove: "Remove",
    removeTitle: "Remove this copy?",
    removeLast:
      "It is the last copy, so the book leaves the library. If nobody has read or borrowed it, it is deleted.",
    removeOne: "The other copies stay in the library.",
    removeSubmit: "Remove copy",
    hasLoans: "This copy has been lent before, so it cannot be removed.",
  },
  details: {
    title: "Details",
    isbn: "ISBN",
    added: "Added",
    addedBy: "{{date}} by {{name}}",
    metadata: "Metadata",
    manual: "Entered by hand",
    none: "None",
  },
  edit: {
    title: "Edit details",
    isbnTaken: "Another book already has this ISBN.",
    openOther: "Open that book",
  },
};

export default books;

declare module "../../i18n/types" {
  interface Namespaces {
    books: typeof books;
  }
}
