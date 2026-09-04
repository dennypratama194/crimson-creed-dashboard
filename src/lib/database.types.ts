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
export type MemberRank =
  | "BOSS"
  | "UNDER_BOSS"
  | "SECRETARY"
  | "CAPOREGIME"
  | "SOLDIER";
export type MemberStatus = "ACTIVE" | "INACTIVE";
export type ItemCategory =
  | "WEAPON"
  | "AMMO"
  | "VEST"
  | "PRODUCT"
  | "ATTACHMENT"
  | "TOOL"
  | "OTHER";
export type ItemUnit = "UNIT" | "ROUND" | "BOX" | "GRAM" | "KILOGRAM" | "PACK";
export type StockType =
  | "CATALOGUE"
  | "RAW_MATERIAL"
  | "TOOL"
  | "SEIZED"
  | "OTHER";
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
export type ProductionLogStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";
export type PayrollRunStatus = "DRAFT" | "FINALIZED" | "PAID";
export type MemberSubmissionStatus = "PENDING" | "CONFIRMED" | "REJECTED";
export type CashDirection = "IN" | "OUT";
export type CashEntrySource = "MANUAL" | "ADJUSTMENT" | "ORDER" | "PAYROLL_RUN";
export type CashCategory =
  | "SALES_REVENUE"
  | "CAPITAL_INJECTION"
  | "OTHER_INCOME"
  | "PAYROLL"
  | "INVENTORY_PURCHASE"
  | "OPERATING_EXPENSE"
  | "WITHDRAWAL"
  | "OTHER_EXPENSE";
export type MovementType =
  | "IN"
  | "OUT"
  | "ADJUSTMENT"
  | "PRODUCTION"
  | "ORDER"
  | "DISTRIBUTION"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "SUBMISSION";
export type ReferenceType =
  | "ORDER"
  | "ORDER_ITEM"
  | "ITEM"
  | "MEMBER"
  | "INVENTORY_ADJUSTMENT"
  | "MANUAL"
  | "PRODUCTION_LOG"
  | "PAYROLL_RUN"
  | "CASH_ENTRY"
  | "SUPPLIER"
  | "SUBMISSION";
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
  | "LOW_STOCK"
  | "PRODUCTION_LOG_SUBMITTED"
  | "PRODUCTION_LOG_APPROVED"
  | "PRODUCTION_LOG_REJECTED"
  | "PAYROLL_FINALIZED"
  | "PAYROLL_PAID"
  | "SUBMISSION_SUBMITTED"
  | "SUBMISSION_CONFIRMED"
  | "SUBMISSION_REJECTED";
export type AuditAction =
  | "MEMBER_CREATED"
  | "MEMBER_UPDATED"
  | "MEMBER_DEACTIVATED"
  | "MEMBER_REACTIVATED"
  | "MEMBER_DELETED"
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
  | "SETTINGS_UPDATED"
  | "PRODUCTION_RATE_SET"
  | "PRODUCTION_LOG_SUBMITTED"
  | "PRODUCTION_LOG_REVIEWED"
  | "PRODUCTION_LOG_CANCELLED"
  | "PAYROLL_RUN_CREATED"
  | "PAYROLL_RUN_FINALIZED"
  | "PAYROLL_RUN_PAID"
  | "CASH_ENTRY_RECORDED"
  | "CASH_ENTRY_REVERSED"
  | "SUPPLIER_CREATED"
  | "SUPPLIER_UPDATED"
  | "SUPPLIER_ARCHIVED"
  | "SUPPLIER_ITEM_SET"
  | "SUPPLIER_ITEM_REMOVED"
  | "SUBMISSION_SUBMITTED"
  | "SUBMISSION_CONFIRMED"
  | "SUBMISSION_REJECTED"
  | "SUBMISSION_TARGETS_SET";

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
  stock_type: StockType;
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

