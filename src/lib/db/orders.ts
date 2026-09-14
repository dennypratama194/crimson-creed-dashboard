import "server-only";

import { unstable_cache } from "next/cache";

import type {
  DistributionStatus,
  OrderStatus,
  PaymentStatus,
} from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { getMemberNames } from "@/lib/db/members";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { OrderListScope } from "@/lib/validation/order";

export type Order = Tables<"orders">;
export type OrderItem = Tables<"order_items">;
export type OrderTimelineEntry = Tables<"order_timeline">;

export const ORDER_PAGE_SIZE = 20;

const OPEN_STATUSES = ["PENDING", "PROCESSING"] as const;
const CLOSED_STATUSES = ["COMPLETED", "CANCELLED", "REJECTED"] as const;

/**
 * Orders visible to the current user. RLS restricts members to their own rows
 * and lets Super Admins see everything, so this one function backs both the
 * member list and (with `memberId`) the admin member-history view.
 */
export async function listOrders(options: {
  page?: number;
  scope?: OrderListScope;
  memberId?: string;
}): Promise<{ rows: Order[]; total: number; page: number; pageSize: number }> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = ORDER_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (options.memberId) query = query.eq("member_id", options.memberId);
  if (options.scope === "open") query = query.in("status", [...OPEN_STATUSES]);
  if (options.scope === "closed")
    query = query.in("status", [...CLOSED_STATUSES]);

  const { data, error, count } = await query.range(
    offset,
    offset + pageSize - 1,
  );
  if (error) throw error;

  return { rows: data ?? [], total: count ?? 0, page, pageSize };
}

/** The columns the admin orders table renders — also fed by the dashboard. */
export type AdminOrderListRow = Pick<
  Order,
  "id" | "order_number" | "created_at" | "total" | "status" | "paid_to_name"
> & { member_name: string };

/** Admin order list with the three status filters + order-number search. */
export async function listAdminOrders(options: {
  page?: number;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  distributionStatus?: DistributionStatus;
  search?: string;
}): Promise<{
  rows: AdminOrderListRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = ORDER_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  // Only what the table renders: order rows carry up to four 1000-char notes.
  let query = supabase
    .from("orders")
    .select(
      "id, order_number, member_id, created_at, total, status, paid_to_name",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (options.status) query = query.eq("status", options.status);
  if (options.paymentStatus)
    query = query.eq("payment_status", options.paymentStatus);
  if (options.distributionStatus)
    query = query.eq("distribution_status", options.distributionStatus);

  const search = options.search
    ?.replace(/[,()%*]/g, "")
    .trim()
    .slice(0, 40);
  if (search) query = query.ilike("order_number", `%${search}%`);

  const { data, error, count } = await query.range(
    offset,
    offset + pageSize - 1,
  );
  if (error) throw error;

  const rows = data ?? [];
  const names = await getMemberNames(rows.map((r) => r.member_id));

  return {
    rows: rows.map(({ member_id, ...r }) => ({
      ...r,
      member_name: names.get(member_id) ?? "Unknown member",
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export type OrderDetail = {
  order: Order;
  items: OrderItem[];
  timeline: OrderTimelineEntry[];
};

export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!order) return null;

  const [{ data: items }, { data: timeline }] = await Promise.all([
    supabase
      .from("order_items")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("order_timeline")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
  ]);

  return { order, items: items ?? [], timeline: timeline ?? [] };
}

export type OrderableItem = Pick<
  Tables<"items">,
  "id" | "name" | "category" | "unit" | "price" | "description" | "image_url"
>;

/** Bump this to drop the cached catalogue; item write actions call it. */
export const ORDERABLE_ITEMS_CACHE_TAG = "orderable-items";

/**
 * The member-facing catalogue is read on every visit to `/orders/new` by every
 * member, but only changes when a Super Admin edits an item — so it is cached
 * and invalidated on write (`revalidateTag(ORDERABLE_ITEMS_CACHE_TAG)` in the
 * item actions), with a 5-minute floor as a backstop.
 *
 * `unstable_cache` forbids `cookies()` in its scope, so this uses the
 * service-role client. The WHERE clause is exactly the set any active member is
 * allowed to see, so bypassing RLS here exposes nothing extra.
 */
const cachedOrderableItems = unstable_cache(
  async (): Promise<OrderableItem[]> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("items")
      .select("id, name, category, unit, price, description, image_url")
      .eq("stock_type", "CATALOGUE")
      .eq("active", true)
      .eq("orderable", true)
      .is("archived_at", null)
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
  ["orderable-items"],
  { tags: [ORDERABLE_ITEMS_CACHE_TAG], revalidate: 300 },
);

export async function getOrderableItems(): Promise<OrderableItem[]> {
  return cachedOrderableItems();
}

export type PaymentRecipient = { id: string; displayName: string };

/**
 * Active Super Admins a member can name as the recipient when reporting an
 * order payment. Backed by the `list_payment_recipients` RPC because RLS hides
 * other members' rows from a regular member.
 */
export async function listPaymentRecipients(): Promise<PaymentRecipient[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_payment_recipients");
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, displayName: r.display_name }));
}
