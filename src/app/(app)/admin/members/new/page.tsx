import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { MemberForm } from "@/app/(app)/admin/members/member-form";

export const metadata: Metadata = { title: "New member" };

export default function NewMemberPage() {
  return (
    <>
      <PageHeader
        title="New member"
        description="Create an account and hand the credentials to the member."
      />
      <MemberForm />
    </>
  );
}
