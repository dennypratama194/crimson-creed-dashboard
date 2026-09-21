"use client";

import { CheckCheck } from "lucide-react";
import { useTransition } from "react";

import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { markAllNotificationsRead } from "@/app/(app)/notifications/actions";

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsRead();
          if (result && !result.ok) {
            toast.error(result.error ?? "Could not update notifications.");
          } else {
            toast.success("All notifications marked as read.");
          }
        })
      }
    >
      <CheckCheck aria-hidden />
      {pending ? "Marking…" : "Mark all read"}
    </Button>
  );
}
