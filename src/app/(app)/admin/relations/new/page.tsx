import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { RelationForm } from "@/app/(app)/admin/relations/relation-form";

export const metadata: Metadata = { title: "New relation" };

export default function NewRelationPage() {
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
      <RelationForm />
    </>
  );
}
