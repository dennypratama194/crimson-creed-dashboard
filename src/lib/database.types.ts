/**
 * Supabase schema types.
 *
 * Hand-authored to match supabase/migrations (there is no local Docker stack in
 * this environment). Once a hosted project is linked, regenerate with:
 *   npm run db:types
 * and keep this file in sync with the migrations until then.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ── enums ───────────────────────────────────────────────────────────────────
export type AppRole = "SUPER_ADMIN" | "MEMBER";
export type MemberRank = "BOSS" | "UNDER_BOSS" | "SECRETARY" | "B" | "SOLDIER";
export type MemberStatus = "ACTIVE" | "INACTIVE";
export type ItemCategory = "WEAPON" | "AMMO" | "VEST" | "PRODUCT" | "OTHER";
export type ItemUnit = "UNIT" | "ROUND" | "GRAM" | "KILOGRAM" | "PACK";
export type OrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "CANCELLED"
  | "REJECTED";
export type PaymentStatus =
  | "UNPAID"
  | "PAYMENT_SUBMITTED"
  | "PAID"
  | "PAYMENT_REJECTED";
export type DistributionStatus = "NOT_DISTRIBUTED" | "DISTRIBUTED";
export type MovementType =
  | "IN"
  | "OUT"
  | "ADJUSTMENT"
  | "PRODUCTION"
  | "ORDER"
  | "DISTRIBUTION"
  | "DEPOSIT"
  | "WITHDRAWAL";
export type ReferenceType =
  | "ORDER"
  | "ORDER_ITEM"
  | "ITEM"
  | "MEMBER"
  | "INVENTORY_ADJUSTMENT"
  | "MANUAL";
export type NotificationType =
  | "ORDER_CREATED"
  | "ORDER_PROCESSING"
  | "ORDER_COMPLETED"
  | "ORDER_CANCELLED"
  | "ORDER_REJECTED"
  | "PAYMENT_SUBMITTED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_REJECTED"
  | "DISTRIBUTION_READY"
  | "DISTRIBUTION_COMPLETED"
  | "LOW_STOCK";
export type AuditAction =
  | "MEMBER_CREATED"
  | "MEMBER_UPDATED"
  | "MEMBER_DEACTIVATED"
  | "MEMBER_REACTIVATED"
  | "MEMBER_PASSWORD_RESET"
  | "ITEM_CREATED"
  | "ITEM_UPDATED"
  | "ITEM_ARCHIVED"
  | "ORDER_CREATED"
  | "ORDER_STATUS_CHANGED"
  | "ORDER_CANCELLED"
  | "ORDER_REJECTED"
  | "PAYMENT_SUBMITTED"
  | "PAYMENT_VERIFIED"
  | "PAYMENT_REJECTED"
  | "DISTRIBUTION_RECORDED"
  | "INVENTORY_ADJUSTED"
  | "SETTINGS_UPDATED";

// ── row shapes ──────────────────────────────────────────────────────────────
type MemberRow = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  rank: MemberRank;
  role: AppRole;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
}

type ItemRow = {
  id: string;
  name: string;
  category: ItemCategory;
  description: string | null;
  sku: string | null;
  unit: ItemUnit;
  price: number;
  active: boolean;
  orderable: boolean;
  low_stock_threshold: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

type OrderRow = {
  id: string;
  order_number: string;
  member_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  distribution_status: DistributionStatus;
  subtotal: number;
  total: number;
  note: string | null;
  payment_note: string | null;
  distribution_note: string | null;
  cancel_reason: string | null;
  submitted_at: string;
  processing_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

type OrderItemRow = {
  id: string;
  order_id: string;
  item_id: string;
  item_name_snapshot: string;
  item_unit_snapshot: ItemUnit;
  unit_price_snapshot: number;
  quantity: number;
  line_total: number;
  created_at: string;
}

type InventoryRow = {
  item_id: string;
  current_quantity: number;
  updated_at: string;
}

type InventoryMovementRow = {
  id: string;
  item_id: string;
  quantity: number;
  movement_type: MovementType;
  reference_type: ReferenceType;
  reference_id: string | null;
  performed_by: string | null;
  notes: string | null;
  created_at: string;
}

type NotificationRow = {
  id: string;
  recipient_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  reference_type: ReferenceType | null;
  reference_id: string | null;
  read_at: string | null;
  created_at: string;
}

type OrderTimelineRow = {
  id: string;
  order_id: string;
  entry_type: string;
  description: string;
  actor_id: string | null;
  metadata: Json;
  created_at: string;
}

type ActivityLogRow = {
  id: string;
  actor_id: string | null;
  verb: string;
  summary: string;
  reference_type: ReferenceType | null;
  reference_id: string | null;
  metadata: Json;
  created_at: string;
}

type AuditLogRow = {
  id: string;
  actor_id: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  old_values: Json | null;
  new_values: Json | null;
  metadata: Json;
  created_at: string;
}

type OrganizationSettingsRow = {
  id: boolean;
  org_name: string;
  logo_url: string | null;
  updated_at: string;
  updated_by: string | null;
}

type TableShape<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      members: TableShape<
        MemberRow,
        {
          id?: string;
          user_id: string;
          username: string;
          display_name: string;
          rank?: MemberRank;
          role?: AppRole;
          status?: MemberStatus;
          created_at?: string;
          updated_at?: string;
        },
        Partial<MemberRow>
      >;
      items: TableShape<
        ItemRow,
        {
          id?: string;
          name: string;
          category: ItemCategory;
          description?: string | null;
          sku?: string | null;
          unit?: ItemUnit;
          price?: number;
          active?: boolean;
          orderable?: boolean;
          low_stock_threshold?: number;
          image_url?: string | null;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        },
        Partial<ItemRow>
      >;
      orders: TableShape<OrderRow, never, never>;
      order_items: TableShape<OrderItemRow, never, never>;
      inventory: TableShape<InventoryRow, never, never>;
      inventory_movements: TableShape<InventoryMovementRow, never, never>;
      notifications: TableShape<
        NotificationRow,
        never,
        { read_at?: string | null }
      >;
      order_timeline: TableShape<OrderTimelineRow, never, never>;
      activity_logs: TableShape<
        ActivityLogRow,
        {
          actor_id?: string | null;
          verb: string;
          summary: string;
          reference_type?: ReferenceType | null;
          reference_id?: string | null;
          metadata?: Json;
        },
        never
      >;
      audit_logs: TableShape<
        AuditLogRow,
        {
          actor_id?: string | null;
          action: AuditAction;
          entity_type: string;
          entity_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          metadata?: Json;
        },
        never
      >;
      organization_settings: TableShape<
        OrganizationSettingsRow,
        never,
        { org_name?: string; logo_url?: string | null; updated_by?: string | null }
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      create_order: {
        Args: { p_items: Json; p_note?: string | null };
        Returns: OrderRow;
      };
      submit_order_payment: { Args: { p_order_id: string }; Returns: OrderRow };
      verify_order_payment: {
        Args: { p_order_id: string; p_note?: string | null };
        Returns: OrderRow;
      };
      reject_order_payment: {
        Args: { p_order_id: string; p_reason: string };
        Returns: OrderRow;
      };
      start_order_processing: {
        Args: { p_order_id: string };
        Returns: OrderRow;
      };
      record_order_distribution: {
        Args: { p_order_id: string; p_note?: string | null };
        Returns: OrderRow;
      };
      complete_order: { Args: { p_order_id: string }; Returns: OrderRow };
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string | null };
        Returns: OrderRow;
      };
      reject_order: {
        Args: { p_order_id: string; p_reason: string };
        Returns: OrderRow;
      };
      record_inventory_movement: {
        Args: {
          p_item_id: string;
          p_movement_type: MovementType;
          p_quantity: number;
          p_notes?: string | null;
        };
        Returns: InventoryRow;
      };
      adjust_inventory: {
        Args: {
          p_item_id: string;
          p_target_quantity: number;
          p_notes?: string | null;
        };
        Returns: InventoryRow;
      };
      create_item: {
        Args: {
          p_name: string;
          p_category: ItemCategory;
          p_unit: ItemUnit;
          p_price: number;
          p_description?: string | null;
          p_sku?: string | null;
          p_low_stock_threshold?: number;
          p_orderable?: boolean;
          p_active?: boolean;
          p_image_url?: string | null;
        };
        Returns: ItemRow;
      };
      update_item: {
        Args: {
          p_item_id: string;
          p_name: string;
          p_category: ItemCategory;
          p_unit: ItemUnit;
          p_price: number;
          p_description?: string | null;
          p_sku?: string | null;
          p_low_stock_threshold?: number;
          p_orderable?: boolean;
          p_active?: boolean;
          p_image_url?: string | null;
        };
        Returns: ItemRow;
      };
      archive_item: { Args: { p_item_id: string }; Returns: ItemRow };
      restore_item: { Args: { p_item_id: string }; Returns: ItemRow };
      update_organization_settings: {
        Args: { p_org_name: string; p_logo_url?: string | null };
        Returns: OrganizationSettingsRow;
      };
    };
    Enums: {
      app_role: AppRole;
      member_rank: MemberRank;
      member_status: MemberStatus;
      item_category: ItemCategory;
      item_unit: ItemUnit;
      order_status: OrderStatus;
      payment_status: PaymentStatus;
      distribution_status: DistributionStatus;
      movement_type: MovementType;
      reference_type: ReferenceType;
      notification_type: NotificationType;
      audit_action: AuditAction;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

// ── convenience aliases ─────────────────────────────────────────────────────
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
