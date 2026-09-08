import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { listMemberOptions } from "@/lib/db/members";
import { getRelation } from "@/lib/db/relations";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { RelationForm } from "@/app/(app)/admin/relations/relation-form";

export const metadata: Metadata = { title: "Edit relation" };

export default async function EditRelationPage({
  params,
}: PageProps<"/admin/relations/[id]/edit">) {
  const { id } = await params;
  const [relation, members] = await Promise.all([
    getRelation(id),
    listMemberOptions(),
  ]);
  if (!relation) notFound();

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
        title={`Edit ${relation.name}`}
        description="Update this relation's details."
      />
      <RelationForm relation={relation} members={members} />
    </>
  );
}
