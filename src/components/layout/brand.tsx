import Link from "next/link";

export function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2">
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
      >
        C
      </span>
      <span className="text-sm font-semibold tracking-tight">
        Crimson Creed
      </span>
    </Link>
  );
}
