import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-svh place-items-center px-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">
          404
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="text-sm text-muted-foreground">
          That page doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}
