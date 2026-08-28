import type { Metadata } from "next";

import { getOrganizationSettings } from "@/lib/db/settings";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/app/(app)/admin/settings/settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const settings = await getOrganizationSettings();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Organization display. Theme is a personal preference in the top bar."
      />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <SettingsForm settings={settings} />
        </CardContent>
      </Card>
    </>
  );
}
