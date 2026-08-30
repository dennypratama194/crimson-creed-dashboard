import Image from "next/image";
import Link from "next/link";

export function Brand() {
  return (
    <Link
      href="/dashboard"
      aria-label="Crimson Creed"
      className="flex items-center gap-2.5"
    >
      <Image
        src="/logo-mark.png"
        alt="Crimson Creed"
        width={30}
        height={30}
        priority
        className="rounded-md"
      />
      <span className="text-sm font-semibold tracking-tight">
        Crimson Creed
      </span>
    </Link>
  );
}
