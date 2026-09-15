import { expect, test } from "@playwright/test";

import { confirmDialog, signIn, signOut } from "./helpers";

/**
 * PRD §38 — the primary V1 acceptance test.
 *
 * A member places an order, reports the in-game payment TO A NAMED SUPER ADMIN,
 * and a Super Admin verifies it, processes it, records distribution and
 * completes it. Requires a hosted throwaway Supabase project with migrations
 * pushed and `npm run db:seed` run first (see e2e/README.md). Every name below
 * comes from that seed — never from production.
 *
 * The "Pay to" step is not optional dressing: `submit_order_payment` refuses a
 * null recipient (migration 0055), and the recipient name is SNAPSHOTTED onto
 * the order as `paid_to_name`, so this spec also guards that snapshot.
 */

const MEMBER = {
  username: "sable_ruiz",
  password: "Crimson#sable1",
};
const ADMIN = {
  username: "vincent_crane",
  password: "Crimson#vincent1",
  displayName: "Vincent Crane",
};
/** A second seeded Super Admin, to prove the picker is a real choice. */
const OTHER_ADMIN = { displayName: "Marlow Dietrich" };

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

  // `exact` throughout: once a recipient is chosen the page also carries
  // "Paid to <name>", and a substring match on "Paid" would hit both and fail
  // Playwright's strict mode.
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  await expect(page.getByText("Unpaid", { exact: true })).toBeVisible();

  // ── member reports payment, naming who they paid ──────────────────────
  await page.getByRole("button", { name: "I've paid" }).click();

  const payDialog = page.getByRole("dialog");
  await expect(payDialog).toBeVisible();

  // The recipient picker is required: the server refuses a null `paid_to`, so
  // confirming without a choice must not submit anything.
  await payDialog.getByRole("button", { name: /I've paid/ }).click();
  await expect(payDialog.getByText("Choose who you paid.")).toBeVisible();
  await expect(payDialog).toBeVisible();

  // Both seeded Super Admins are offered; the member picks one.
  await payDialog.getByRole("combobox", { name: "Pay to" }).click();
  await expect(
    page.getByRole("option", { name: OTHER_ADMIN.displayName }),
  ).toBeVisible();
  await page.getByRole("option", { name: ADMIN.displayName }).click();

  await payDialog.getByRole("button", { name: /I've paid/ }).click();
  await expect(payDialog).toBeHidden();

  // The snapshot is on the order, not merely in the dialog that set it.
  await expect(
    page.getByText("Payment submitted", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(`Paid to ${ADMIN.displayName}`)).toBeVisible();

  await signOut(page);

  // ── admin drives the workflow ─────────────────────────────────────────
  await signIn(page, ADMIN.username, ADMIN.password);
  await page.goto("/admin/orders");
  await page.getByRole("link", { name: orderNumber }).click();
  await page.waitForURL(/\/admin\/orders\/[0-9a-f-]+$/);

  // The admin verifying can see who the member says they paid. (The name
  // itself also appears in the account menu — this asserts the row label, which
  // only renders when paid_to_name is set.)
  await expect(page.getByText("Paid to", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Verify payment" }).click();
  await confirmDialog(page, "Mark as paid");
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Start processing" }).click();
  await confirmDialog(page, "Start processing");
  await expect(page.getByText("Processing", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Record distribution" }).click();
  await confirmDialog(page, "Mark distributed");
  await expect(page.getByText("Distributed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Complete order" }).click();
  await confirmDialog(page, "Complete order");
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();

  // ── member sees the finished order ───────────────────────────────────
  await signOut(page);
  await signIn(page, MEMBER.username, MEMBER.password);
  await page.goto(orderUrl);
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  await expect(page.getByText("Distributed", { exact: true })).toBeVisible();
  // The recipient snapshot survives the whole workflow.
  await expect(page.getByText(`Paid to ${ADMIN.displayName}`)).toBeVisible();
});

test("a member cannot reach admin routes", async ({ page }) => {
  await signIn(page, MEMBER.username, MEMBER.password);
  await page.goto("/admin/members");
  await expect(page).toHaveURL(/\/dashboard$/);
});
