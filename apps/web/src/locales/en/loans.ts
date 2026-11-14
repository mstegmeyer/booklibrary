const loans = {
  title: "Loans",
  summary: {
    lent_one: "{{count}} book lent out",
    lent_other: "{{count}} books lent out",
    borrowed: "{{count}} borrowed",
  },
  lendBook: "Lend a book",
  addBorrowed: "Add a borrowed book",
  add: "Add",
  sections: { lent: "Lent out", borrowed: "Borrowed", returned: "Returned" },
  showReturned: "Returned loans",
  empty: {
    lent: "Nothing is lent out.",
    borrowed: "You have not borrowed any books.",
    returned: "No loan has been returned yet.",
  },
  borrowedNote:
    "Borrowed books are not part of your library. They stay in your reading history after you give them back.",
  columns: {
    book: "Book",
    lentTo: "Lent to",
    borrowedFrom: "Borrowed from",
    since: "Since",
    goesBackTo: "Goes back to",
    loan: "Loan",
    period: "Period",
    days: "Days",
    actions: "Actions",
  },
  days_one: "{{count}} day",
  days_other: "{{count}} days",
  lentToName: "Lent to {{name}}",
  borrowedFromName: "Borrowed from {{name}}",
  fromName: "From {{name}}",
  period: "{{start}} – {{end}}",
  noLocation: "No location",
  loadMore: "Load more",
  markReturned: "Mark returned",
  returnedShort: "Returned",
  return: {
    title: "Mark as returned",
    returnedOn: "Returned on",
  },
  lend: {
    title: "Lend this book",
    to: "Lend to",
    copy: "Copy",
    lentOn: "Lent on",
    note: "Note (optional)",
    submit: "Lend",
    submitTo: "Lend to {{name}}",
    copyLent: "This copy is already lent out.",
  },
  pick: {
    title: "Lend a book",
    search: "Search the library",
    placeholder: "Title, author or ISBN",
    noMatches: "No book on the shelf matches.",
    change: "Choose another book",
  },
  menu: {
    label: "More for {{title}}",
    edit: "Edit loan",
    delete: "Delete loan",
  },
  edit: {
    title: "Edit loan",
    startedOn: "Started on",
    endedOn: "Returned on",
    note: "Note",
    save: "Save",
  },
  delete: {
    title: "Delete this loan?",
    text: "The loan disappears from the history too. Use this for a loan entered by mistake.",
    submit: "Delete loan",
  },
  endBeforeStart: "A loan cannot end before it starts.",
};

export default loans;

declare module "../../i18n/types" {
  interface Namespaces {
    loans: typeof loans;
  }
}
