"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn } from "@/lib/auth/actions";
import type { FormState } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

const INITIAL: FormState = { ok: false };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-tone-error-border bg-tone-error-bg px-3 py-2 text-sm text-tone-error-fg"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          aria-invalid={Boolean(state.fieldErrors?.username)}
          aria-describedby={
            state.fieldErrors?.username ? "username-error" : undefined
          }
        />
        {state.fieldErrors?.username ? (
          <p id="username-error" className="text-xs text-tone-error-fg">
            {state.fieldErrors.username}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={
            state.fieldErrors?.password ? "password-error" : undefined
          }
        />
        {state.fieldErrors?.password ? (
          <p id="password-error" className="text-xs text-tone-error-fg">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="remember" name="remember" value="on" />
        <Label htmlFor="remember" className="text-sm font-normal">
          Keep me signed in on this device
        </Label>
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="mt-1 w-full"
      >
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
