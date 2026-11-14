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
  resetSignsOut: "{{name}} will be signed out on all devices.",
  makeAdmin: "Make admin",
  makeAdminTitle: "Make {{name}} an admin?",
  makeAdminText:
    "{{name}} will be able to manage users: add them, reset their passwords, change their roles and remove them.",
  removeAdmin: "Remove admin role",
  removeAdminTitle: "Remove the admin role from {{name}}?",
  removeAdminText:
    "{{name}} will stay a member and can no longer manage users.",
  lastAdmin: "The last admin must stay an admin.",
  remove: "Remove",
  removeTitle: "Remove {{name}}?",
  removeText:
    "{{name}} will no longer be able to sign in, and their reading history will be deleted. The books and copies they added stay in the library. This cannot be undone.",
  removeSubmit: "Remove user",
  loadMore: "Load more",
};

export default users;

declare module "../../i18n/types" {
  interface Namespaces {
    users: typeof users;
  }
}
