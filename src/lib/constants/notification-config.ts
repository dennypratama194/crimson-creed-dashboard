import {
  Ban,
  BellRing,
  CheckCircle2,
  CircleDollarSign,
  PackageCheck,
  PackageX,
  TriangleAlert,
  Truck,
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
};

export const NOTIFICATION_FALLBACK = { icon: PackageX, tone: "gray" as Tone };
