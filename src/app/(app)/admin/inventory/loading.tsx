import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingInventory() {
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Current stock levels for the catalogue."
      />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <div className="overflow-hidden rounded-xl border border-border">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="mx-4 my-3 h-6" />
          ))}
        </div>
      </div>
    </>
  );
}
