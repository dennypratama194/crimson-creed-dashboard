import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingProductionRates() {
  return (
    <>
      <PageHeader
        title="Production pay rates"
        description="Piece-rate pay per product. Members can only log products that have a rate."
      />
      <div className="overflow-hidden rounded-xl border border-border">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton
            key={i}
            className="mx-4 my-3 h-6"
            style={{ width: `${60 + ((i * 9) % 30)}%` }}
          />
        ))}
      </div>
    </>
  );
}
