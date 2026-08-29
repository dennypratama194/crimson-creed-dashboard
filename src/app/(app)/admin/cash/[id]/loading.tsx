import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingCashEntry() {
  return (
    <>
      <PageHeader title="Cash entry" />
      <div className="flex max-w-2xl flex-col gap-6">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </>
  );
}
