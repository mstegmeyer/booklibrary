const auth = {
  setup: {
    title: "Set up your library",
    intro:
      "Create the administrator account. You can add household members afterwards.",
    submit: "Create account",
  },
  login: {
    title: "Sign in",
    intro: "Sign in to your household library.",
    submit: "Sign in",
    invalid: "The email or password is incorrect.",
  },
};

export default auth;

declare module "../../i18n/types" {
  interface Namespaces {
    auth: typeof auth;
  }
}
