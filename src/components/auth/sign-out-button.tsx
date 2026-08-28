"use client";

import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm">
        <LogOut aria-hidden />
        Sign out
      </Button>
    </form>
  );
}
