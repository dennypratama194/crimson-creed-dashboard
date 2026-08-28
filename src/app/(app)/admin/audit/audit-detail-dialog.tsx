"use client";

import type { Json } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function JsonBlock({ label, value }: { label: string; value: Json | null }) {
  if (value == null) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase">
        {label}
      </span>
      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditDetailDialog({
  action,
  oldValues,
  newValues,
}: {
  action: string;
  oldValues: Json | null;
  newValues: Json | null;
}) {
  if (oldValues == null && newValues == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          View
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{action}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <JsonBlock label="Before" value={oldValues} />
          <JsonBlock label="After" value={newValues} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
