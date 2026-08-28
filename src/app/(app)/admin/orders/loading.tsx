import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingAdminOrders() {
  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order, with its payment and distribution workflow."
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 w-48" />
        </div>
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
