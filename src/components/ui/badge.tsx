import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        gray: "border-tone-gray-border bg-tone-gray-bg text-tone-gray-fg",
        brand: "border-tone-brand-border bg-tone-brand-bg text-tone-brand-fg",
        success:
          "border-tone-success-border bg-tone-success-bg text-tone-success-fg",
        warning:
          "border-tone-warning-border bg-tone-warning-bg text-tone-warning-fg",
        error: "border-tone-error-border bg-tone-error-bg text-tone-error-fg",
        info: "border-tone-info-border bg-tone-info-bg text-tone-info-fg",
      },
    },
    defaultVariants: { tone: "gray" },
  },
);

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
