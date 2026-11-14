const common = {
  appName: "Book Library",
  nav: {
    main: "Main",
    library: "Library",
    reading: "Reading",
    statistics: "Statistics",
    loans: "Loans",
    locations: "Locations",
    addBook: "Add book",
  },
  account: {
    menu: "Account: {{name}}",
    language: "Language",
    users: "Users",
    changeServer: "Change server",
    signOut: "Sign out",
  },
  pages: {
    empty: "Nothing here yet.",
  },
  form: {
    name: "Name",
    email: "Email",
    password: "Password",
    passwordHint: "At least 8 characters",
    cancel: "Cancel",
    save: "Save",
  },
  errors: {
    generic: "Something went wrong. Please try again.",
    network: "The server cannot be reached.",
  },
};

export default common;

declare module "../../i18n/types" {
  interface Namespaces {
    common: typeof common;
  }
}
