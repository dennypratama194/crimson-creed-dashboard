import "server-only";

import type {
  DistributionStatus,
  OrderStatus,
  PaymentStatus,
} from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { getMemberNames } from "@/lib/db/members";
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

export type AdminOrderRow = Order & { member_name: string };

/** Admin order list with the three status filters + order-number search. */
export async function listAdminOrders(options: {
  page?: number;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  distributionStatus?: DistributionStatus;
  search?: string;
}): Promise<{
  rows: AdminOrderRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = ORDER_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

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
    rows: rows.map((r) => ({
      ...r,
      member_name: names.get(r.member_id) ?? "Unknown member",
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

/** Orders that need a Super Admin's attention, for the admin dashboard. */
export async function getOrdersNeedingAttention(): Promise<{
  paymentsToVerify: number;
  toProcess: number;
  toDistribute: number;
}> {
  const supabase = await createClient();
  const [paymentsToVerify, toProcess, toDistribute] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("payment_status", "PAYMENT_SUBMITTED"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "PROCESSING")
      .eq("payment_status", "PAID")
      .eq("distribution_status", "NOT_DISTRIBUTED"),
  ]);
  return {
    paymentsToVerify: paymentsToVerify.count ?? 0,
    toProcess: toProcess.count ?? 0,
    toDistribute: toDistribute.count ?? 0,
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

export async function getOrderableItems(): Promise<OrderableItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, name, category, unit, price, description, image_url")
    .eq("active", true)
    .eq("orderable", true)
    .is("archived_at", null)
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Counts for the member dashboard (Phase 11 uses these too). */
export async function getMemberOrderSummary(): Promise<{
  open: number;
  completed: number;
}> {
  const supabase = await createClient();
  const [open, completed] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", [...OPEN_STATUSES]),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "COMPLETED"),
  ]);
  return { open: open.count ?? 0, completed: completed.count ?? 0 };
}
