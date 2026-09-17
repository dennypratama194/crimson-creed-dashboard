import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOut } from "@/lib/auth/actions";
import { getAccountState } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account unavailable" };

/**
 * Where a still-valid session lands when it cannot use the app: the member was
 * deactivated while signed in, or the auth user has no member row at all.
 *
 * It reads no application data beyond the caller's own member status, and it
 * never writes cookies during render — signing out is a Server Action, which
 * is where Next.js allows the session cookies to be cleared.
 */
export default async function AccountUnavailablePage() {
  const state = await getAccountState();

  if (state.kind === "signed-out") redirect("/login");
  if (state.kind === "active") redirect("/dashboard");

  const body =
    state.kind === "inactive"
      ? "This account has been deactivated. Contact a Super Admin if you think this is a mistake."
      : "This sign-in is not linked to a member profile. Contact a Super Admin to have it set up.";

  return (
    <div className="flex flex-col gap-6 text-center">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Account unavailable
        </h1>
        <p className="text-sm text-muted-foreground">{body}</p>
      </header>
      <form action={signOut}>
        <Button type="submit" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
