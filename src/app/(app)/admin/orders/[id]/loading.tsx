import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingAdminOrder() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
