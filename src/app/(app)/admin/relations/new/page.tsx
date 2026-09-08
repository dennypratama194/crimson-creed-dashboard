import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { listMemberOptions } from "@/lib/db/members";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { RelationForm } from "@/app/(app)/admin/relations/relation-form";

export const metadata: Metadata = { title: "New relation" };

export default async function NewRelationPage() {
  const members = await listMemberOptions();

  return (
    <>
      <div className="pb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/relations">
            <ArrowLeft aria-hidden />
            Relations
          </Link>
        </Button>
      </div>

      <PageHeader
        title="New relation"
        description="Add someone connected to the organisation."
      />
      <RelationForm members={members} />
    </>
  );
}
