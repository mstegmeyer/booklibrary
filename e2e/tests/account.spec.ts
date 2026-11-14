import {
  admin,
  expect,
  openAccountMenu,
  setupAdmin,
  test,
} from "../fixtures.ts";

test("changing one's own name and password", async ({
  page,
  browser,
  baseURL,
}) => {
  await setupAdmin(page);
  const otherDevice = await browser.newContext({ baseURL });
  const otherPage = await otherDevice.newPage();
  await otherPage.goto("/login");
  await otherPage.getByLabel("Email").fill(admin.email);
  await otherPage.getByLabel("Password").fill(admin.password);
  await otherPage.getByRole("button", { name: "Sign in" }).click();
  await expect(otherPage).toHaveURL(/\/library$/);

  await page.goto("/library");
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Account" }).click();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();

  const name = page.getByRole("region", { name: "Name" });
  await name.getByLabel("Name").fill("Mara K.");
  await name.getByRole("button", { name: "Save" }).click();
  await expect(name.getByRole("status")).toHaveText("Your name was changed.");
  await expect(
    page.getByRole("button", { name: "Account: Mara K." }),
  ).toBeVisible();

  const password = page.getByRole("region", { name: "Password" });
  await password.getByLabel("Current password").fill("wrong-password");
  await password.getByLabel("New password").fill("another-password");
  await password.getByRole("button", { name: "Save" }).click();
  await expect(password.getByRole("alert")).toHaveText(
    "The current password is incorrect.",
  );

  await password.getByLabel("Current password").fill(admin.password);
  await password.getByLabel("New password").fill("another-password");
  await password.getByRole("button", { name: "Save" }).click();
  await expect(password.getByRole("status")).toHaveText(
    "Your password was changed.",
  );

  await page.reload();
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await otherPage.reload();
  await expect(otherPage).toHaveURL(/\/login$/);
  await otherPage.getByLabel("Email").fill(admin.email);
  await otherPage.getByLabel("Password").fill("another-password");
  await otherPage.getByRole("button", { name: "Sign in" }).click();
  await expect(otherPage).toHaveURL(/\/library$/);
  await otherDevice.close();
});
