import Image from "next/image";
import Link from "next/link";
import { brand } from "@/lib/brand";

export function Brand() {
  return (
    <Link
      href="/dashboard"
      aria-label={brand.name}
      className="flex items-center gap-2.5"
    >
      {brand.mark ? (
        <Image
          src={brand.mark}
          alt=""
          width={30}
          height={30}
          priority
          unoptimized
          className="rounded-md"
        />
      ) : null}
      <span className="text-sm font-semibold tracking-tight">{brand.name}</span>
    </Link>
  );
}
