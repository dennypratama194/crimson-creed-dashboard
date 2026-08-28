import type {
  DistributionStatus,
  OrderStatus,
  PaymentStatus,
} from "@/lib/constants/enums";
import {
  DISTRIBUTION_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants/labels";
import {
  DISTRIBUTION_STATUS_TONE,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_TONE,
} from "@/lib/constants/status-config";
import { Badge } from "@/components/ui/badge";

/**
 * Renders a status enum as a toned badge with its human label. Uses text (never
 * colour alone) so it satisfies the a11y requirement in PRD §28.
 */

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={PAYMENT_STATUS_TONE[status]}>
      {PAYMENT_STATUS_LABEL[status]}
    </Badge>
  );
}

export function DistributionStatusBadge({
  status,
}: {
  status: DistributionStatus;
}) {
  return (
    <Badge tone={DISTRIBUTION_STATUS_TONE[status]}>
      {DISTRIBUTION_STATUS_LABEL[status]}
    </Badge>
  );
}
