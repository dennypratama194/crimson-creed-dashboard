import {
  Ban,
  BellRing,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  FlaskConical,
  PackageCheck,
  PackageX,
  Recycle,
  TriangleAlert,
  Truck,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { NotificationType } from "@/lib/constants/enums";
import type { Tone } from "@/lib/constants/status-config";

export const NOTIFICATION_CONFIG: Record<
  NotificationType,
  { icon: LucideIcon; tone: Tone }
> = {
  ORDER_CREATED: { icon: BellRing, tone: "info" },
  ORDER_PROCESSING: { icon: BellRing, tone: "info" },
  ORDER_COMPLETED: { icon: CheckCircle2, tone: "success" },
  ORDER_CANCELLED: { icon: Ban, tone: "gray" },
  ORDER_REJECTED: { icon: XCircle, tone: "error" },
  PAYMENT_SUBMITTED: { icon: CircleDollarSign, tone: "warning" },
  PAYMENT_CONFIRMED: { icon: CheckCircle2, tone: "success" },
  PAYMENT_REJECTED: { icon: XCircle, tone: "error" },
  DISTRIBUTION_READY: { icon: PackageCheck, tone: "info" },
  DISTRIBUTION_COMPLETED: { icon: Truck, tone: "success" },
  LOW_STOCK: { icon: TriangleAlert, tone: "warning" },
  PRODUCTION_LOG_SUBMITTED: { icon: FlaskConical, tone: "info" },
  PRODUCTION_LOG_APPROVED: { icon: CheckCircle2, tone: "success" },
  PRODUCTION_LOG_REJECTED: { icon: XCircle, tone: "error" },
  PAYROLL_FINALIZED: { icon: Wallet, tone: "info" },
  PAYROLL_PAID: { icon: Banknote, tone: "success" },
  SUBMISSION_SUBMITTED: { icon: Recycle, tone: "info" },
  SUBMISSION_CONFIRMED: { icon: CheckCircle2, tone: "success" },
  SUBMISSION_REJECTED: { icon: XCircle, tone: "error" },
  DISTRIBUTION_ISSUED: { icon: PackageCheck, tone: "warning" },
  DISTRIBUTION_SETTLED: { icon: CheckCircle2, tone: "success" },
  DISTRIBUTION_REVERSED: { icon: Ban, tone: "gray" },
  PRODUCTION_ASSIGNED: { icon: FlaskConical, tone: "info" },
  PRODUCTION_ASSIGNMENT_PAID: { icon: Banknote, tone: "success" },
};

export const NOTIFICATION_FALLBACK = { icon: PackageX, tone: "gray" as Tone };
