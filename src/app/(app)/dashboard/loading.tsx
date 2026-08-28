import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingDashboard() {
  return (
    <>
      <PageHeader title="Dashboard" description="Loading…" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl lg:col-span-2" />
      </div>
    </>
  );
}
