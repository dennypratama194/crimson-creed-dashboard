import { expect, test } from "@playwright/test";

/**
 * Access boundaries that need a real Supabase project + `npm run db:seed`
 * (see e2e/README.md). Credentials come from the seed script.
 */

test("a signed-out visitor is sent to /login, keeping the target", async ({
  page,
}) => {
  await page.goto("/admin/cash");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fcash$/);
});

test("an inactive member cannot sign in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("hugo_marsh");
  await page.getByLabel("Password").fill("Crimson#hugo1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByText("This account is inactive. Contact a Super Admin."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
