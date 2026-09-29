import { PageHeader } from "@/components/patterns/page-header";
import { FivemSkeleton } from "@/app/(app)/admin/fivem/fivem-skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="FiveM server" />
      <FivemSkeleton />
    </>
  );
}
