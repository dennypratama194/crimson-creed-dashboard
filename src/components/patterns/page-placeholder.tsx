import { Hammer } from "lucide-react";

import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";

/** Temporary content for routes whose feature is implemented in a later phase. */
export function PagePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description?: string;
  phase: number;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={Hammer}
        title="Not built yet"
        description={`This screen is implemented in Phase ${phase}.`}
      />
    </>
  );
}
