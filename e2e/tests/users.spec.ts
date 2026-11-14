import type { Page } from "@playwright/test";
import {
  createMember,
  expect,
  openAccountMenu,
  setupAdmin,
  test,
} from "../fixtures.ts";

const row = (page: Page, email: string) =>
  page.getByRole("listitem").filter({ hasText: email });

test("the admin adds a member who can sign in but not manage users", async ({
  page,
}) => {
  await setupAdmin(page);
  await page.goto("/library");
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Users" }).click();
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

  await page.getByRole("button", { name: "Add user" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a user" });
  await dialog.getByLabel("Name").fill("Ben");
  await dialog.getByLabel("Email").fill("ben@example.com");
  await dialog.getByLabel("Password").fill("password123");
  await dialog.getByRole("button", { name: "Add user" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("ben@example.com")).toBeVisible();

  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill("ben@example.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/library$/);

  await openAccountMenu(page);
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Users" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/users");
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
});

test("resetting a member's password signs the member out", async ({
  page,
  browser,
  baseURL,
}) => {
  await setupAdmin(page);
  const member = await createMember(page);
  const memberContext = await browser.newContext({ baseURL });
  const memberPage = await memberContext.newPage();
  await memberPage.goto("/login");
  await memberPage.getByLabel("Email").fill(member.email);
  await memberPage.getByLabel("Password").fill(member.password);
  await memberPage.getByRole("button", { name: "Sign in" }).click();
  await expect(memberPage).toHaveURL(/\/library$/);

  await page.goto("/users");
  await row(page, member.email)
    .getByRole("button", { name: "Reset password" })
    .click();
  const dialog = page.getByRole("dialog", { name: "New password for Ben" });
  await expect(dialog).toContainText("Ben will be signed out on all devices.");
  await dialog.getByLabel("New password").fill("another-password");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "The password for Ben was changed.",
  );

  await memberPage.reload();
  await expect(memberPage).toHaveURL(/\/login$/);
  await memberContext.close();
});

test("the admin makes a member an admin and takes the role away again", async ({
  page,
}) => {
  await setupAdmin(page);
  const member = await createMember(page);
  await page.goto("/users");
  const ben = row(page, member.email);
  await expect(ben).toContainText("Member");

  await ben.getByRole("button", { name: "Make admin" }).click();
  let dialog = page.getByRole("dialog", { name: "Make Ben an admin?" });
  await dialog.getByRole("button", { name: "Make admin" }).click();
  await expect(dialog).toBeHidden();
  await expect(ben).toContainText("Admin");

  await ben.getByRole("button", { name: "Remove admin role" }).click();
  dialog = page.getByRole("dialog", {
    name: "Remove the admin role from Ben?",
  });
  await dialog.getByRole("button", { name: "Remove admin role" }).click();
  await expect(dialog).toBeHidden();
  await expect(ben).toContainText("Member");
});

test("the admin removes a member after confirming", async ({ page }) => {
  await setupAdmin(page);
  const member = await createMember(page);
  await page.goto("/users");
  await expect(row(page, "mara@example.com").getByRole("button")).toHaveCount(
    0,
  );

  await row(page, member.email).getByRole("button", { name: "Remove" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove Ben?" });
  await expect(dialog).toContainText(
    "their reading history will be deleted. The books and copies they added stay in the library.",
  );
  await dialog.getByRole("button", { name: "Cancel" }).first().click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(member.email)).toBeVisible();

  await row(page, member.email).getByRole("button", { name: "Remove" }).click();
  await dialog.getByRole("button", { name: "Remove user" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(member.email)).toHaveCount(0);

  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.getByLabel("Email").fill(member.email);
  await page.getByLabel("Password").fill(member.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The email or password is incorrect.",
  );
});
