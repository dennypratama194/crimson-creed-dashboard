import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingOrders() {
  return (
    <>
      <PageHeader
        title="Orders"
        description="Your orders and where each one stands."
      />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-56" />
        <div className="overflow-hidden rounded-xl border border-border">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="mx-4 my-3 h-6" />
          ))}
        </div>
      </div>
    </>
  );
}
