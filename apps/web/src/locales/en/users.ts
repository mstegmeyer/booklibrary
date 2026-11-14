const users = {
  title: "Users",
  subtitle: "Everyone in the household who can sign in",
  add: "Add user",
  addTitle: "Add a user",
  addSubmit: "Add user",
  emailTaken: "A user with this email already exists.",
  roles: { admin: "Admin", member: "Member" },
  added: "Added {{date}}",
  resetPassword: "Reset password",
  resetTitle: "New password for {{name}}",
  resetDone: "The password for {{name}} was changed.",
  newPassword: "New password",
  loadMore: "Load more",
};

export default users;

declare module "../../i18n/types" {
  interface Namespaces {
    users: typeof users;
  }
}
