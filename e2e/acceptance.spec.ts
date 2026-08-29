import { expect, test } from "@playwright/test";

import { confirmDialog, signIn, signOut } from "./helpers";

/**
 * PRD §38 — the primary V1 acceptance test.
 *
 * A member places an order; a Super Admin verifies payment, processes it,
 * records distribution, and completes it. Requires a hosted Supabase project
 * with migrations pushed and `npm run db:seed` run first (see e2e/README.md).
 * The seed prints the credentials used below.
 */

const MEMBER = {
  username: "sable_ruiz",
  password: "Crimson#sable1",
};
const ADMIN = {
  username: "vincent_crane",
  password: "Crimson#vincent1",
};

test("full roleplay order lifecycle", async ({ page }) => {
  // ── member places an order ────────────────────────────────────────────
  await signIn(page, MEMBER.username, MEMBER.password);
  await page.goto("/orders/new");

  await page.getByLabel("Add an item").click();
  await page.getByRole("option").first().click();
  await page.getByLabel(/Quantity for/).fill("2");

  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]+$/);

  const orderUrl = page.url();
  const orderNumber = (await page
    .getByRole("heading")
    .first()
    .textContent())!.trim();

  await expect(page.getByText("Pending")).toBeVisible();
  await expect(page.getByText("Unpaid")).toBeVisible();

  // member reports payment
  await page.getByRole("button", { name: "I've paid" }).click();
  await confirmDialog(page, /I've paid/);
  await expect(page.getByText("Payment submitted")).toBeVisible();

  await signOut(page);

  // ── admin drives the workflow ─────────────────────────────────────────
  await signIn(page, ADMIN.username, ADMIN.password);
  await page.goto("/admin/orders");
  await page.getByRole("link", { name: orderNumber }).click();
  await page.waitForURL(/\/admin\/orders\/[0-9a-f-]+$/);

  await page.getByRole("button", { name: "Verify payment" }).click();
  await confirmDialog(page, "Mark as paid");
  await expect(page.getByText("Paid")).toBeVisible();

  await page.getByRole("button", { name: "Start processing" }).click();
  await confirmDialog(page, "Start processing");
  await expect(page.getByText("Processing")).toBeVisible();

  await page.getByRole("button", { name: "Record distribution" }).click();
  await confirmDialog(page, "Mark distributed");
  await expect(page.getByText("Distributed")).toBeVisible();

  await page.getByRole("button", { name: "Complete order" }).click();
  await confirmDialog(page, "Complete order");
  await expect(page.getByText("Completed")).toBeVisible();

  // ── member sees the finished order ───────────────────────────────────
  await signOut(page);
  await signIn(page, MEMBER.username, MEMBER.password);
  await page.goto(orderUrl);
  await expect(page.getByText("Completed")).toBeVisible();
  await expect(page.getByText("Paid")).toBeVisible();
  await expect(page.getByText("Distributed")).toBeVisible();
});

test("a member cannot reach admin routes", async ({ page }) => {
  await signIn(page, MEMBER.username, MEMBER.password);
  await page.goto("/admin/members");
  await expect(page).toHaveURL(/\/dashboard$/);
});
