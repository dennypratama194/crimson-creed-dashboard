/**
 * Placeholder root route for Phase 0. In Phase 2 this becomes an auth-aware
 * redirect: signed-in -> /dashboard, otherwise -> /login.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[1536px] flex-col items-center justify-center gap-4 px-6 text-center md:px-12 lg:px-20">
      <p className="rounded-full border border-tone-brand-border bg-tone-brand-bg px-3 py-1 text-xs font-medium tracking-wide text-tone-brand-fg uppercase">
        Phase 0 · Scaffold
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Crimson Creed Operations System
      </h1>
      <p className="max-w-prose leading-relaxed text-muted-foreground">
        Project foundation is in place. Authentication, the application shell,
        and feature modules are implemented in later phases.
      </p>
    </main>
  );
}
