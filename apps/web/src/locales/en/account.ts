const account = {
  title: "Account",
  subtitle: "Your name and password",
  nameTitle: "Name",
  nameSaved: "Your name was changed.",
  passwordTitle: "Password",
  passwordIntro: "Changing your password signs you out on your other devices.",
  currentPassword: "Current password",
  newPassword: "New password",
  wrongPassword: "The current password is incorrect.",
  passwordSaved: "Your password was changed.",
};

export default account;

declare module "../../i18n/types" {
  interface Namespaces {
    account: typeof account;
  }
}