type ProductionRateRow = {
  item_id: string;
  unit_rate: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

type ProductionLogRow = {
  id: string;
  member_id: string;
  item_id: string;
  item_name_snapshot: string;
  item_unit_snapshot: ItemUnit;
  quantity: number;
  unit_rate_snapshot: number;
  payout_amount: number;
  status: ProductionLogStatus;
  note: string | null;
  occurred_at: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  payroll_run_id: string | null;
  created_at: string;
  updated_at: string;
}

type PayrollRunRow = {
  id: string;
  run_number: string;
  period_start: string;
  period_end: string;
  status: PayrollRunStatus;
  total_amount: number;
  note: string | null;
  created_by: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

type PayrollRunLineRow = {
  id: string;
  payroll_run_id: string;
  member_id: string;
  member_name_snapshot: string;
  log_count: number;
  gross_amount: number;
  created_at: string;
}

type CashAccountRow = {
  id: boolean;
  balance: number;
  updated_at: string;
}

type CashEntryRow = {
  id: string;
  entry_number: string;
  direction: CashDirection;
  amount: number;
  category: CashCategory;
  source: CashEntrySource;
  balance_after: number;
  reference_type: ReferenceType | null;
  reference_id: string | null;
  reverses_entry_id: string | null;
  note: string | null;
  occurred_at: string;
  handled_by: string | null;
  created_by: string | null;
  created_at: string;
}

type SupplierRow = {
  id: string;
  name: string;
  contact: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

type SupplierItemRow = {
  id: string;
  supplier_id: string;
  item_id: string;
  buy_price: number;
  sell_price: number | null;
  max_quantity: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

type SubmissionMaterialTypeRow = {
  id: string;
  code: string;
  name: string;
  unit: ItemUnit;
  inventory_item_id: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

type SubmissionPeriodRow = {
  id: string;
  period_month: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

type SubmissionPeriodTargetRow = {
  period_id: string;
  material_type_id: string;
  target_quantity: number;
  updated_by: string | null;
  updated_at: string;
}

type MemberSubmissionRow = {
  id: string;
  period_id: string;
  member_id: string;
  status: MemberSubmissionStatus;
  note: string | null;
  submitted_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

type MemberSubmissionLineRow = {
  id: string;
  member_submission_id: string;
  material_type_id: string;
  name_snapshot: string;
  unit_snapshot: ItemUnit;
  quantity: number;
  created_at: string;
  updated_at: string;
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
          stock_type?: StockType;
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
      production_rates: TableShape<ProductionRateRow, never, never>;
      production_logs: TableShape<ProductionLogRow, never, never>;
      payroll_runs: TableShape<PayrollRunRow, never, never>;
      payroll_run_lines: TableShape<PayrollRunLineRow, never, never>;
      cash_account: TableShape<CashAccountRow, never, never>;
      cash_entries: TableShape<CashEntryRow, never, never>;
      suppliers: TableShape<
        SupplierRow,
        {
          id?: string;
          name: string;
          contact?: string | null;
          notes?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        },
        Partial<SupplierRow>
      >;
      supplier_items: TableShape<
        SupplierItemRow,
        {
          id?: string;
          supplier_id: string;
          item_id: string;
          buy_price?: number;
          sell_price?: number | null;
          max_quantity?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        },
        Partial<SupplierItemRow>
      >;
      submission_material_types: TableShape<
        SubmissionMaterialTypeRow,
        never,
        never
      >;
      submission_periods: TableShape<SubmissionPeriodRow, never, never>;
      submission_period_targets: TableShape<
        SubmissionPeriodTargetRow,
        never,
        never
      >;
      member_submissions: TableShape<MemberSubmissionRow, never, never>;
      member_submission_lines: TableShape<MemberSubmissionLineRow, never, never>;
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
          p_stock_type?: StockType;
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
          p_stock_type?: StockType;
        };
        Returns: ItemRow;
      };
      archive_item: { Args: { p_item_id: string }; Returns: ItemRow };
      restore_item: { Args: { p_item_id: string }; Returns: ItemRow };
      create_supplier: {
        Args: {
          p_name: string;
          p_contact?: string | null;
          p_notes?: string | null;
          p_active?: boolean;
        };
        Returns: SupplierRow;
      };
      update_supplier: {
        Args: {
          p_supplier_id: string;
          p_name: string;
          p_contact?: string | null;
          p_notes?: string | null;
          p_active?: boolean;
        };
        Returns: SupplierRow;
      };
      archive_supplier: {
        Args: { p_supplier_id: string };
        Returns: SupplierRow;
      };
      restore_supplier: {
        Args: { p_supplier_id: string };
        Returns: SupplierRow;
      };
      set_supplier_item: {
        Args: {
          p_supplier_id: string;
          p_item_id: string;
          p_buy_price?: number;
          p_sell_price?: number | null;
          p_max_quantity?: number | null;
          p_active?: boolean;
        };
        Returns: SupplierItemRow;
      };
      remove_supplier_item: {
        Args: { p_supplier_item_id: string };
        Returns: undefined;
      };
      update_organization_settings: {
        Args: { p_org_name: string; p_logo_url?: string | null };
        Returns: OrganizationSettingsRow;
      };
      set_production_rate: {
        Args: { p_item_id: string; p_unit_rate: number };
        Returns: ProductionRateRow;
      };
      submit_production_log: {
        Args: {
          p_item_id: string;
          p_quantity: number;
          p_occurred_at?: string | null;
          p_note?: string | null;
        };
        Returns: ProductionLogRow;
      };
      review_production_log: {
        Args: { p_log_id: string; p_approve: boolean; p_note?: string | null };
        Returns: ProductionLogRow;
      };
      cancel_production_log: {
        Args: { p_log_id: string };
        Returns: ProductionLogRow;
      };
      create_payroll_run: {
        Args: {
          p_period_start: string;
          p_period_end: string;
          p_note?: string | null;
        };
        Returns: PayrollRunRow;
      };
      finalize_payroll_run: {
        Args: { p_run_id: string };
        Returns: PayrollRunRow;
      };
      mark_payroll_run_paid: {
        Args: { p_run_id: string };
        Returns: PayrollRunRow;
      };
      record_cash_entry: {
        Args: {
          p_direction: CashDirection;
          p_amount: number;
          p_category: CashCategory;
          p_occurred_at?: string | null;
          p_note?: string | null;
          p_allow_negative?: boolean;
          p_handled_by?: string | null;
        };
        Returns: CashEntryRow;
      };
      reverse_cash_entry: {
        Args: { p_entry_id: string; p_reason: string };
        Returns: CashEntryRow;
      };
      set_submission_targets: {
        Args: { p_period_month: string; p_targets: Json };
        Returns: SubmissionPeriodRow;
      };
      submit_material_submission: {
        Args: { p_lines: Json; p_note?: string | null };
        Returns: MemberSubmissionRow;
      };
      confirm_member_submission: {
        Args: {
          p_submission_id: string;
          p_lines?: Json | null;
          p_note?: string | null;
        };
        Returns: MemberSubmissionRow;
      };
      reject_member_submission: {
        Args: { p_submission_id: string; p_reason: string };
        Returns: MemberSubmissionRow;
      };
      hit_auth_throttle: {
        Args: {
          p_key: string;
          p_limit: number;
          p_window_seconds: number;
          p_block_seconds: number;
        };
        Returns: number;
      };
      clear_auth_throttle: { Args: { p_key: string }; Returns: undefined };
    };
    Enums: {
      app_role: AppRole;
      member_rank: MemberRank;
      member_status: MemberStatus;
      item_category: ItemCategory;
      item_unit: ItemUnit;
      stock_type: StockType;
      order_status: OrderStatus;
      payment_status: PaymentStatus;
      distribution_status: DistributionStatus;
      production_log_status: ProductionLogStatus;
      payroll_run_status: PayrollRunStatus;
      member_submission_status: MemberSubmissionStatus;
      cash_direction: CashDirection;
      cash_entry_source: CashEntrySource;
      cash_category: CashCategory;
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
