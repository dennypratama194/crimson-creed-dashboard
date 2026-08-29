import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingDashboard() {
  return (
    <>
      <PageHeader title="Dashboard" description="Loading…" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="mt-6 h-64 rounded-xl" />
    </>
  );
}
