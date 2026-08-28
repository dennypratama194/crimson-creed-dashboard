import type { Metadata } from "next";
import Image from "next/image";

import { DevQuickLogin } from "./dev-quick-login";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERROR_MESSAGES: Record<string, string> = {
  inactive: "This account is inactive. Contact a Super Admin.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const notice = errorKey ? ERROR_MESSAGES[errorKey] : undefined;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <Image
          src="/logo.webp"
          alt="Crimson Creed"
          width={104}
          height={159}
          priority
        />
        <h1 className="text-2xl font-semibold tracking-tight">
          Operations System
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in with the credentials issued by a Super Admin.
        </p>
      </header>

      {notice ? (
        <p
          role="status"
          className="rounded-md border border-tone-warning-border bg-tone-warning-bg px-3 py-2 text-sm text-tone-warning-fg"
        >
          {notice}
        </p>
      ) : null}

      <LoginForm next={next} />

      {/* DEV ONLY — remove this block (and dev-quick-login.tsx) for production. */}
      {process.env.NODE_ENV === "development" ? (
        <DevQuickLogin next={next} />
      ) : null}
    </div>
  );
}
