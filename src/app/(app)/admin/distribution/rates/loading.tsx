import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingDistributionRates() {
  return (
    <>
      <div className="pb-4">
        <Skeleton className="h-8 w-32" />
      </div>
      <PageHeader
        title="Company cut"
        description="What a member owes the company per unit drawn. Set a cut to make a stash item drawable; catalogue items are never drawable."
      />
      <div className="overflow-hidden rounded-xl border border-border">
        <Skeleton className="h-10 w-full rounded-none" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="mx-4 my-3 h-6"
            style={{ width: `${70 + ((i * 7) % 25)}%` }}
          />
        ))}
      </div>
    </>
  );
}
