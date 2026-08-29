"use client";

/**
 * DEVELOPMENT ONLY — one-click sign-in with seeded accounts.
 *
 * Rendered by login/page.tsx only when NODE_ENV === "development", so it is
 * never included in a production build. To remove entirely: delete this file
 * and the <DevQuickLogin /> block in login/page.tsx.
 */

import { useState, useTransition } from "react";

import { signIn } from "@/lib/auth/actions";
import { IDLE_FORM_STATE } from "@/lib/forms";
import { Button } from "@/components/ui/button";

type Account = {
  label: string;
  hint: string;
  username: string;
  password: string;
};

const ACCOUNTS: Account[] = [
  {
    label: "Super Admin",
    hint: "vincent_crane · Boss",
    username: "vincent_crane",
    password: "Crimson#vincent1",
  },
  {
    label: "Member",
    hint: "sable_ruiz · Secretary",
    username: "sable_ruiz",
    password: "Crimson#sable1",
  },
  {
    label: "Member · inactive",
    hint: "hugo_marsh · login is blocked",
    username: "hugo_marsh",
    password: "Crimson#hugo1",
  },
];

export function DevQuickLogin({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const [busyUsername, setBusyUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loginAs(account: Account) {
    setError(null);
    setBusyUsername(account.username);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("username", account.username);
      formData.set("password", account.password);
      formData.set("remember", "on");
      if (next) formData.set("next", next);

      const result = await signIn(IDLE_FORM_STATE, formData);
      // On success signIn() redirects and never returns here.
      if (result && !result.ok) {
        setError(result.error ?? "Sign-in failed.");
        setBusyUsername(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold tracking-wide uppercase">
          Dev shortcuts
        </span>
        <span className="text-xs text-muted-foreground">
          Test accounts. Not shown in production builds.
        </span>
      </div>

      {error ? <p className="text-xs text-tone-error-fg">{error}</p> : null}

      <div className="flex flex-col gap-2">
        {ACCOUNTS.map((account) => (
          <Button
            key={account.username}
            type="button"
            variant="secondary"
            size="sm"
            className="justify-between"
            disabled={pending}
            onClick={() => loginAs(account)}
          >
            <span>{account.label}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {busyUsername === account.username ? "Signing in…" : account.hint}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
